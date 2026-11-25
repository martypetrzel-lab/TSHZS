import { getCurrentUser } from "@/lib/auth";
import { operationalPermissions } from "@/lib/operational-authorization";
import { prisma } from "@/lib/prisma";
import { operationalSnapshot } from "@/lib/operational-snapshot";
import {
  renderOperationalPdf,
  operationalPdfFilename,
  type OperationalPdfSnapshot,
} from "@/lib/operational-pdf";
import { pdfFonts } from "@/lib/pdf-fonts";
import { getStorage } from "@/lib/storage";
import sharp from "sharp";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Přihlaste se.", { status: 401 });
  const permissions = await operationalPermissions(user.id);
  if (!permissions.has("protocol:download"))
    return new Response("Chybí oprávnění ke stažení.", { status: 403 });
  const { id } = await params;
  const doc = await prisma.operationalProtocol.findFirst({
    where: { id, organizationId: user.organizationId },
  });
  if (
    !doc ||
    (doc.status === "DRAFT" &&
      doc.createdById !== user.id &&
      !permissions.has("protocol:edit_draft"))
  )
    return new Response("Dokument nenalezen.", { status: 404 });
  try {
    let snapshot =
      doc.status === "DRAFT"
        ? await operationalSnapshot(prisma, id, user.displayName)
        : (doc.snapshot as unknown as OperationalPdfSnapshot);
    const followup =
      new URL(request.url).searchParams.get("navazujici") === "1";
    if (followup) {
      const attachments = await prisma.attachment.findMany({
        where: {
          ownerId: id,
          ownerType: { startsWith: "OperationalFollowup:" },
          archivedAt: null,
        },
        orderBy: { createdAt: "asc" },
      });
      if (!attachments.length)
        return new Response("Navazující dokumentace nebyla přiložena.", {
          status: 404,
        });
      snapshot = {
        ...snapshot,
        title: "Navazující fotodokumentace a přílohy",
        data: {
          note: `Dodatečná dokumentace k ${doc.number}. Tato příloha nebyla součástí původního vystavení.`,
        },
        attachments: attachments.map((a) => ({
          id: a.id,
          fileName: a.fileName,
          checksum: a.checksumSha256,
          mimeType: a.mimeType,
        })),
      };
    }
    const endorsement =
      new URL(request.url).searchParams.get("dolozka") === "1";
    if (endorsement) {
      const decision = await prisma.repairDecision.findUnique({
        where: { protocolId: id },
      });
      if (!decision)
        return new Response("Schvalovací doložka není dostupná.", {
          status: 404,
        });
      const actor = await prisma.user.findUnique({
        where: { id: decision.decidedById },
        select: { displayName: true },
      });
      snapshot = {
        ...snapshot,
        title: "Návrh opravy se schvalovací doložkou",
        data: {
          approvalDecision: `${decision.decision === "APPROVED" ? "Schváleno" : decision.decision === "REJECTED" ? "Neschváleno" : "Vráceno k doplnění"} · ${actor?.displayName ?? "Oprávněná osoba"} · ${decision.decidedAt.toLocaleString("cs-CZ", { timeZone: "Europe/Prague" })} · Limit: ${decision.approvedLimit?.toFixed(2) ?? "—"} · ${decision.reason} · ${decision.conditions ?? ""}`,
          ...snapshot.data,
        },
      };
    }
    const appendix =
      followup || new URL(request.url).searchParams.get("priloha") === "A";
    const photographs: {
      fileName: string;
      bytes: Uint8Array;
      mimeType: "image/jpeg" | "image/png";
    }[] = [];
    if (appendix)
      for (const reference of snapshot.attachments ?? []) {
        const attachment = await prisma.attachment.findFirst({
          where: {
            id: reference.id,
            ownerId: id,
            checksumSha256: reference.checksum,
            ownerType: {
              startsWith: followup
                ? "OperationalFollowup:"
                : "OperationalProtocol:",
            },
            archivedAt: null,
          },
        });
        if (attachment?.mimeType.startsWith("image/")) {
          const body = await getStorage().get(attachment.storageKey);
          const bytes = await sharp(body, { limitInputPixels: 25000000 })
            .rotate()
            .resize({
              width: 1800,
              height: 1800,
              fit: "inside",
              withoutEnlargement: true,
            })
            .jpeg({ quality: 86 })
            .toBuffer();
          photographs.push({
            fileName: attachment.fileName,
            bytes,
            mimeType: "image/jpeg",
          });
        }
      }
    const result = await renderOperationalPdf({
      snapshot,
      ...(await pdfFonts()),
      draft: doc.status === "DRAFT",
      cancelled: doc.status === "CANCELLED",
      appendix,
      photographs,
    });
    if (appendix && !result.hasAppendix)
      return new Response("Tento dokument nemá pokračování v příloze A.", {
        status: 404,
      });
    return new Response(Buffer.from(result.bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${new URL(request.url).searchParams.get("zobrazeni") === "tisk" ? "inline" : "attachment"}; filename="${operationalPdfFilename(snapshot, appendix).replace(/\.pdf$/, followup ? "_Navazujici-dokumentace.pdf" : endorsement ? "_Schvalovaci-dolozka.pdf" : ".pdf")}"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("PDF provozního dokumentu selhalo", { id, error });
    return new Response(
      "PDF nelze vytvořit. Zkontrolujte rozsah údajů nebo kontaktujte správce.",
      { status: 422 },
    );
  }
}
