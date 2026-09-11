import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  protocolDownloadFilename,
  renderProtocolPdf,
  type ProtocolSnapshot,
} from "@/lib/protocol-pdf";

export const dynamic = "force-dynamic";

const fontPath = (weight: 400 | 700) =>
  join(
    process.cwd(),
    "node_modules",
    "dejavu-fonts-ttf",
    "ttf",
    weight === 700 ? "DejaVuSans-Bold.ttf" : "DejaVuSans.ttf",
  );

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/kontroly/[inspectionId]/pdf">,
) {
  if (!(await getCurrentUser()))
    return new Response("Nepřihlášený uživatel", { status: 401 });
  const { inspectionId } = await params;
  const protocol = await prisma.protocol.findUnique({
    where: { inspectionId },
    select: { number: true, snapshot: true },
  });
  if (!protocol) return new Response("Protokol nebyl nalezen", { status: 404 });
  try {
    const [regularFont, boldFont] = await Promise.all([
      readFile(fontPath(400)),
      readFile(fontPath(700)),
    ]);
    const snapshot = protocol.snapshot as ProtocolSnapshot;
    const bytes = await renderProtocolPdf({
      number: protocol.number,
      snapshot,
      regularFont,
      boldFont,
    });
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${protocolDownloadFilename(snapshot, protocol.number)}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Generování PDF protokolu selhalo.", {
      protocolNumber: protocol.number,
      error,
    });
    return new Response("PDF protokol se nepodařilo vytvořit.", {
      status: 500,
    });
  }
}
