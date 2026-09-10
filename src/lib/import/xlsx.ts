import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import JSZip from "jszip";

export const MAX_XLSX_BYTES = 20 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 120 * 1024 * 1024;
const MAX_ROWS_PER_SHEET = 20_000;
const MAX_TOTAL_CELLS = 250_000;
const REQUIRED_SHEET = "Kontrola 1";

export const equipmentHeaders = [
  "UID",
  "ID",
  "Tech.prostředek",
  "Typ revize/Kontrola",
  "Datum kontroly",
  "Kontroloval",
  "Kontrola provedena (ANO/NE)",
  "Datum příští kontroly",
  "Vůz",
  "PROTOKOL",
] as const;

export type LegacyRequirement = {
  key: "annual" | "semiannual" | "weekly" | "revision";
  name: string;
  type: "INSPECTION" | "REVISION";
  intervalValue?: number;
  intervalUnit?: "DAYS" | "WEEKS" | "MONTHS" | "YEARS";
  lastCompletedAt?: string | null;
  nextDueAt?: string | null;
  needsReview?: boolean;
  note?: string | null;
};
export type ParsedEquipmentRow = {
  sheetName: "Kontrola 1";
  rowNumber: number;
  uid: string;
  legacyId: string;
  name: string;
  vehicle: string;
  requirements: LegacyRequirement[];
  completed: boolean;
  lastCompletedAt: string | null;
  nextDueAt: string | null;
  protocolReference: string;
  warnings: string[];
  errors: string[];
  needsReview: boolean;
  requiresMapping: boolean;
  raw: Record<string, string | null>;
};
export type ParsedProtocolRow = {
  sheetName: "Historie protokolů";
  rowNumber: number;
  number: string;
  uid: string;
  externalUrl: string | null;
  snapshot: Record<string, string | null>;
  warnings: string[];
  errors: string[];
};
export type WorkbookAnalysis = {
  fileName: string;
  checksum: string;
  sheets: { name: string; rows: number }[];
  equipment: ParsedEquipmentRow[];
  protocols: ParsedProtocolRow[];
  warnings: string[];
  errors: string[];
  hasLegacyChecklist: boolean;
};

function text(value: ExcelJS.CellValue | undefined): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value) return String(value.text).trim();
    if ("result" in value) return text(value.result as ExcelJS.CellValue);
    if ("richText" in value)
      return value.richText
        .map((part) => part.text)
        .join("")
        .trim();
  }
  return String(value).trim();
}

function cellText(cell: ExcelJS.Cell): string {
  return cell.text?.trim() || text(cell.value);
}

export function parseLegacyDate(
  value: ExcelJS.CellValue | undefined,
): string | null {
  if (value == null || value === "") return null;
  let year: number, month: number, day: number;
  if (value instanceof Date)
    ({ year, month, day } = {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
    });
  else if (typeof value === "number") {
    const parts = new Date(
      Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000,
    );
    ({ year, month, day } = {
      year: parts.getUTCFullYear(),
      month: parts.getUTCMonth() + 1,
      day: parts.getUTCDate(),
    });
  } else {
    const raw = text(value).replace(/\s+.*/, "");
    const match = raw.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
    if (match) [, day, month, year] = match.map(Number);
    else {
      const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (!iso) return null;
      [, year, month, day] = iso.map(Number);
    }
  }
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return Number.isNaN(date.valueOf()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
    ? null
    : date.toISOString();
}

export function parseRequirements(value: string): {
  requirements: LegacyRequirement[];
  unknown: string[];
} {
  const requirements: LegacyRequirement[] = [];
  const unknown: string[] = [];
  for (const token of value
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)) {
    const normalized = token.toLocaleLowerCase("cs-CZ");
    if (normalized === "roční")
      requirements.push({
        key: "annual",
        name: "Roční",
        type: "INSPECTION",
        intervalValue: 12,
        intervalUnit: "MONTHS",
      });
    else if (normalized === "půlroční")
      requirements.push({
        key: "semiannual",
        name: "Půlroční",
        type: "INSPECTION",
        intervalValue: 6,
        intervalUnit: "MONTHS",
      });
    else if (normalized.includes("týdenní"))
      requirements.push({
        key: "weekly",
        name: "Týdenní kontrola",
        type: "INSPECTION",
        intervalValue: 1,
        intervalUnit: "WEEKS",
      });
    else if (normalized === "revize")
      requirements.push({ key: "revision", name: "Revize", type: "REVISION" });
    else unknown.push(token);
  }
  return {
    requirements: requirements.filter(
      (item, index, all) =>
        all.findIndex((other) => other.key === item.key) === index,
    ),
    unknown,
  };
}

