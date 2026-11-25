import { getCurrentUser } from "@/lib/auth";
import { operationalPermissions } from "@/lib/operational-authorization";
import { prisma } from "@/lib/prisma";
import { operationalSnapshot } from "@/lib/operational-snapshot";
import {
  mergePdfDocuments,
  renderOperationalPdf,
  operationalPdfFilename,
  type OperationalPdfSnapshot,
} from "@/lib/operational-pdf";
import { pdfFonts } from "@/lib/pdf-fonts";
import { getStorage } from "@/lib/storage";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
export const dynamic = "force-dynamic";

async function attachmentContent(
  id: string,
  snapshot: OperationalPdfSnapshot,
  ownerPrefix: "OperationalProtocol:" | "OperationalFollowup:",
) {
  const photographs: {
    fileName: string;
    bytes: Uint8Array;
    mimeType: "image/jpeg" | "image/png";
  }[] = [];
  const attachedPdfs: Uint8Array[] = [];
  for (const reference of snapshot.attachments ?? []) {
    const attachment = await prisma.attachment.findFirst({
      where: {
        id: reference.id,
        ownerId: id,
        checksumSha256: reference.checksum,
        ownerType: { startsWith: ownerPrefix },
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
    } else if (attachment?.mimeType === "application/pdf") {
      const body = await getStorage().get(attachment.storageKey);
      try {
        await PDFDocument.load(body);
        attachedPdfs.push(new Uint8Array(body));
      } catch (error) {
        console.error("PDF přílohu nelze načíst do protokolu", {
          id,
          attachmentId: attachment.id,
          error,
        });
      }
    }
  }
  return { photographs, attachedPdfs };
}

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
    const searchParams = new URL(request.url).searchParams;
    const followup = searchParams.get("navazujici") === "1";
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
    const endorsement = searchParams.get("dolozka") === "1";
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
    const appendix = followup || searchParams.get("priloha") === "A";
    const { photographs, attachedPdfs } = await attachmentContent(
      id,
      snapshot,
      followup ? "OperationalFollowup:" : "OperationalProtocol:",
    );
    const fonts = await pdfFonts();
    const result = await renderOperationalPdf({
      snapshot,
      ...fonts,
      draft: doc.status === "DRAFT",
      cancelled: doc.status === "CANCELLED",
      appendix,
      photographs,
    });
    if (appendix && !result.hasAppendix)
      return new Response("Tento dokument nemá pokračování v příloze A.", {
        status: 404,
      });
    const pdfParts = [result.bytes];
    if (!appendix && result.hasAppendix) {
      const annex = await renderOperationalPdf({
        snapshot,
        ...fonts,
        draft: doc.status === "DRAFT",
        cancelled: doc.status === "CANCELLED",
        appendix: true,
        photographs,
      });
      pdfParts.push(annex.bytes);
    }
    pdfParts.push(...attachedPdfs);
    if (
      !appendix &&
      doc.status !== "DRAFT" &&
      searchParams.get("original") !== "1"
    ) {
      const followupAttachments = await prisma.attachment.findMany({
        where: {
          ownerId: id,
          ownerType: { startsWith: "OperationalFollowup:" },
          archivedAt: null,
        },
        orderBy: { createdAt: "asc" },
      });
      if (followupAttachments.length) {
        const followupSnapshot: OperationalPdfSnapshot = {
          ...snapshot,
          title: "Navazující fotodokumentace a přílohy",
          data: {
            note: `Dodatečná dokumentace k ${doc.number}. Nebyla součástí původního vystavení.`,
          },
          attachments: followupAttachments.map((attachment) => ({
            id: attachment.id,
            fileName: attachment.fileName,
            checksum: attachment.checksumSha256,
            mimeType: attachment.mimeType,
          })),
        };
        const followupContent = await attachmentContent(
          id,
          followupSnapshot,
          "OperationalFollowup:",
        );
        const followupPdf = await renderOperationalPdf({
          snapshot: followupSnapshot,
          ...fonts,
          cancelled: doc.status === "CANCELLED",
          appendix: true,
          photographs: followupContent.photographs,
        });
        pdfParts.push(followupPdf.bytes, ...followupContent.attachedPdfs);
      }
    }
    const output =
      pdfParts.length === 1 ? pdfParts[0] : await mergePdfDocuments(pdfParts);
    return new Response(Buffer.from(output), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `${searchParams.get("zobrazeni") === "tisk" ? "inline" : "attachment"}; filename="${operationalPdfFilename(snapshot, appendix).replace(/\.pdf$/, followup ? "_Navazujici-dokumentace.pdf" : endorsement ? "_Schvalovaci-dolozka.pdf" : ".pdf")}"`,
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
