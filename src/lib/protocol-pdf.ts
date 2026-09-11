import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";

export type ProtocolSnapshot = {
  equipment?: { name?: unknown; uid?: unknown; legacyId?: unknown; registrationNumber?: unknown; serialNumber?: unknown; manufacturer?: unknown; model?: unknown; vehicle?: unknown; location?: unknown };
  requirement?: { name?: unknown; type?: unknown; intervalValue?: unknown; intervalUnit?: unknown; source?: unknown; sourceDocument?: unknown; article?: unknown };
  checklist?: { name?: string; sections?: { title: string; items: { label: string; responseType?: string; value?: unknown; unit?: string; note?: string | null }[] }[] };
  inspection?: { inspector?: unknown; completedAt?: unknown; performedAt?: unknown; protocolDate?: unknown; result?: unknown; limitationReason?: unknown; note?: unknown; nextDueAt?: unknown };
  defects?: { label?: unknown; description?: unknown; severity?: unknown }[];
};

const A4_PORTRAIT = [595.28, 841.89] as const;
const A4_LANDSCAPE = [841.89, 595.28] as const;
const MARGIN = 38;
const HEADER_HEIGHT = 82;
const SIGNATURE_TOP = 145;
const FOOTER_Y = 20;
const navy = rgb(0.08, 0.2, 0.31);
const blue = rgb(0.12, 0.39, 0.58);
const paleBlue = rgb(0.93, 0.96, 0.98);
const gray = rgb(0.34, 0.39, 0.43);
const lightGray = rgb(0.86, 0.88, 0.9);
const green = rgb(0.08, 0.45, 0.25);
const red = rgb(0.7, 0.12, 0.12);
const amber = rgb(0.67, 0.39, 0.03);

type Density = { name: "NORMAL" | "COMPACT" | "VERY_COMPACT"; body: number; label: number; checklist: number; section: number; line: number; gap: number; heading: number };
const NORMAL: Density = { name: "NORMAL", body: 8.5, label: 7.2, checklist: 8.3, section: 8.7, line: 10, gap: 2, heading: 9 };
const COMPACT: Density = { name: "COMPACT", body: 7.7, label: 6.8, checklist: 7.5, section: 8, line: 8.8, gap: 1.2, heading: 8.3 };
const VERY_COMPACT: Density = { name: "VERY_COMPACT", body: 6.7, label: 6.5, checklist: 6.7, section: 7, line: 7.7, gap: 0.7, heading: 7.3 };
const text = (value: unknown, fallback = "—") => String(value ?? "").trim() || fallback;

function filenamePart(value: unknown, maxLength: number) {
  return String(value ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, maxLength).replace(/-+$/g, "");
}

export function protocolDownloadFilename(snapshot: ProtocolSnapshot, protocolNumber: string) {
  const equipmentName = filenamePart(snapshot.equipment?.name, 80);
  const uid = filenamePart(snapshot.equipment?.uid, 80);
  return `${equipmentName || `Technicky-prostredek-${uid || "bez-UID"}`}_${protocolNumber}.pdf`;
}

export function formatProtocolDate(value: unknown, withTime = false) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  const datePart = new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric" }).format(date);
  if (!withTime) return datePart;
  const timePart = new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" }).format(date);
  return `${datePart}, ${timePart}`;
}

function plural(value: number, one: string, few: string, many: string) { return value === 1 ? one : value >= 2 && value <= 4 ? few : many; }

export function formatProtocolInterval(value: unknown, unit: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const labels: Record<string, [string, string, string]> = { DAYS: ["den", "dny", "dní"], WEEKS: ["týden", "týdny", "týdnů"], MONTHS: ["měsíc", "měsíce", "měsíců"], YEARS: ["rok", "roky", "let"], OPERATING_HOURS: ["motohodina", "motohodiny", "motohodin"], USAGE_COUNT: ["použití", "použití", "použití"] };
  const forms = labels[String(unit)];
  return forms ? `${number} ${plural(number, ...forms)}` : String(number);
}

export function protocolResultLabel(value: unknown) { return ({ PASSED: "VYHOVUJE", FAILED: "NEVYHOVUJE", PASSED_WITH_LIMITATION: "VYHOVUJE S OMEZENÍM" }[String(value)] ?? text(value)); }

