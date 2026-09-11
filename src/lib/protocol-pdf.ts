import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type ProtocolSnapshot = {
  equipment?: {
    name?: unknown;
    uid?: unknown;
    legacyId?: unknown;
    registrationNumber?: unknown;
    serialNumber?: unknown;
    manufacturer?: unknown;
    model?: unknown;
    vehicle?: unknown;
    location?: unknown;
  };
  requirement?: {
    name?: unknown;
    type?: unknown;
    intervalValue?: unknown;
    intervalUnit?: unknown;
    source?: unknown;
    sourceDocument?: unknown;
    article?: unknown;
  };
  checklist?: {
    name?: string;
    sections?: {
      title: string;
      items: {
        label: string;
        responseType?: string;
        value?: unknown;
        unit?: string;
        note?: string | null;
      }[];
    }[];
  };
  inspection?: {
    inspector?: unknown;
    completedAt?: unknown;
    performedAt?: unknown;
    protocolDate?: unknown;
    result?: unknown;
    limitationReason?: unknown;
    note?: unknown;
    nextDueAt?: unknown;
  };
  defects?: { label?: unknown; description?: unknown; severity?: unknown }[];
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 44;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const navy = rgb(0.08, 0.2, 0.31);
const blue = rgb(0.12, 0.39, 0.58);
const paleBlue = rgb(0.93, 0.96, 0.98);
const gray = rgb(0.34, 0.39, 0.43);
const lightGray = rgb(0.86, 0.88, 0.9);
const green = rgb(0.08, 0.45, 0.25);
const red = rgb(0.7, 0.12, 0.12);
const amber = rgb(0.67, 0.39, 0.03);

const text = (value: unknown, fallback = "—") => {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
};

function filenamePart(value: unknown, maxLength: number) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
}

export function protocolDownloadFilename(
  snapshot: ProtocolSnapshot,
  protocolNumber: string,
) {
  const equipmentName = filenamePart(snapshot.equipment?.name, 80);
  const uid = filenamePart(snapshot.equipment?.uid, 80);
  const base = equipmentName || `Technicky-prostredek-${uid || "bez-UID"}`;
  return `${base}_${protocolNumber}.pdf`;
}

