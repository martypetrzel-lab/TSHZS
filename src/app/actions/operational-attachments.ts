"use server";
import { revalidatePath } from "next/cache";
import { requireOperationalPermission } from "@/lib/operational-authorization";
import { authorizeAttachmentOwner } from "@/lib/operational-attachments";
import { attachmentKinds } from "@/lib/operational-fields";
import { getStorage } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import sharp from "sharp";

export async function uploadOperationalAttachment(form: FormData) {
  const root = String(form.get("ownerType") ?? "");
  const user = await requireOperationalPermission(
    root === "RepairCase" ? "repair:manage" : "protocol:edit_draft",
  );
  const ownerId = String(form.get("ownerId") ?? ""),
    kind = String(form.get("kind") ?? "OTHER");
  if (
    !["RepairCase", "OperationalProtocol"].includes(root) ||
    !Object.hasOwn(attachmentKinds, kind) ||
    !(await authorizeAttachmentOwner(user.organizationId, root, ownerId))
  )
    throw new Error("Přílohu nelze přiřadit k tomuto záznamu.");
  if (root === "OperationalProtocol") {
    const doc = await prisma.operationalProtocol.findFirst({ where: { id: ownerId, organizationId: user.organizationId } });
    if (doc?.status === "DRAFT" && doc.createdById !== user.id) throw new Error("Přílohy rozpracovaného dokumentu může měnit pouze jeho autor.");
  }
  const selected = form.get("file"),
    camera = form.get("fileCamera");
  const file =
    selected instanceof File && selected.size > 0 ? selected : camera;
  if (
    !(file instanceof File) ||
    file.size === 0 ||
    file.size > 20 * 1024 * 1024
  )
    throw new Error("Vyberte PDF nebo fotografii do 20 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = Buffer.from(bytes.subarray(0, 12));
  const detected =
    signature.subarray(0, 5).toString() === "%PDF-"
      ? "application/pdf"
      : signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff
        ? "image/jpeg"
        : signature
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? "image/png"
          : signature.subarray(0, 4).toString() === "RIFF" &&
              signature.subarray(8, 12).toString() === "WEBP"
            ? "image/webp"
            : null;
  if (!detected || detected !== file.type)
    throw new Error(
      "Obsah souboru neodpovídá podporovanému typu PDF/JPEG/PNG/WebP.",
    );
  if (detected.startsWith("image/")) {
    try {
      await sharp(bytes, { limitInputPixels: 25000000 }).metadata();
    } catch {
      throw new Error(
        "Fotografie je poškozená nebo má příliš velké rozlišení (nejvýše 25 megapixelů).",
      );
    }
  }
  const equipmentId = String(form.get("equipmentId") ?? "");
  if (
    equipmentId &&
    root === "OperationalProtocol" &&
    !(await prisma.operationalProtocolItem.findFirst({
      where: { protocolId: ownerId, equipmentId },
    }))
  )
    throw new Error("Fotografie nepatří k prostředku v dokumentu.");
  const stored = await getStorage().put({
    body: bytes,
    fileName: file.name,
    mimeType: detected,
    namespace: `operations/${ownerId}`,
  });
  try {
    await prisma.$transaction(
      async (tx) => {
        const doc =
          root === "OperationalProtocol"
            ? await tx.operationalProtocol.findFirst({
                where: { id: ownerId, organizationId: user.organizationId },
              })
            : null;
        if (root === "OperationalProtocol" && !doc)
          throw new Error("Dokument neexistuje.");
        const ownerType = `${root === "OperationalProtocol" && doc?.status !== "DRAFT" ? "OperationalFollowup" : root}:${kind}${equipmentId ? `:${equipmentId}` : ""}`;
        await tx.attachment.create({
          data: {
            ownerType,
            ownerId,
            fileName: file.name,
            mimeType: detected,
            sizeBytes: stored.sizeBytes,
            storageKey: stored.storageKey,
            checksumSha256: stored.checksumSha256,
            uploadedById: user.id,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: user.id,
            action: "ATTACHMENT_UPLOADED",
            entityType: root,
            entityId: ownerId,
            newValue: {
              kind,
              fileName: file.name,
              checksum: stored.checksumSha256,
            },
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    await getStorage()
      .delete(stored.storageKey)
      .catch(() =>
        console.error("Neúspěšná kompenzace souboru", {
          storageKey: stored.storageKey,
        }),
      );
    throw error;
  }
  revalidatePath(
    root === "RepairCase"
      ? `/zavady/${ownerId}`
      : `/protokoly/provozni/${ownerId}`,
  );
}
