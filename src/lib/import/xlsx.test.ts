import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  analyzeWorkbook,
  identifierCellText,
  parseLegacyDate,
  parseRequirements,
  validateUpload,
} from "./xlsx";

const mime =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
async function fixture() {
  const book = new ExcelJS.Workbook();
  const main = book.addWorksheet("Kontrola 1");
  main.addRow([
    "UID",
    "ID",
    "Tech.prostředek",
    "Typ revize/Kontrola",
    "Datum kontroly",
    "Kontroloval",
    "Kontrola provedena (ANO/NE)",
    "Datum příští kontroly",
    "Počet dní do kontroly",
    "Upozornění odesláno",
    "Vůz",
    "PROTOKOL",
  ]);
  main.addRow([
    "UID-1",
    "00123",
    "Hadice",
    "Roční",
    new Date("2025-01-15T00:00:00Z"),
    "Novák",
    "ANO",
    new Date("2026-01-15T00:00:00Z"),
    0,
    "NE",
    "PHA",
    "PROT-1",
  ]);
  main.addRow([
    "UID-2",
    "zone 2 A211089",
    "Přístroj",
    "Roční, Půlroční",
    45672,
    "Svoboda",
    "NE",
    45855,
    0,
    "ANO",
    "SCANIA",
    "",
  ]);
  main.addRow([
    "UID-3",
    300086,
    "Měřidlo",
    "REVIZE",
    null,
    "",
    "NE",
    null,
    0,
    "NE",
    "TA",
    "",
  ]);
  main.addRow([
    "UID-4",
    "219603|Elektrody:732440",
    "Sada",
    "Týdenní kontrola, Roční",
    null,
    "",
    "NE",
    null,
    0,
    "NE",
    "STANICE",
    "",
  ]);
  main.addRow([
    "UID-5",
    "000077",
    "",
    "Roční",
    null,
    "",
    "NE",
    null,
    0,
    "NE",
    "PHA",
    "",
  ]);
  main.addRow([
    "",
    "A218071",
    "",
    "REVIZE",
    null,
    "",
    "NE",
    new Date("2028-08-15T00:00:00Z"),
    0,
    "NE",
    "STANICE",
    "",
  ]);
  book.addWorksheet("Protokol").addRow(["Vizuální kontrola"]);
  book.addWorksheet("Karta Prostředku");
  const history = book.addWorksheet("Historie protokolů");
  history.addRow([
    "ČAS",
    "ID protokolu",
    "UID prostředku",
    "Název prostředku",
    "ID prostředku",
    "Typ kontroly",
    "Datum kontroly",
    "Datum příští kontroly",
    "Počet dní",
    "Stav",
    "Kontroloval",
    "Datum uzavření",
    "PDF odkaz",
    "ODKAZ",
  ]);
  history.addRow([
    null,
    "PROT-1",
    "UID-1",
    "Hadice",
    "00123",
    "Roční",
    "15.1.2025",
    "15.1.2026",
    0,
    "Uzavřeno",
    "Novák",
    "16.1.2025",
    "https://drive.google.com/file/d/example/view",
    null,
  ]);
  history.addRow([
    null,
    "PROT-1",
    "UID-1",
    "Hadice",
    "00123",
    "Roční",
    null,
    null,
    0,
    "Uzavřeno",
    "Novák",
    null,
    null,
    null,
  ]);
  return new Uint8Array(await book.xlsx.writeBuffer());
}

describe("legacy XLSX", () => {
  it("nikdy neserializuje identifikační buňku jako JavaScript Date", () => {
    const book = new ExcelJS.Workbook();
    const cell = book.addWorksheet("ID").getCell("A1");
    cell.value = new Date(2026, 2, 1);
    expect(identifierCellText(cell)).toBe("2026-03-01");
    expect(identifierCellText(cell)).not.toContain("GMT");
  });
  it("normalizuje samostatné povinnosti", () => {
    expect(
      parseRequirements("Týdenní kontrola, Roční, REVIZE").requirements.map(
        (r) => r.key,
      ),
    ).toEqual(["weekly", "annual", "revision"]);
  });
  it("zachovává datum bez posunu dne", () => {
    expect(parseLegacyDate("15.1.2025")?.slice(0, 10)).toBe("2025-01-15");
    expect(parseLegacyDate(45672)?.slice(0, 10)).toMatch(/^2025-/);
  });
  it("analyzuje syntetickou strukturu včetně ID, vozidel a historie", async () => {
    const analysis = await analyzeWorkbook(
      "Kontrola techniky.xlsx",
      mime,
      await fixture(),
    );
    expect(analysis.equipment).toHaveLength(6);
    expect(analysis.equipment[0].legacyId).toBe("00123");
    expect(analysis.equipment[1].legacyId).toBe("zone 2 A211089");
    expect(analysis.equipment.slice(0, 4).map((r) => r.vehicle)).toEqual([
      "PHA",
      "SCANIA",
      "TA",
      "STANICE",
    ]);
    expect(analysis.equipment[1].warnings.join(" ")).toContain(
      "Více povinností",
    );
    expect(
      analysis.equipment[1].requirements.every(
        (requirement) => requirement.nextDueAt === null,
      ),
    ).toBe(true);
    expect(analysis.equipment[4]).toMatchObject({
      name: "Neurčený prostředek – UID-5",
      needsReview: true,
      errors: [],
    });
    expect(analysis.equipment[5].name).toBe("Neurčený prostředek – ID A218071");
    expect(analysis.equipment[5].uid).toMatch(/^LEGACY-/);
    expect(analysis.protocols[0].number).toBe("PROT-1");
    expect(analysis.protocols[0].externalUrl).toContain("drive.google.com");
    expect(analysis.hasLegacyChecklist).toBe(true);
  });
  it("odmítá nepovolený a poškozený soubor", async () => {
    expect(() =>
      validateUpload("data.xlsm", mime, new Uint8Array([0x50, 0x4b])),
    ).toThrow(".xlsx");
    await expect(
      analyzeWorkbook("data.xlsx", mime, new Uint8Array([0x50, 0x4b, 1, 2])),
    ).rejects.toThrow("poškozený");
  });
});