function headerMap(sheet: ExcelJS.Worksheet) {
  const map = new Map<string, number>();
  sheet
    .getRow(1)
    .eachCell((cell, column) =>
      map.set(text(cell.value).replace(/\s+/g, " "), column),
    );
  return map;
}

function rowObject(row: ExcelJS.Row, headers: Map<string, number>) {
  return Object.fromEntries(
    [...headers].map(([name, column]) => [
      name,
      text(row.getCell(column).value) || null,
    ]),
  );
}

function validExternalUrl(raw: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function validateUpload(
  fileName: string,
  mimeType: string,
  bytes: Uint8Array,
) {
  if (!fileName.toLocaleLowerCase("cs-CZ").endsWith(".xlsx"))
    throw new Error("Povolen je pouze soubor .xlsx.");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_XLSX_BYTES)
    throw new Error("Soubor musí mít nejvýše 20 MB.");
  const allowed = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
  ];
  if (!allowed.includes(mimeType))
    throw new Error("Soubor nemá platný typ XLSX.");
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    throw new Error("Obsah souboru není platný XLSX archiv.");
}

export async function analyzeWorkbook(
  fileName: string,
  mimeType: string,
  bytes: Uint8Array,
): Promise<WorkbookAnalysis> {
  validateUpload(fileName, mimeType, bytes);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error("Soubor XLSX je poškozený nebo neplatný.");
  }
  let expanded = 0;
  for (const entry of Object.values(zip.files)) {
    const size =
      (entry as unknown as { _data?: { uncompressedSize?: number } })._data
        ?.uncompressedSize ?? 0;
    expanded += size;
    if (expanded > MAX_UNCOMPRESSED_BYTES)
      throw new Error("Rozbalený sešit je příliš velký.");
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(bytes) as never, {
      ignoreNodes: ["dataValidations", "extLst", "hyperlinks"],
    });
  } catch {
    throw new Error("Soubor XLSX se nepodařilo bezpečně načíst.");
  }
  if (workbook.worksheets.length > 12)
    throw new Error("Sešit obsahuje příliš mnoho listů.");
  let cells = 0;
  for (const sheet of workbook.worksheets) {
    if (sheet.rowCount > MAX_ROWS_PER_SHEET)
      throw new Error(`List ${sheet.name} obsahuje příliš mnoho řádků.`);
    cells += sheet.rowCount * Math.min(sheet.columnCount, 200);
  }
  if (cells > MAX_TOTAL_CELLS)
    throw new Error("Sešit obsahuje příliš mnoho buněk.");
  const main = workbook.getWorksheet(REQUIRED_SHEET);
  if (!main) throw new Error(`Chybí povinný list „${REQUIRED_SHEET}“.`);
  const headers = headerMap(main);
  const missing = equipmentHeaders.filter((header) => !headers.has(header));
  const errors = missing.length
    ? [`Chybí sloupce: ${missing.join(", ")}.`]
    : [];
  const equipment: ParsedEquipmentRow[] = [];
  if (!missing.length)
    for (let number = 2; number <= main.rowCount; number++) {
      const row = main.getRow(number);
      const raw = rowObject(row, headers);
      const originalUid = text(row.getCell(headers.get("UID")!).value);
      const legacyId = cellText(row.getCell(headers.get("ID")!));
      const originalName = text(
        row.getCell(headers.get("Tech.prostředek")!).value,
      );
      if (!originalUid && !legacyId && !originalName) continue;
      const uid =
        originalUid ||
        (legacyId
          ? `LEGACY-${createHash("sha256").update(legacyId).digest("hex").slice(0, 10).toUpperCase()}`
          : "");
      const name =
        originalName ||
        (originalUid
          ? `Neurčený prostředek – ${originalUid}`
          : legacyId
            ? `Neurčený prostředek – ID ${legacyId}`
            : "");
      const parsed = parseRequirements(
        text(row.getCell(headers.get("Typ revize/Kontrola")!).value),
      );
      const completed = /^ano$/i.test(
        text(row.getCell(headers.get("Kontrola provedena (ANO/NE)")!).value),
      );
      const controlRaw = row.getCell(headers.get("Datum kontroly")!).value;
      const dueRaw = row.getCell(headers.get("Datum příští kontroly")!).value;
      const lastCompletedAt = completed ? parseLegacyDate(controlRaw) : null;
      const nextDueAt = parseLegacyDate(dueRaw);
      const requiresMapping =
        (parsed.requirements.length > 1 &&
          Boolean(lastCompletedAt || nextDueAt)) ||
        parsed.requirements.some(
          (requirement) =>
            !requirement.intervalValue || !requirement.intervalUnit,
        );
      const warnings = parsed.unknown.map(
        (item) => `Neznámý typ povinnosti: ${item}`,
      );
      const placement = text(
        row.getCell(headers.get("Vůz")!).value,
      ).toUpperCase();
      if (placement && !["PHA", "SCANIA", "TA", "STANICE"].includes(placement))
        warnings.push(`Neznámé vozidlo nebo umístění: ${placement}`);
      if (!originalName && (originalUid || legacyId))
        warnings.push(
          "Původní evidence neobsahovala název prostředku. Název je potřeba doplnit po importu.",
        );
      if (!originalUid && legacyId)
        warnings.push(
          `UID chybělo; bylo vytvořeno stabilní importní UID ${uid}.`,
        );
      if (parsed.requirements.length > 1 && (lastCompletedAt || nextDueAt))
        warnings.push(
          "Více povinností sdílí jeden termín; vyžaduje kontrolu mapování.",
        );
      if (
        parsed.requirements.some(
          (requirement) =>
            !requirement.intervalValue || !requirement.intervalUnit,
        )
      )
        warnings.push(
          "Interval povinnosti není ve staré evidenci určen; vyžaduje mapování nebo doplnění později.",
        );
      if (
        !completed &&
        parsed.requirements.some((item) => item.type === "REVISION") &&
        !nextDueAt
      ) {
        const proposed = parseLegacyDate(controlRaw);
        if (proposed && new Date(proposed) > new Date())
          warnings.push("Vyžaduje kontrolu mapování termínu revize.");
      }
      const rowErrors = [
        ...(!originalUid && !legacyId
          ? ["Chybí UID i původní ID; prostředek nelze bezpečně identifikovat."]
          : []),
        ...(parsed.requirements.length === 0
          ? ["Není rozpoznána žádná povinnost."]
          : []),
      ];
      equipment.push({
        sheetName: REQUIRED_SHEET,
        rowNumber: number,
        uid,
        legacyId,
        name,
        vehicle: text(row.getCell(headers.get("Vůz")!).value),
        requirements: parsed.requirements.map((requirement) => ({
          ...requirement,
          lastCompletedAt: requiresMapping ? null : lastCompletedAt,
          nextDueAt: requiresMapping ? null : nextDueAt,
          needsReview: requiresMapping,
          note: requiresMapping
            ? "Termín nebo interval ze staré evidence vyžaduje ruční mapování."
            : null,
        })),
        completed,
        lastCompletedAt,
        nextDueAt,
        protocolReference: text(row.getCell(headers.get("PROTOKOL")!).value),
        warnings,
        errors: rowErrors,
        needsReview: !originalName,
        requiresMapping,
        raw,
      });
    }
  const protocols: ParsedProtocolRow[] = [];
  const history = workbook.getWorksheet("Historie protokolů");
  if (history && history.rowCount > 1) {
    const h = headerMap(history);
    for (let number = 2; number <= history.rowCount; number++) {
      const row = history.getRow(number);
      const snapshot = rowObject(row, h);
      const protocolNumber = text(
        row.getCell(h.get("ID protokolu") ?? 0).value,
      );
      const uid = text(row.getCell(h.get("UID prostředku") ?? 0).value);
      if (!protocolNumber && !uid) continue;
      const linkRaw = text(
        row.getCell(h.get("PDF odkaz") ?? h.get("ODKAZ") ?? 0).value,
      );
      const externalUrl = validExternalUrl(linkRaw);
      protocols.push({
        sheetName: "Historie protokolů",
        rowNumber: number,
        number: protocolNumber,
        uid,
        externalUrl,
        snapshot,
        warnings:
          linkRaw && !externalUrl
            ? ["Externí odkaz není platná HTTP(S) URL."]
            : [],
        errors: [
          ...(!protocolNumber ? ["Chybí ID protokolu."] : []),
          ...(!uid ? ["Chybí UID prostředku."] : []),
        ],
      });
    }
  }
  return {
    fileName,
    checksum: createHash("sha256").update(bytes).digest("hex"),
    sheets: workbook.worksheets.map((sheet) => ({
      name: sheet.name,
      rows: Math.max(0, sheet.rowCount - 1),
    })),
    equipment,
    protocols,
    warnings: [],
    errors,
    hasLegacyChecklist: Boolean(workbook.getWorksheet("Protokol")),
  };
}
