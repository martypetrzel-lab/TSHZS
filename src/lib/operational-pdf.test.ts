import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  mergePdfDocuments,
  operationalPdfFilename,
  renderOperationalPdf,
  wrapPdfText,
  type OperationalPdfSnapshot,
} from "./operational-pdf";
const font = (bold: boolean) =>
  readFile(
    join(
      process.cwd(),
      "node_modules/dejavu-fonts-ttf/ttf",
      bold ? "DejaVuSans-Bold.ttf" : "DejaVuSans.ttf",
    ),
  );
function fixture(type: string, long: boolean): OperationalPdfSnapshot {
  return {
    type,
    title:
      type === "HANDOVER"
        ? "Předávací protokol"
        : type === "OUT_OF_SERVICE"
          ? "Protokol o technickém prostředku mimo provoz"
          : "Protokol o návrhu na opravu technického prostředku",
    number: `${type === "HANDOVER" ? "PP" : type === "OUT_OF_SERVICE" ? "MP" : "NO"}-MST-2026-000001`,
    protocolDate: "2026-11-25T12:00:00Z",
    eventOccurredAt: "2026-11-25T12:00:00Z",
    author: "Jan Testovací",
    equipment: Array.from(
      { length: type === "HANDOVER" && long ? 12 : 1 },
      (_, i) => ({
        id: `test-${i}`,
        name: "Fiktivní kalové čerpadlo – čtyřdílná sestava s příslušenstvím",
        uid: `TEST-UID-${i}`,
        serialNumber: `TEST-SN-${i}`,
        registrationNumber: "TEST-EV",
        manufacturer: "Fiktivní výrobce",
        model: "Model QA",
        placement: "Testovací vozidlo",
      }),
    ),
    data: {
      reason: "Fiktivní důvod pro ověření PDF",
      description: long
        ? "Dlouhý popis závady se všemi podrobnostmi a českou diakritikou. ".repeat(
            80,
          )
        : "Při funkčním ověření byla zjištěna závada spouštěcího prvku.",
      sender: "Jan Testovací",
      recipient: "Eva Testovací",
      recipientOrganization: "Fiktivní servis",
      condition: "Nefunkční spouštění",
      accessories: "Kabel a spojky",
      solution: "Oprava spouštěcího prvku a funkční zkouška",
      justification: "Obnovení bezpečné provozuschopnosti",
      estimatedCost: "1250.50",
      currency: "CZK",
    },
    stampEnabled: true,
  };
}
describe("jednostránkové provozní PDF", () => {
  it.each(["HANDOVER", "OUT_OF_SERVICE", "REPAIR_PROPOSAL"])(
    "vytvoří A4 a evidovanou přílohu pro %s",
    async (type) => {
      const snapshot = fixture(type, true),
        fonts = { regularFont: await font(false), boldFont: await font(true) };
      const main = await renderOperationalPdf({ snapshot, ...fonts });
      const loaded = await PDFDocument.load(main.bytes);
      expect(loaded.getPageCount()).toBe(1);
      expect(loaded.getPage(0).getWidth()).toBeCloseTo(595.28);
      expect(loaded.getPage(0).getHeight()).toBeCloseTo(841.89);
      expect(main.hasAppendix).toBe(true);
      const annex = await renderOperationalPdf({
        snapshot,
        ...fonts,
        appendix: true,
      });
      expect(
        (await PDFDocument.load(annex.bytes)).getPageCount(),
      ).toBeGreaterThanOrEqual(1);
      const basic = await renderOperationalPdf({
        snapshot: fixture(type, false),
        ...fonts,
      });
      expect((await PDFDocument.load(basic.bytes)).getPageCount()).toBe(1);
      if (process.env.PDF_QA === "1") {
        await mkdir("tmp/pdfs", { recursive: true });
        await writeFile(`tmp/pdfs/${type}.pdf`, basic.bytes);
        await writeFile(`tmp/pdfs/${type}-long.pdf`, main.bytes);
        await writeFile(`tmp/pdfs/${type}-annex.pdf`, annex.bytes);
      }
    },
  );
  it("zalamuje i dlouhý nepřerušený identifikátor v přesné šířce", async () => {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const regular = await pdf.embedFont(await font(false));
    const lines = wrapPdfText("X".repeat(300), regular, 8, 100);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines)
      expect(regular.widthOfTextAtSize(line, 8)).toBeLessThanOrEqual(100);
  });
  it("pojmenovává vícepoložkové předání i jednotlivý prostředek bezpečně", () => {
    expect(operationalPdfFilename(fixture("HANDOVER", true))).toBe(
      "Predavaci-protokol_PP-MST-2026-000001.pdf",
    );
    expect(operationalPdfFilename(fixture("REPAIR_PROPOSAL", false))).toContain(
      "Fiktivni-kalove-cerpadlo",
    );
    expect(operationalPdfFilename(fixture("HANDOVER", true), true)).toContain(
      "_Priloha-A.pdf",
    );
  });
  it("návrh a stornovaná kopie zůstávají jednostránkové", async () => {
    for (const flag of [{ draft: true }, { cancelled: true }]) {
      const result = await renderOperationalPdf({
        snapshot: fixture("HANDOVER", false),
        regularFont: await font(false),
        boldFont: await font(true),
        ...flag,
      });
      expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(1);
    }
  });
  it("fotografie umístí do propojené přílohy a zachová jednu hlavní A4", async () => {
    const snapshot = fixture("HANDOVER", false);
    snapshot.attachments = [
      {
        id: "test-photo",
        fileName: "Fiktivni-fotografie.png",
        checksum: "test",
        mimeType: "image/png",
      },
    ];
    const fonts = {
      regularFont: await font(false),
      boldFont: await font(true),
    };
    const main = await renderOperationalPdf({ snapshot, ...fonts });
    expect(main.hasAppendix).toBe(true);
    expect((await PDFDocument.load(main.bytes)).getPageCount()).toBe(1);
    const png = await sharp({
      create: {
        width: 640,
        height: 480,
        channels: 3,
        background: { r: 42, g: 95, b: 140 },
      },
    })
      .composite([
        {
          input: Buffer.from(
            '<svg width="640" height="480"><rect x="30" y="30" width="580" height="420" fill="none" stroke="white" stroke-width="4"/><text x="80" y="230" font-size="34" fill="white">FOTOGRAFIE – TEST QA</text><text x="115" y="285" font-size="22" fill="white">Fiktivni testovaci obrazec</text></svg>',
          ),
        },
      ])
      .png()
      .toBuffer();
    const annex = await renderOperationalPdf({
      snapshot,
      ...fonts,
      appendix: true,
      photographs: [
        {
          fileName: "Fiktivni-fotografie.png",
          bytes: png,
          mimeType: "image/png",
        },
      ],
    });
    expect(
      (await PDFDocument.load(annex.bytes)).getPageCount(),
    ).toBeGreaterThanOrEqual(1);
    if (process.env.PDF_QA === "1")
      await writeFile("tmp/pdfs/HANDOVER-photo-annex.pdf", annex.bytes);
  });
  it("sloučí hlavní protokol, fotografickou přílohu a nahrané PDF do jednoho souboru", async () => {
    const main = await PDFDocument.create();
    main.addPage();
    const annex = await PDFDocument.create();
    annex.addPage();
    const uploaded = await PDFDocument.create();
    uploaded.addPage();
    uploaded.addPage();
    const complete = await mergePdfDocuments([
      await main.save(),
      await annex.save(),
      await uploaded.save(),
    ]);
    expect((await PDFDocument.load(complete)).getPageCount()).toBe(4);
  });
});
