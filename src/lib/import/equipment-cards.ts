import { createHash } from "node:crypto";
import ExcelJS from "exceljs";

export type CardField = { value: string; row: number };
export type ParsedSpecification = {
  name: string;
  value: string;
  unit: string | null;
  sourceRow: number;
  sortOrder: number;
};
export type ParsedCardLog = {
  sourceRow: number;
  eventType: "DEPLOYMENT" | "TRAINING" | "DEFECT" | "REPAIR" | "OTHER";
  occurredAt: string | null;
  locationText: string | null;
  durationMinutes: number | null;
  description: string | null;
  defectDescription: string | null;
  remedyDescription: string | null;
  note: string | null;
  legacySignatureText: string | null;
  raw: string[];
};
export type ParsedEquipmentCard = {
  sheetName: string;
  fields: Record<string, CardField>;
  specifications: ParsedSpecification[];
  logEntries: ParsedCardLog[];
  unknownRows: Array<{ row: number; values: string[] }>;
  warnings: string[];
  errors: string[];
};
export type EquipmentMatchCandidate = {
  id: string;
  name: string;
  manufacturer: string | null;
  typeName: string | null;
  serialNumber: string | null;
  registrationNumber: string | null;
  legacyIdentificationNumber: string | null;
};

const labels: Record<string, string[]> = {
  legacyIdentificationNumber: ["identifikacni cislo", "identifikacni c"],
  serialNumber: ["vyrobni cislo", "vyr cislo", "v c"],
  registrationNumber: ["ev c", "evidencni cislo"],
  assignedPersonText: ["v uzivani osoby", "prideleno osobe", "uzivatel"],
  name: ["nazev", "textovy nazev", "varianta"],
  typeName: ["druh prostredku", "druh technickeho prostredku"],
  manufacturer: ["vyrobce"],
  material: ["material"],
  model: ["typ", "model"],
  manufacturedAt: ["datum vyroby"],
  commissionedAt: ["zavedeni do uzivani", "datum zavedeni do uzivani"],
  vehicle: ["vozidlo", "vuz"],
  registrationPlate: ["spz", "registracni znacka"],
  technicalDescription: ["technicky popis", "technicke parametry"],
};
const specLabels = [
  "delka",
  "hmotnost",
  "nosnost",
  "pocet dilu",
  "pocet pricli",
  "prutok",
  "tlak",
  "dostrik",
  "napeneni",
];
export const normalizeCardLabel = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const text = (value: ExcelJS.CellValue): string => {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value) return String(value.text);
    if ("result" in value) return text(value.result as ExcelJS.CellValue);
    if ("richText" in value) return value.richText.map((x) => x.text).join("");
  }
  return String(value).trim();
};
const dateIso = (value: ExcelJS.CellValue): string | null => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" && value > 0 && value < 100000)
    return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000).toISOString();
  const raw = text(value);
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})[.\/]\s*(\d{1,2})[.\/]\s*(\d{2,4})$/);
  if (m) {
    const year = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(
      Date.UTC(year, Number(m[2]) - 1, Number(m[1]), 12),
    ).toISOString();
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};
const duration = (value: ExcelJS.CellValue) => {
  if (typeof value === "number")
    return Math.round(value < 1 ? value * 1440 : value);
  const raw = text(value);
  const hm = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const number = Number(raw.replace(",", "."));
  return Number.isFinite(number) ? Math.round(number * 60) : null;
};
function valueAfter(row: ExcelJS.Row, column: number, inline: string) {
  const colon = inline.indexOf(":");
  if (colon >= 0 && inline.slice(colon + 1).trim())
    return inline.slice(colon + 1).trim();
  for (let c = column + 1; c <= row.cellCount; c++) {
    const v = text(row.getCell(c).value);
    if (v) return v;
  }
  return "";
}
function splitUnit(value: string) {
  const m = value.match(/^(.+?)\s*(mm|cm|m|kg|t|l\/min|mpa|bar|n|kn|ks)$/i);
  return m ? { value: m[1].trim(), unit: m[2] } : { value, unit: null };
}

