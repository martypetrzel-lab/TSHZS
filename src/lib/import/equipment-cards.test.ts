import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  cardConflicts,
  matchEquipmentCard,
  parseEquipmentCardSheet,
} from "./equipment-cards";

function card(rows: unknown[][], name = "Karta 1") {
  const workbook = new ExcelJS.Workbook(),
    sheet = workbook.addWorksheet(name);
  rows.forEach((row) => sheet.addRow(row));
  return parseEquipmentCardSheet(sheet);
}
const base = [
  ["Identifikační číslo:", "ID-15"],
  ["Druh prostředku:", "Nastavovací žebřík"],
  ["Výrobce:", "ALVE"],
  ["Typ:", "3dílný"],
  ["Datum výroby:", new Date("2020-01-02")],
  ["Technické parametry:"],
  ["Délka:", "8 m"],
  ["Počet dílů:", "3 ks"],
  [
    "Datum",
    "Nasazení,cvičení,místo",
    "Doba",
    "Zajištěná závada",
    "Přezkoušení, odstranění závad",
    "Poznámka, podpis",
  ],
  [
    new Date("2023-05-01"),
    "Cvičení Mstětice",
    "01:30",
    "Prasklá patka",
    "Vyměněna",
    "Novák",
  ],
];

describe("import původních karet prostředků", () => {
  it("načte běžnou kartu žebříku", () =>
    expect(card(base)?.fields.typeName.value).toBe("Nastavovací žebřík"));
  it("načte výrobní číslo přímo z první řádky", () =>
    expect(
      card([["Výrobní číslo: SN-001"], ...base])?.fields.serialNumber.value,
    ).toBe("SN-001"));
  it("zachová text osobního přidělení", () =>
    expect(
      card([["V užívání osoby:", "Jan Novák"], ...base])?.fields
        .assignedPersonText.value,
    ).toBe("Jan Novák"));
  it("rozpozná EV. Č.", () =>
    expect(
      card([["EV. Č.:", "EV-77"], ...base])?.fields.registrationNumber.value,
    ).toBe("EV-77"));
  it("upozorní na chybějícího výrobce", () =>
    expect(card(base.filter((r) => r[0] !== "Výrobce:"))?.warnings).toContain(
      "Chybí výrobce.",
    ));
  it("upozorní na chybějící datum výroby", () =>
    expect(
      card(base.filter((r) => r[0] !== "Datum výroby:"))?.warnings,
    ).toContain("Chybí datum výroby."));
  it("načte dynamické technické parametry i jednotky", () =>
    expect(card(base)?.specifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Délka", value: "8", unit: "m" }),
        expect.objectContaining({ name: "Počet dílů", value: "3", unit: "ks" }),
      ]),
    ));
  it("načte provozní deník bez ztráty podpisu", () =>
    expect(card(base)?.logEntries[0]).toMatchObject({
      eventType: "DEFECT",
      locationText: "Cvičení Mstětice",
      durationMinutes: 90,
      defectDescription: "Prasklá patka",
      remedyDescription: "Vyměněna",
      legacySignatureText: "Novák",
    }));
  it("ignoruje prázdný list", () => expect(card([])).toBeNull());
  it("ignoruje šablonu VZOR-NEVYPLŇOVAT", () =>
    expect(card(base, "VZOR-NEVYPLŇOVAT")).toBeNull());
  it("spáruje přesné výrobní číslo s existujícím prostředkem", () => {
    const parsed = card([["Výrobní číslo:", "SN-1"], ...base])!;
    expect(
      matchEquipmentCard(parsed, [
        {
          id: "1",
          name: "Jiný",
          manufacturer: null,
          typeName: null,
          serialNumber: "SN-1",
          registrationNumber: null,
          legacyIdentificationNumber: null,
        },
      ]),
    ).toMatchObject({ status: "EXACT", candidate: { id: "1" } });
  });
  it("nikdy neoznačí samotný název jako shodu", () => {
    const parsed = card(base)!;
    expect(
      matchEquipmentCard(parsed, [
        {
          id: "1",
          name: "Nastavovací žebřík",
          manufacturer: null,
          typeName: null,
          serialNumber: null,
          registrationNumber: null,
          legacyIdentificationNumber: null,
        },
      ]).status,
    ).toBe("NEW");
  });
  it("zobrazí konflikt výrobce", () => {
    const parsed = card(base)!;
    expect(
      cardConflicts(parsed, {
        id: "1",
        name: "Nastavovací žebřík",
        manufacturer: "SWS",
        typeName: "Nastavovací žebřík",
        serialNumber: null,
        registrationNumber: null,
        legacyIdentificationNumber: "ID-15",
      }),
    ).toContainEqual({
      field: "manufacturer",
      current: "SWS",
      incoming: "ALVE",
    });
  });
});
