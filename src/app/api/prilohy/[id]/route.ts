import { getCurrentUser } from "@/lib/auth";
import { operationalPermissions } from "@/lib/operational-authorization";
import { authorizeAttachmentOwner } from "@/lib/operational-attachments";
import { prisma } from "@/lib/prisma";
import { getStorage } from "@/lib/storage";
export const dynamic = "force-dynamic";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Přihlaste se.", { status: 401 });
  const attachment = await prisma.attachment.findFirst({
    where: { id: (await params).id, archivedAt: null },
  });
  if (
    !attachment ||
    !(await authorizeAttachmentOwner(
      user.organizationId,
      attachment.ownerType,
      attachment.ownerId,
    ))
  )
    return new Response("Příloha nenalezena.", { status: 404 });
  const permissions = await operationalPermissions(user.id);
  if (
    !permissions.has(
      attachment.ownerType.startsWith("RepairCase")
        ? "repair:manage"
        : "protocol:download",
    )
  )
    return new Response("Chybí oprávnění.", { status: 403 });
  if (
    process.env.STORAGE_PROVIDER !== "local" &&
    (process.env.STORAGE_PROVIDER || process.env.NODE_ENV === "production")
  )
    return Response.redirect(
      await getStorage().getDownloadUrl(attachment.storageKey, 60),
    );
  return new Response(Buffer.from(await getStorage().get(attachment.storageKey)), {
    headers: {
      "content-type": attachment.mimeType,
      "content-disposition": `attachment; filename="dokument"; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