function checklistValue(value: unknown) {
  if (value === "NERELEVANTNÍ" || value === "NA") return "NERELEVANTNÍ";
  if (value === "PASSED" || value === "VYHOVUJE") return "✓ VYHOVUJE";
  if (value === "FAILED" || value === "NEVYHOVUJE") return "✕ NEVYHOVUJE";
  if (value === true || value === "true") return "ANO";
  if (value === false || value === "false") return "NE";
  return text(value);
}

function wrap(value: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let line = words.shift()!;
    for (const word of words) {
      const candidate = `${line} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

export function infoGridColumns(contentWidth: number, originX = MARGIN) {
  const pairWidth = contentWidth / 2;
  const pairGap = 8;
  const labelWidth = Math.min(112, pairWidth * 0.43);
  const valueGap = 6;
  const valueWidth = pairWidth - labelWidth - valueGap - pairGap;
  return [0, 1].map((pair) => {
    const pairX = originX + pair * pairWidth;
    return { labelX: pairX, labelWidth, valueX: pairX + labelWidth + valueGap, valueWidth };
  });
}

type ChecklistBlock = { section?: string; label: string; value: string; note?: string | null };

function checklistBlocks(snapshot: ProtocolSnapshot) {
  const blocks: ChecklistBlock[] = [];
  for (const section of snapshot.checklist?.sections ?? []) section.items.forEach((item, index) => {
    const value = checklistValue(item.value);
    blocks.push({ section: index === 0 ? section.title : undefined, label: item.label, value: item.unit && !/[✓✕]/.test(value) ? `${value} ${item.unit}` : value, note: item.note });
  });
  return blocks;
}

function infoHeight(rows: [string, string][], contentWidth: number, density: Density, regular: PDFFont, bold: PDFFont) {
  const columns = infoGridColumns(contentWidth, 0);
  let total = 0;
  for (let index = 0; index < rows.length; index += 2) {
    let lineCount = 1;
    rows.slice(index, index + 2).forEach(([label, value], pair) => {
      const col = columns[pair];
      lineCount = Math.max(lineCount, wrap(label, bold, density.label, col.labelWidth).length, wrap(value, regular, density.body, col.valueWidth).length);
    });
    total += Math.max(14, lineCount * density.line + 3);
  }
  return total;
}

function blockHeight(block: ChecklistBlock, width: number, density: Density, regular: PDFFont, bold: PDFFont) {
  const resultWidth = Math.min(width * 0.37, bold.widthOfTextAtSize(block.value, density.checklist) + 5);
  const labelLines = wrap(block.label, regular, density.checklist, width - resultWidth - 10);
  const noteLines = block.note ? wrap(`Poznámka: ${block.note}`, regular, density.checklist - 0.2, width - 8) : [];
  return (block.section ? density.line + 3 : 0) + Math.max(density.line, labelLines.length * density.line) + noteLines.length * density.line + density.gap + 1;
}

function checklistHeight(blocks: ChecklistBlock[], width: number, columns: number, density: Density, regular: PDFFont, bold: PDFFont) {
  if (!blocks.length) return 0;
  if (columns === 1) return blocks.reduce((sum, block) => sum + blockHeight(block, width, density, regular, bold), 0);
  const columnWidth = (width - 12) / 2;
  const heights = blocks.map((block) => blockHeight(block, columnWidth, density, regular, bold));
  const target = heights.reduce((sum, height) => sum + height, 0) / 2;
  let left = 0, split = 0;
  while (split < heights.length && (left + heights[split] <= target || split === 0)) left += heights[split++];
  return Math.max(left, heights.slice(split).reduce((sum, height) => sum + height, 0));
}

function conclusionText(result: string) {
  return result === "FAILED" ? "Při kontrole byly zjištěny závady, pro které nelze technický prostředek považovat za plně provozuschopný." : result === "PASSED_WITH_LIMITATION" ? "Technický prostředek byl při kontrole shledán provozuschopným s uvedenými omezeními." : "V době provedení kontroly byl technický prostředek shledán funkčním, kompletním a provozuschopným, bez zjevných závad bránících jeho bezpečnému použití.";
}

export async function renderProtocolPdf(input: { number: string; snapshot: ProtocolSnapshot; regularFont: Uint8Array; boldFont: Uint8Array }) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(input.regularFont, { subset: true });
  const bold = await pdf.embedFont(input.boldFont, { subset: true });
  const equipment = input.snapshot.equipment ?? {}, requirement = input.snapshot.requirement ?? {}, inspection = input.snapshot.inspection ?? {};
  const placement = [text(equipment.vehicle, ""), text(equipment.location, "")].filter(Boolean).join(" / ") || "—";
  const identificationRows: [string, string][] = [["Název", text(equipment.name)], ["UID", text(equipment.uid)], ["Původní ID", text(equipment.legacyId)], ["Evidenční číslo", text(equipment.registrationNumber)], ["Výrobní číslo", text(equipment.serialNumber)], ["Výrobce", text(equipment.manufacturer)], ["Typ / model", text(equipment.model)], ["Vozidlo / umístění", placement]];
  const inspectionRows: [string, string][] = [["Druh kontroly", text(requirement.name, "Kontrola")], ["Interval", formatProtocolInterval(requirement.intervalValue, requirement.intervalUnit)], ["Datum provedení", formatProtocolDate(inspection.performedAt ?? inspection.completedAt)], ["Datum protokolu", formatProtocolDate(inspection.protocolDate ?? inspection.completedAt)], ["Další termín", formatProtocolDate(inspection.nextDueAt)], ["Zdroj požadavku", text(requirement.sourceDocument ?? requirement.source)], ["Článek metodiky", text(requirement.article)]];
  const blocks = checklistBlocks(input.snapshot);
  const candidates = [{ size: A4_PORTRAIT, density: NORMAL, columns: 1 }, { size: A4_PORTRAIT, density: COMPACT, columns: 1 }, { size: A4_PORTRAIT, density: VERY_COMPACT, columns: 2 }, { size: A4_LANDSCAPE, density: VERY_COMPACT, columns: 2 }] as const;
  const sectionHeaderHeight = (density: Density) => density.heading + 9;
  const measure = (candidate: (typeof candidates)[number]) => {
    const width = candidate.size[0] - MARGIN * 2;
    const conclusionLines = wrap(conclusionText(String(inspection.result ?? "")), regular, candidate.density.body, width).length;
    const extras = (inspection.limitationReason ? wrap(`Omezení: ${text(inspection.limitationReason)}`, regular, candidate.density.body, width).length : 0) + (inspection.note ? wrap(`Závěrečná poznámka: ${text(inspection.note)}`, regular, candidate.density.body, width).length : 0);
    return sectionHeaderHeight(candidate.density) * 4 + infoHeight(identificationRows, width, candidate.density, regular, bold) + infoHeight(inspectionRows, width, candidate.density, regular, bold) + checklistHeight(blocks, width, candidate.columns, candidate.density, regular, bold) + 31 + (conclusionLines + extras) * candidate.density.line + 10;
  };
  const available = (size: readonly [number, number]) => size[1] - HEADER_HEIGHT - 18 - SIGNATURE_TOP;
  const candidate = candidates.find((item) => measure(item) <= available(item.size)) ?? candidates[candidates.length - 1];
  const [pageWidth, pageHeight] = candidate.size;
  const density = candidate.density;
  const contentWidth = pageWidth - MARGIN * 2;
  const page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - HEADER_HEIGHT - 15;
  const drawSectionTitle = (title: string) => {
    const height = sectionHeaderHeight(density);
    page.drawRectangle({ x: MARGIN, y: y - height + 4, width: contentWidth, height: height - 2, color: paleBlue });
    page.drawText(title, { x: MARGIN + 7, y: y - density.heading + 1, size: density.heading, font: bold, color: navy });
    y -= height;
  };
  const drawWrappedAt = (lines: string[], x: number, startY: number, size: number, lineHeight: number, font: PDFFont, color = navy) => lines.forEach((line, index) => page.drawText(line, { x, y: startY - index * lineHeight, size, font, color }));
  const drawInfoRows = (rows: [string, string][]) => {
    const columns = infoGridColumns(contentWidth);
    for (let index = 0; index < rows.length; index += 2) {
      const pair = rows.slice(index, index + 2);
      const content = pair.map(([label, value], pairIndex) => ({ label: wrap(label, bold, density.label, columns[pairIndex].labelWidth), value: wrap(value, regular, density.body, columns[pairIndex].valueWidth) }));
      const rowHeight = Math.max(14, ...content.map((entry) => Math.max(entry.label.length, entry.value.length) * density.line + 3));
      pair.forEach((_, pairIndex) => { const column = columns[pairIndex]; drawWrappedAt(content[pairIndex].label, column.labelX, y, density.label, density.line, bold, gray); drawWrappedAt(content[pairIndex].value, column.valueX, y, density.body, density.line, regular); });
      y -= rowHeight;
      page.drawLine({ start: { x: MARGIN, y: y + 3 }, end: { x: pageWidth - MARGIN, y: y + 3 }, thickness: 0.3, color: lightGray });
    }
  };

  page.drawRectangle({ x: 0, y: pageHeight - HEADER_HEIGHT, width: pageWidth, height: HEADER_HEIGHT, color: navy });
  page.drawText("HZS ČEPRO", { x: MARGIN, y: pageHeight - 25, size: 13, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Technická služba - Mstětice", { x: MARGIN, y: pageHeight - 40, size: 9, font: regular, color: rgb(0.85, 0.91, 0.95) });
  page.drawText("PROTOKOL O KONTROLE TECHNICKÉHO PROSTŘEDKU", { x: MARGIN, y: pageHeight - 60, size: candidate.size === A4_LANDSCAPE ? 11 : 10.5, font: bold, color: rgb(1, 1, 1) });
  page.drawText(`Číslo protokolu: ${input.number}`, { x: MARGIN, y: pageHeight - 76, size: 8.8, font: bold, color: rgb(0.85, 0.91, 0.95) });
  drawSectionTitle("IDENTIFIKACE PROSTŘEDKU");
  drawInfoRows(identificationRows);
  drawSectionTitle("ÚDAJE O KONTROLE");
  drawInfoRows(inspectionRows);
  drawSectionTitle(`KONTROLNÍ BODY${input.snapshot.checklist?.name ? ` - ${input.snapshot.checklist.name}` : ""}`);
  const drawBlock = (block: ChecklistBlock, x: number, cursorY: number, width: number) => {
    let localY = cursorY;
    if (block.section) { page.drawText(block.section, { x, y: localY, size: density.section, font: bold, color: blue }); localY -= density.line + 3; }
    const resultWidth = Math.min(width * 0.37, bold.widthOfTextAtSize(block.value, density.checklist) + 5);
    const labelLines = wrap(block.label, regular, density.checklist, width - resultWidth - 10);
    const noteLines = block.note ? wrap(`Poznámka: ${block.note}`, regular, density.checklist - 0.2, width - 8) : [];
    drawWrappedAt(labelLines, x + 3, localY, density.checklist, density.line, regular);
    const resultColor = block.value.includes("NEVYHOVUJE") ? red : block.value.includes("VYHOVUJE") ? green : gray;
    page.drawText(block.value, { x: x + width - bold.widthOfTextAtSize(block.value, density.checklist) - 3, y: localY, size: density.checklist, font: bold, color: resultColor });
    localY -= Math.max(density.line, labelLines.length * density.line);
    drawWrappedAt(noteLines, x + 8, localY, density.checklist - 0.2, density.line, regular, gray);
    localY -= noteLines.length * density.line + density.gap;
    page.drawLine({ start: { x: x + 2, y: localY }, end: { x: x + width - 2, y: localY }, thickness: 0.25, color: lightGray });
    return localY - 1;
  };
  if (candidate.columns === 1) for (const block of blocks) y = drawBlock(block, MARGIN, y, contentWidth);
  else {
    const columnGap = 12, columnWidth = (contentWidth - columnGap) / 2;
    const heights = blocks.map((block) => blockHeight(block, columnWidth, density, regular, bold));
    const target = heights.reduce((sum, height) => sum + height, 0) / 2;
    let split = 0, accumulated = 0;
    while (split < heights.length && (accumulated + heights[split] <= target || split === 0)) accumulated += heights[split++];
    let leftY = y, rightY = y;
    blocks.slice(0, split).forEach((block) => { leftY = drawBlock(block, MARGIN, leftY, columnWidth); });
    blocks.slice(split).forEach((block) => { rightY = drawBlock(block, MARGIN + columnWidth + columnGap, rightY, columnWidth); });
    y = Math.min(leftY, rightY);
  }
  drawSectionTitle("CELKOVÝ VÝSLEDEK");
  const result = String(inspection.result ?? "");
  const resultColor = result === "FAILED" ? red : result === "PASSED_WITH_LIMITATION" ? amber : green;
  page.drawRectangle({ x: MARGIN, y: y - 25, width: contentWidth, height: 29, color: resultColor });
  page.drawText(`${result === "FAILED" ? "✕" : "✓"}  ${protocolResultLabel(result)}`, { x: MARGIN + 11, y: y - 15, size: Math.max(9, density.body + 2), font: bold, color: rgb(1, 1, 1) });
  y -= 32;
  const resultLines = wrap(conclusionText(result), regular, density.body, contentWidth);
  drawWrappedAt(resultLines, MARGIN, y, density.body, density.line, regular);
  y -= resultLines.length * density.line;
  if (result === "PASSED_WITH_LIMITATION" && inspection.limitationReason) { const lines = wrap(`Omezení: ${text(inspection.limitationReason)}`, regular, density.body, contentWidth); drawWrappedAt(lines, MARGIN, y, density.body, density.line, regular, gray); y -= lines.length * density.line; }
  if (inspection.note) { const lines = wrap(`Závěrečná poznámka: ${text(inspection.note)}`, regular, density.body, contentWidth); drawWrappedAt(lines, MARGIN, y, density.body, density.line, regular, gray); }
  const signatureY = 113;
  page.drawLine({ start: { x: MARGIN, y: SIGNATURE_TOP - 2 }, end: { x: pageWidth - MARGIN, y: SIGNATURE_TOP - 2 }, thickness: 0.5, color: lightGray });
  page.drawText("KONTROLUJÍCÍ", { x: MARGIN, y: SIGNATURE_TOP - 17, size: 8, font: bold, color: navy });
  page.drawText("Kontrolu provedl:", { x: MARGIN, y: signatureY, size: 7, font: bold, color: gray });
  page.drawText(text(inspection.inspector), { x: MARGIN, y: signatureY - 16, size: 10, font: bold, color: navy });
  page.drawText("Datum a čas:", { x: MARGIN, y: signatureY - 34, size: 7, font: bold, color: gray });
  page.drawText(formatProtocolDate(inspection.protocolDate ?? inspection.completedAt, true), { x: MARGIN, y: signatureY - 49, size: 8.5, font: regular, color: navy });
  const stampX = pageWidth - MARGIN - 48, stampY = 91;
  page.drawCircle({ x: stampX, y: stampY, size: 39, borderColor: blue, borderWidth: 1.4 });
  page.drawCircle({ x: stampX, y: stampY, size: 35, borderColor: blue, borderWidth: 0.7 });
  const centered = (value: string, positionY: number, size: number, selectedFont = bold) => page.drawText(value, { x: stampX - selectedFont.widthOfTextAtSize(value, size) / 2, y: positionY, size, font: selectedFont, color: blue });
  centered("TECHNICKÁ SLUŽBA", stampY + 20, 5.4); centered("HZS ČEPRO", stampY + 9, 6.2); centered("TS", stampY - 7, 14); centered("MSTĚTICE", stampY - 20, 6.2); centered("4773", stampY - 30, 5.7, regular);
  page.drawLine({ start: { x: MARGIN, y: 34 }, end: { x: pageWidth - MARGIN, y: 34 }, thickness: 0.4, color: lightGray });
  page.drawText("HZS ČEPRO · Technická služba Mstětice", { x: MARGIN, y: FOOTER_Y, size: 7.2, font: regular, color: gray });
  const footerRight = `${input.number} · Strana 1 / 1`;
  page.drawText(footerRight, { x: pageWidth - MARGIN - regular.widthOfTextAtSize(footerRight, 7.2), y: FOOTER_Y, size: 7.2, font: regular, color: gray });
  pdf.setTitle(`Protokol ${input.number}`);
  pdf.setAuthor("HZS ČEPRO - Technická služba Mstětice");
  pdf.setSubject(`Protokol o kontrole technického prostředku · ${density.name}${candidate.columns === 2 ? " · 2 sloupce" : ""}`);
  return pdf.save();
}
