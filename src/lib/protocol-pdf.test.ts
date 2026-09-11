import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { describe, expect, it } from "vitest";
import {
  formatProtocolDate,
  formatProtocolInterval,
  protocolDownloadFilename,
  protocolResultLabel,
  renderProtocolPdf,
  infoGridColumns,
} from "./protocol-pdf";

const font = (weight: number) =>
  readFile(
    join(
      process.cwd(),
      "node_modules/dejavu-fonts-ttf/ttf",
      weight === 700 ? "DejaVuSans-Bold.ttf" : "DejaVuSans.ttf",
    ),
  );

function protocolFixture(kind: string, itemCount: number) {
  return {
    equipment: {
      name: kind,
      uid: "UID-70C2B057",
      legacyId: "300086",
      registrationNumber: "300086",
      serialNumber: "300086",
      manufacturer: "Tauchman",
      model: "PROFI-AL/HN3",
      vehicle: "TA",
    },
    requirement: {
      name: "Půlroční kontrola",
      intervalValue: 6,
      intervalUnit: "MONTHS",
      source: "Importovaná původní evidence s delším názvem zdroje požadavku",
      article: "Interní metodika",
    },
    checklist: {
      name: `Kontrolní seznam - ${kind}`,
      sections: ["Identifikace", "Vizuální kontrola", "Funkční kontrola", "Dokumentace"].map((title, section) => ({
        title,
        items: Array.from({ length: Math.ceil(itemCount / 4) }, (_, index) => ({
          label: `${section + 1}.${index + 1} Kontrolní bod technického prostředku se všemi požadovanými částmi`,
          value: "VYHOVUJE",
        })),
      })),
    },
    inspection: {
      inspector: "Administrátor",
      performedAt: "2026-09-11T12:00:00.000Z",
      protocolDate: "2026-09-11T12:00:00.000Z",
      completedAt: "2026-09-11T12:00:00.000Z",
      nextDueAt: "2027-03-11T12:00:00.000Z",
      result: "PASSED",
    },
  };
}

describe("český PDF protokol", () => {
  it("pojmenuje soubor podle historického názvu prostředku", () =>
    expect(
      protocolDownloadFilename(
        { equipment: { name: "Nastavovací žebřík 4-dílný" } },
        "TS-MST-2026-000004",
      ),
    ).toBe("Nastavovaci-zebrik-4-dilny_TS-MST-2026-000004.pdf"));

  it("odstraní nepovolené znaky a sloučí oddělovače", () =>
    expect(
      protocolDownloadFilename(
        { equipment: { name: ' Deflektor: C52 / PHA ** "test" ' } },
        "TS-MST-2026-000003",
      ),
    ).toBe("Deflektor-C52-PHA-test_TS-MST-2026-000003.pdf"));

  it("při chybějícím názvu použije UID ze snapshotu", () =>
    expect(
      protocolDownloadFilename(
        { equipment: { uid: "UID-70C2B057" } },
        "TS-MST-2026-000005",
      ),
    ).toBe("Technicky-prostredek-UID-70C2B057_TS-MST-2026-000005.pdf"));

  it("omezí pouze název prostředku a zachová celé číslo protokolu", () => {
    const protocol = "TS-MST-2026-000006";
    const filename = protocolDownloadFilename(
      { equipment: { name: "A".repeat(120) } },
      protocol,
    );
    expect(filename).toBe(`${"A".repeat(80)}_${protocol}.pdf`);
  });

  it.each([
    [1, "MONTHS", "1 měsíc"],
    [6, "MONTHS", "6 měsíců"],
    [1, "YEARS", "1 rok"],
    [5, "YEARS", "5 let"],
    [1, "WEEKS", "1 týden"],
    [2, "DAYS", "2 dny"],
    [10, "DAYS", "10 dní"],
  ])("přeloží interval %s %s", (value, unit, expected) =>
    expect(formatProtocolInterval(value, unit)).toBe(expected),
  );

  it("formátuje čas v Europe/Prague", () =>
    expect(formatProtocolDate("2026-09-11T09:44:00.000Z", true)).toBe(
      "11. 9. 2026, 11:44",
    ));

  it("překládá výsledky bez anglických enumů", () => {
    expect(protocolResultLabel("PASSED")).toBe("VYHOVUJE");
    expect(protocolResultLabel("FAILED")).toBe("NEVYHOVUJE");
    expect(protocolResultLabel("PASSED_WITH_LIMITATION")).toBe(
      "VYHOVUJE S OMEZENÍM",
    );
  });

  it("vytvoří platné PDF s českým fontem", async () => {
    const bytes = await renderProtocolPdf({
      number: "TS-MST-2026-000003",
      snapshot: {
        equipment: { name: "Nastavovací žebřík", uid: "UID-70C2B057" },
        requirement: {
          name: "Půlroční",
          intervalValue: 6,
          intervalUnit: "MONTHS",
        },
        inspection: {
          inspector: "Jan Žluťoučký",
          completedAt: "2026-09-11T09:44:00.000Z",
          result: "PASSED",
        },
      },
      regularFont: await font(400),
      boldFont: await font(700),
    });
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getPageCount()).toBe(1);
    expect(bytes.byteLength).toBeGreaterThan(10_000);
  });

  it.each([
    ["Obecný prostředek", 12],
    ["Nastavovací žebřík 4-dílný", 16],
    ["Sací hadice", 20],
    ["AED", 24],
    ["Dlouhý kontrolní seznam", 44],
  ])("udrží %s s %i položkami na jediné straně", async (kind, itemCount) => {
    const bytes = await renderProtocolPdf({
      number: "TS-MST-2026-000010",
      snapshot: protocolFixture(kind, itemCount),
      regularFont: await font(400),
      boldFont: await font(700),
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("odděluje dlouhý label data od hodnoty nejméně pěti body", async () => {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const bold = await pdf.embedFont(await font(700));
    const [firstPair] = infoGridColumns(595.28 - 76);
    const labelRight = firstPair.labelX + bold.widthOfTextAtSize("Datum provedení", 7.2);
    expect(firstPair.valueX - labelRight).toBeGreaterThanOrEqual(5);
  });
});