export function formatProtocolDate(value: unknown, withTime = false) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  const datePart = new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(date);
  if (!withTime) return datePart;
  const timePart = new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${datePart}, ${timePart}`;
}

function plural(value: number, one: string, few: string, many: string) {
  if (value === 1) return one;
  if (value >= 2 && value <= 4) return few;
  return many;
}

export function formatProtocolInterval(value: unknown, unit: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const labels: Record<string, [string, string, string]> = {
    DAYS: ["den", "dny", "dní"],
    WEEKS: ["týden", "týdny", "týdnů"],
    MONTHS: ["měsíc", "měsíce", "měsíců"],
    YEARS: ["rok", "roky", "let"],
    OPERATING_HOURS: ["motohodina", "motohodiny", "motohodin"],
    USAGE_COUNT: ["použití", "použití", "použití"],
  };
  const forms = labels[String(unit)];
  return forms ? `${number} ${plural(number, ...forms)}` : String(number);
}

export function protocolResultLabel(value: unknown) {
  return (
    {
      PASSED: "VYHOVUJE",
      FAILED: "NEVYHOVUJE",
      PASSED_WITH_LIMITATION: "VYHOVUJE S OMEZENÍM",
    }[String(value)] ?? text(value)
  );
}

function checklistValue(value: unknown) {
  if (value === "NERELEVANTNÍ" || value === "NA") return "NERELEVANTNÍ";
  if (value === "PASSED" || value === "VYHOVUJE") return "✓ VYHOVUJE";
  if (value === "FAILED" || value === "NEVYHOVUJE") return "✕ NEVYHOVUJE";
  if (value === true || value === "true") return "ANO";
  if (value === false || value === "false") return "NE";
  return text(value);
}

function wrap(value: string, font: PDFFont, size: number, maxWidth: number) {
  const paragraphs = value.split(/\r?\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = words.shift()!;
    for (const word of words) {
      const candidate = `${line} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function renderProtocolPdf(input: {
  number: string;
  snapshot: ProtocolSnapshot;
  regularFont: Uint8Array;
  boldFont: Uint8Array;
}) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(input.regularFont, { subset: true });
  const bold = await pdf.embedFont(input.boldFont, { subset: true });
  let page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const pages: PDFPage[] = [page];
  let y = PAGE_HEIGHT - 46;

  const addPage = () => {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    y = PAGE_HEIGHT - 46;
  };
  const ensure = (height: number) => {
    if (y - height < 52) addPage();
  };
  const drawLines = (
    value: string,
    options: {
      x?: number;
      width?: number;
      size?: number;
      lineHeight?: number;
      font?: PDFFont;
      color?: ReturnType<typeof rgb>;
    } = {},
  ) => {
    const x = options.x ?? MARGIN;
    const size = options.size ?? 9;
    const lineHeight = options.lineHeight ?? size * 1.35;
    const selectedFont = options.font ?? regular;
    const lines = wrap(
      value,
      selectedFont,
      size,
      options.width ?? CONTENT_WIDTH,
    );
    ensure(lines.length * lineHeight);
    for (const line of lines) {
      page.drawText(line, {
        x,
        y,
        size,
        font: selectedFont,
        color: options.color ?? navy,
      });
      y -= lineHeight;
    }
    return lines.length;
  };
  const sectionTitle = (title: string) => {
    ensure(22);
    y -= 3;
    page.drawRectangle({
      x: MARGIN,
      y: y - 14,
      width: CONTENT_WIDTH,
      height: 19,
      color: paleBlue,
    });
    page.drawText(title, {
      x: MARGIN + 8,
      y: y - 8,
      size: 9.5,
      font: bold,
      color: navy,
    });
    y -= 21;
  };
  const infoRows = (rows: [string, string][]) => {
    const columnWidth = CONTENT_WIDTH / 2;
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 2) {
      const pair = rows.slice(rowIndex, rowIndex + 2);
      const wrapped = pair.map(([, value]) =>
        wrap(value, regular, 8.5, columnWidth - 92),
      );
      const rowHeight = Math.max(
        18,
        ...wrapped.map((lines) => lines.length * 11 + 4),
      );
      ensure(rowHeight + 2);
      pair.forEach(([label], column) => {
        const x = MARGIN + column * columnWidth + 5;
        page.drawText(label, { x, y, size: 7.5, font: bold, color: gray });
        wrapped[column].forEach((line, index) =>
          page.drawText(line, {
            x: x + 86,
            y: y - index * 11,
            size: 8.5,
            font: regular,
            color: navy,
          }),
        );
      });
      y -= rowHeight;
      page.drawLine({
        start: { x: MARGIN, y: y + 6 },
        end: { x: PAGE_WIDTH - MARGIN, y: y + 6 },
        thickness: 0.35,
        color: lightGray,
      });
    }
  };

  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 88,
    width: PAGE_WIDTH,
    height: 88,
    color: navy,
  });
  page.drawText("HZS ČEPRO", {
    x: MARGIN,
    y: PAGE_HEIGHT - 27,
    size: 14,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText("Technická služba - Mstětice", {
    x: MARGIN,
    y: PAGE_HEIGHT - 43,
    size: 9.5,
    font: regular,
    color: rgb(0.85, 0.91, 0.95),
  });
  page.drawText("PROTOKOL O KONTROLE TECHNICKÉHO PROSTŘEDKU", {
    x: MARGIN,
    y: PAGE_HEIGHT - 66,
    size: 12,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText(`Číslo protokolu: ${input.number}`, {
    x: MARGIN,
    y: PAGE_HEIGHT - 82,
    size: 9.5,
    font: bold,
    color: rgb(0.85, 0.91, 0.95),
  });
  y = PAGE_HEIGHT - 102;

  const equipment = input.snapshot.equipment ?? {};
  sectionTitle("IDENTIFIKACE PROSTŘEDKU");
  const placement =
    [text(equipment.vehicle, ""), text(equipment.location, "")]
      .filter(Boolean)
      .join(" / ") || "—";
  infoRows([
    ["Název", text(equipment.name)],
    ["UID", text(equipment.uid)],
    ["Původní ID", text(equipment.legacyId)],
    ["Evidenční číslo", text(equipment.registrationNumber)],
    ["Výrobní číslo", text(equipment.serialNumber)],
    ["Výrobce", text(equipment.manufacturer)],
    ["Typ / model", text(equipment.model)],
    ["Vozidlo / umístění", placement],
  ]);

  const requirement = input.snapshot.requirement ?? {};
  const inspection = input.snapshot.inspection ?? {};
  sectionTitle("ÚDAJE O KONTROLE");
  infoRows([
    ["Druh kontroly", text(requirement.name, "Kontrola")],
    [
      "Interval",
      formatProtocolInterval(
        requirement.intervalValue,
        requirement.intervalUnit,
      ),
    ],
    ["Datum provedení kontroly", formatProtocolDate(inspection.performedAt ?? inspection.completedAt)],
    ["Datum protokolu", formatProtocolDate(inspection.protocolDate ?? inspection.completedAt)],
    ["Další termín", formatProtocolDate(inspection.nextDueAt)],
    ["Zdroj požadavku", text(requirement.sourceDocument ?? requirement.source)],
    ["Článek metodiky", text(requirement.article)],
  ]);

  sectionTitle(
    `KONTROLNÍ BODY${input.snapshot.checklist?.name ? ` - ${input.snapshot.checklist.name}` : ""}`,
  );
  for (const section of input.snapshot.checklist?.sections ?? []) {
    ensure(28);
    page.drawText(section.title, {
      x: MARGIN + 4,
      y,
      size: 9.5,
      font: bold,
      color: blue,
    });
    y -= 14;
    for (const item of section.items) {
      const value = checklistValue(item.value);
      const shownValue =
        item.unit && !/[✓✕]/.test(value) ? `${value} ${item.unit}` : value;
      const valueWidth = Math.min(
        165,
        bold.widthOfTextAtSize(shownValue, 8.5) + 8,
      );
      const labelLines = wrap(
        item.label,
        regular,
        9,
        CONTENT_WIDTH - valueWidth - 18,
      );
      const noteLines = item.note
        ? wrap(`Poznámka: ${item.note}`, regular, 8, CONTENT_WIDTH - 20)
        : [];
      const height =
        Math.max(15, labelLines.length * 11) + noteLines.length * 9 + 3;
      ensure(height);
      labelLines.forEach((line, index) =>
        page.drawText(line, {
          x: MARGIN + 8,
          y: y - index * 11,
          size: 9,
          font: regular,
          color: navy,
        }),
      );
      const resultColor = shownValue.includes("NEVYHOVUJE")
        ? red
        : shownValue.includes("VYHOVUJE")
          ? green
          : gray;
      page.drawText(shownValue, {
        x: PAGE_WIDTH - MARGIN - valueWidth + 4,
        y,
        size: 8.5,
        font: bold,
        color: resultColor,
      });
      y -= Math.max(15, labelLines.length * 11);
      noteLines.forEach((line) => {
        page.drawText(line, {
          x: MARGIN + 16,
          y,
          size: 8,
          font: regular,
          color: gray,
        });
        y -= 9;
      });
      page.drawLine({
        start: { x: MARGIN + 5, y: y + 3 },
        end: { x: PAGE_WIDTH - MARGIN - 5, y: y + 3 },
        thickness: 0.3,
        color: lightGray,
      });
      y -= 3;
    }
    y -= 2;
  }

  const result = String(inspection.result ?? "");
  const resultLabel = protocolResultLabel(result);
  const resultColor =
    result === "FAILED"
      ? red
      : result === "PASSED_WITH_LIMITATION"
        ? amber
        : green;
  ensure(105);
  sectionTitle("CELKOVÝ VÝSLEDEK");
  page.drawRectangle({
    x: MARGIN,
    y: y - 31,
    width: CONTENT_WIDTH,
    height: 39,
    color: resultColor,
  });
  page.drawText(result === "FAILED" ? "✕" : "✓", {
    x: MARGIN + 13,
    y: y - 18,
    size: 16,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText(resultLabel, {
    x: MARGIN + 42,
    y: y - 15,
    size: 12,
    font: bold,
    color: rgb(1, 1, 1),
  });
  y -= 44;
  const conclusion =
    result === "FAILED"
      ? "Při kontrole byly zjištěny závady, pro které nelze technický prostředek považovat za plně provozuschopný."
      : result === "PASSED_WITH_LIMITATION"
        ? "Technický prostředek byl při kontrole shledán provozuschopným s uvedenými omezeními."
        : "V době provedení kontroly byl technický prostředek shledán funkčním, kompletním a provozuschopným, bez zjevných závad bránících jeho bezpečnému použití.";
  drawLines(conclusion, { size: 8.7, lineHeight: 11.5 });
  if (result === "PASSED_WITH_LIMITATION" && inspection.limitationReason) {
    y -= 4;
    drawLines(`Omezení: ${text(inspection.limitationReason)}`, {
      size: 9,
      lineHeight: 12,
    });
  }
  if (result === "FAILED" && input.snapshot.defects?.length) {
    y -= 4;
    for (const defect of input.snapshot.defects)
      drawLines(`• ${text(defect.description ?? defect.label)}`, {
        x: MARGIN + 8,
        width: CONTENT_WIDTH - 16,
        size: 8.8,
        lineHeight: 12,
      });
  }
  if (inspection.note) {
    y -= 4;
    drawLines(`Závěrečná poznámka: ${text(inspection.note)}`, {
      size: 8.8,
      lineHeight: 12,
      color: gray,
    });
  }

  ensure(115);
  sectionTitle("KONTROLUJÍCÍ");
  page.drawText("Kontrolu provedl:", {
    x: MARGIN + 5,
    y,
    size: 8,
    font: bold,
    color: gray,
  });
  page.drawText(text(inspection.inspector), {
    x: MARGIN + 5,
    y: y - 18,
    size: 11,
    font: bold,
    color: navy,
  });
  page.drawText("Datum a čas:", {
    x: MARGIN + 5,
    y: y - 42,
    size: 8,
    font: bold,
    color: gray,
  });
  page.drawText(formatProtocolDate(inspection.protocolDate ?? inspection.completedAt, true), {
    x: MARGIN + 5,
    y: y - 60,
    size: 10,
    font: regular,
    color: navy,
  });
  const stampX = PAGE_WIDTH - MARGIN - 58;
  const stampY = y - 22;
  page.drawCircle({
    x: stampX,
    y: stampY,
    size: 47,
    borderColor: blue,
    borderWidth: 1.5,
  });
  page.drawCircle({
    x: stampX,
    y: stampY,
    size: 42,
    borderColor: blue,
    borderWidth: 0.8,
  });
  const centered = (
    stampText: string,
    stampYPosition: number,
    size: number,
    selectedFont = bold,
  ) => {
    const width = selectedFont.widthOfTextAtSize(stampText, size);
    page.drawText(stampText, {
      x: stampX - width / 2,
      y: stampYPosition,
      size,
      font: selectedFont,
      color: blue,
    });
  };
  centered("TECHNICKÁ SLUŽBA", stampY + 24, 6.2);
  centered("HZS ČEPRO", stampY + 11, 7);
  centered("TS", stampY - 7, 17);
  centered("MSTĚTICE", stampY - 22, 7);
  centered("4773", stampY - 34, 6.5, regular);
  y -= 100;

  pages.forEach((currentPage, index) => {
    currentPage.drawLine({
      start: { x: MARGIN, y: 35 },
      end: { x: PAGE_WIDTH - MARGIN, y: 35 },
      thickness: 0.4,
      color: lightGray,
    });
    currentPage.drawText("HZS ČEPRO · Technická služba Mstětice", {
      x: MARGIN,
      y: 20,
      size: 7.5,
      font: regular,
      color: gray,
    });
    const footerRight = `Protokol ${input.number} · Strana ${index + 1} / ${pages.length}`;
    currentPage.drawText(footerRight, {
      x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(footerRight, 7.5),
      y: 20,
      size: 7.5,
      font: regular,
      color: gray,
    });
  });
  pdf.setTitle(`Protokol ${input.number}`);
  pdf.setAuthor("HZS ČEPRO - Technická služba Mstětice");
  pdf.setSubject("Protokol o kontrole technického prostředku");
  return pdf.save();
}