export function parseEquipmentCardSheet(
  sheet: ExcelJS.Worksheet,
): ParsedEquipmentCard | null {
  if (normalizeCardLabel(sheet.name) === "vzor nevyplnovat") return null;
  const nonEmpty: number[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (text(cell.value)) hasValue = true;
    });
    if (hasValue) nonEmpty.push(row.number);
  });
  if (!nonEmpty.length) return null;
  const fields: Record<string, CardField> = {},
    specifications: ParsedSpecification[] = [],
    logEntries: ParsedCardLog[] = [],
    unknownRows: Array<{ row: number; values: string[] }> = [],
    warnings: string[] = [];
  let journalHeader: number | null = null,
    specMode = false;
  for (const rowNumber of nonEmpty) {
    const row = sheet.getRow(rowNumber),
      values = Array.from({ length: row.cellCount }, (_, i) =>
        text(row.getCell(i + 1).value),
      ),
      normalized = values.map(normalizeCardLabel);
    if (
      normalized.includes("datum") &&
      normalized.some((v) => v.includes("nasazeni") || v.includes("cviceni")) &&
      normalized.some((v) => v === "doba")
    ) {
      journalHeader = rowNumber;
      continue;
    }
    if (journalHeader && rowNumber > journalHeader) {
      const occurredAt = dateIso(row.getCell(1).value),
        locationText = values[1] || null,
        description = values[1] || null,
        defectDescription = values[3] || null,
        remedyDescription = values[4] || null,
        note = values[5] || null;
      if (values.some(Boolean))
        logEntries.push({
          sourceRow: rowNumber,
          eventType: defectDescription
            ? "DEFECT"
            : /cvičen/i.test(locationText ?? "")
              ? "TRAINING"
              : locationText
                ? "DEPLOYMENT"
                : "OTHER",
          occurredAt,
          locationText,
          durationMinutes: duration(row.getCell(3).value),
          description,
          defectDescription,
          remedyDescription,
          note,
          legacySignatureText: note,
          raw: values,
        });
      continue;
    }
    let recognized = false;
    for (let column = 1; column <= row.cellCount; column++) {
      const raw = values[column - 1],
        keyText = normalizeCardLabel(raw.split(":")[0]);
      if (!raw) continue;
      for (const [field, known] of Object.entries(labels)) {
        if (
          known.some(
            (label) => keyText === label || keyText.startsWith(`${label} `),
          )
        ) {
          const value = valueAfter(row, column, raw);
          if (value && !fields[field])
            fields[field] = {
              value: field.endsWith("At")
                ? (dateIso(row.getCell(column + 1).value) ?? value)
                : value,
              row: rowNumber,
            };
          if (field === "technicalDescription") specMode = true;
          recognized = true;
          break;
        }
      }
    }
    const filled = values
      .map((value, index) => ({ value, index }))
      .filter((x) => x.value);
    const first = filled[0];
    if (
      !recognized &&
      first &&
      filled.length >= 2 &&
      (specMode ||
        specLabels.includes(normalizeCardLabel(first.value.replace(/:$/, ""))))
    ) {
      const pair = splitUnit(filled[1].value);
      specifications.push({
        name: first.value.replace(/:$/, "").trim(),
        value: pair.value,
        unit: pair.unit,
        sourceRow: rowNumber,
        sortOrder: specifications.length,
      });
      recognized = true;
    }
    if (!recognized && values.some(Boolean))
      unknownRows.push({ row: rowNumber, values: values.filter(Boolean) });
  }
  if (!fields.name && fields.typeName) fields.name = { ...fields.typeName };
  if (!fields.name) warnings.push("Chybí textový název prostředku.");
  if (!fields.manufacturer) warnings.push("Chybí výrobce.");
  if (!fields.manufacturedAt) warnings.push("Chybí datum výroby.");
  if (unknownRows.length)
    warnings.push(`${unknownRows.length} řádků vyžaduje kontrolu.`);
  const errors =
    fields.name ||
    fields.typeName ||
    fields.serialNumber ||
    fields.registrationNumber ||
    fields.legacyIdentificationNumber
      ? []
      : ["Kartu nelze bezpečně identifikovat."];
  return {
    sheetName: sheet.name,
    fields,
    specifications,
    logEntries,
    unknownRows,
    warnings,
    errors,
  };
}

