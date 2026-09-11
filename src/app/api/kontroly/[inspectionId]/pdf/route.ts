import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const ascii = (value: unknown) =>
  String(value ?? "-")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
type Snapshot = {
  equipment?: Record<string, unknown>;
  requirement?: Record<string, unknown>;
  checklist?: {
    name?: string;
    version?: number;
    sections?: {
      title: string;
      items: { label: string; value?: unknown; unit?: string; note?: string }[];
    }[];
  };
  inspection?: Record<string, unknown>;
};

export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/kontroly/[inspectionId]/pdf">,
) {
  if (!(await getCurrentUser()))
    return new Response("Nepřihlášený uživatel", { status: 401 });
  const { inspectionId } = await params;
  const protocol = await prisma.protocol.findUnique({
    where: { inspectionId },
  });
  if (!protocol) return new Response("Protokol nebyl nalezen", { status: 404 });
  const snapshot = protocol.snapshot as Snapshot;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([595, 842]),
    y = 800;
  const line = (
    text: unknown,
    options: { size?: number; strong?: boolean; gap?: number } = {},
  ) => {
    const size = options.size ?? 10,
      gap = options.gap ?? 15;
    if (y < 55) {
      page = pdf.addPage([595, 842]);
      y = 800;
    }
    page.drawText(ascii(text).slice(0, 105), {
      x: 45,
      y,
      size,
      font: options.strong ? bold : font,
      color: rgb(0.08, 0.12, 0.16),
    });
    y -= gap;
  };
  line("HZS CEPRO", { strong: true, size: 12 });
  line("Technicka sluzba - Mstetice", { size: 10, gap: 28 });
  line("PROTOKOL O KONTROLE TECHNICKEHO PROSTREDKU", {
    strong: true,
    size: 15,
    gap: 24,
  });
  line(`Cislo: ${protocol.number}`, { strong: true, gap: 26 });
  line("IDENTIFIKACE PROSTREDKU", { strong: true, size: 12, gap: 19 });
  for (const [key, value] of Object.entries(snapshot.equipment ?? {}))
    if (value != null) line(`${key}: ${value}`);
  y -= 8;
  line("DRUH KONTROLY A ZDROJ POZADAVKU", { strong: true, size: 12, gap: 19 });
  for (const [key, value] of Object.entries(snapshot.requirement ?? {}))
    if (value != null) line(`${key}: ${value}`);
  y -= 8;
  line(
    `KONTROLNI BODY - ${snapshot.checklist?.name ?? "Checklist"}, verze ${snapshot.checklist?.version ?? "-"}`,
    { strong: true, size: 12, gap: 20 },
  );
  for (const section of snapshot.checklist?.sections ?? []) {
    line(section.title, { strong: true, gap: 18 });
    for (const item of section.items) {
      line(
        `${item.label}: ${item.value ?? "-"}${item.unit ? ` ${item.unit}` : ""}`,
      );
      if (item.note) line(`  Poznamka: ${item.note}`, { size: 9 });
    }
    y -= 4;
  }
  y -= 8;
  line("VYSLEDEK A POTVRZENI", { strong: true, size: 12, gap: 19 });
  for (const [key, value] of Object.entries(snapshot.inspection ?? {}))
    if (value != null) line(`${key}: ${value}`);
  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${protocol.number}.pdf"`,
      "cache-control": "private, no-store",
    },
  });
}