export async function analyzeEquipmentCards(
  fileName: string,
  mimeType: string,
  bytes: Uint8Array,
) {
  if (!fileName.toLowerCase().endsWith(".xlsx"))
    throw new Error("Podporován je pouze formát XLSX.");
  if (bytes.byteLength > 20 * 1024 * 1024)
    throw new Error("Soubor je větší než 20 MB.");
  if (
    mimeType &&
    !mimeType.includes("spreadsheet") &&
    !mimeType.includes("octet-stream")
  )
    throw new Error("Soubor nemá očekávaný typ XLSX.");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);
  const cards = workbook.worksheets
    .map(parseEquipmentCardSheet)
    .filter((x): x is ParsedEquipmentCard => Boolean(x));
  return {
    fileName,
    checksum: createHash("sha256").update(bytes).digest("hex"),
    sheets: workbook.worksheets.length,
    cards,
  };
}

const same = (a: string | null | undefined, b: string | null | undefined) =>
  Boolean(a && b && normalizeCardLabel(a) === normalizeCardLabel(b));
export function matchEquipmentCard(
  card: ParsedEquipmentCard,
  candidates: EquipmentMatchCandidate[],
) {
  const f = (key: string) => card.fields[key]?.value;
  let found = candidates.filter((x) => same(x.serialNumber, f("serialNumber")));
  if (found.length === 1)
    return {
      status: "EXACT" as const,
      candidate: found[0],
      reason: "Přesné výrobní číslo",
    };
  found = candidates.filter((x) =>
    same(x.registrationNumber, f("registrationNumber")),
  );
  if (found.length === 1)
    return {
      status: "EXACT" as const,
      candidate: found[0],
      reason: "Přesné evidenční číslo",
    };
  found = candidates.filter(
    (x) =>
      same(x.legacyIdentificationNumber, f("legacyIdentificationNumber")) &&
      (same(x.manufacturer, f("manufacturer")) ||
        same(x.typeName, f("typeName"))),
  );
  if (found.length === 1)
    return {
      status: "EXACT" as const,
      candidate: found[0],
      reason: "Původní identifikační číslo a další údaj",
    };
  found = candidates.filter(
    (x) =>
      same(x.name, f("name")) &&
      same(x.manufacturer, f("manufacturer")) &&
      same(x.typeName, f("typeName")),
  );
  if (found.length === 1)
    return {
      status: "PROBABLE" as const,
      candidate: found[0],
      reason: "Název, výrobce a typ – pouze návrh",
    };
  if (found.length > 1)
    return {
      status: "DECISION" as const,
      candidates: found,
      reason: "Více možných shod",
    };
  return { status: "NEW" as const, reason: "Nebyla nalezena bezpečná shoda" };
}

export function cardConflicts(
  card: ParsedEquipmentCard,
  candidate: EquipmentMatchCandidate,
) {
  const map: Record<string, keyof EquipmentMatchCandidate> = {
    name: "name",
    manufacturer: "manufacturer",
    typeName: "typeName",
    serialNumber: "serialNumber",
    registrationNumber: "registrationNumber",
    legacyIdentificationNumber: "legacyIdentificationNumber",
  };
  return Object.entries(map).flatMap(([field, key]) => {
    const incoming = card.fields[field]?.value,
      current = candidate[key];
    return incoming && current && !same(String(current), incoming)
      ? [{ field, current: String(current), incoming }]
      : [];
  });
}
