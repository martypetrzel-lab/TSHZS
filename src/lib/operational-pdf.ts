import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatProtocolDate, protocolDownloadFilename } from "./protocol-pdf";
import { operationalLabels, publicFieldValue } from "./operational-fields";
export type OperationalPdfSnapshot = {
  type: string;
  title: string;
  number?: string | null;
  protocolDate: string;
  eventOccurredAt?: string | null;
  author: string;
  data: Record<string, string>;
  equipment: {
    name: string;
    uid: string;
    manufacturer?: string | null;
    model?: string | null;
    serialNumber?: string | null;
    registrationNumber?: string | null;
    placement?: string | null;
    status?: string;
    id?: string;
  }[];
  items?: { equipmentId: string; quantity: number; details: unknown }[];
  attachments?: {
    id: string;
    fileName: string;
    checksum: string;
    mimeType?: string;
  }[];
  stampEnabled?: boolean;
  hasAppendix?: boolean;
};
const W = 595.28,
  H = 841.89,
  M = 38,
  WIDTH = W - 2 * M,
  BOTTOM = 175;
const navy = rgb(0.08, 0.2, 0.31),
  blue = rgb(0.12, 0.39, 0.58),
  gray = rgb(0.35, 0.39, 0.43),
  light = rgb(0.92, 0.95, 0.97),
  red = rgb(0.7, 0.12, 0.12);
export function wrapPdfText(
  value: string,
  font: PDFFont,
  size: number,
  width: number,
) {
  const result: string[] = [];
  for (const paragraph of value.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (font.widthOfTextAtSize(word, size) > width) {
        if (line) {
          result.push(line);
          line = "";
        }
        let chunk = "";
        for (const char of word) {
          if (font.widthOfTextAtSize(chunk + char, size) > width && chunk) {
            result.push(chunk);
            chunk = "";
          }
          chunk += char;
        }
        line = chunk;
      } else if (
        line &&
        font.widthOfTextAtSize(`${line} ${word}`, size) > width
      ) {
        result.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    result.push(line);
  }
  return result;
}
export function operationalPdfFilename(
  snapshot: OperationalPdfSnapshot,
  appendix = false,
) {
  return protocolDownloadFilename(
    {
      equipment: {
        name:
          snapshot.equipment.length === 1
            ? snapshot.equipment[0].name
            : "Predavaci-protokol",
      },
    },
    `${snapshot.number || "NAVRH"}${appendix ? "_Priloha-A" : ""}`,
  );
}
function stamp(page: PDFPage, bold: PDFFont) {
  const x = W - M - 45,
    y = 92;
  for (const radius of [42, 38])
    page.drawCircle({
      x,
      y,
      size: radius,
      borderColor: blue,
      borderWidth: 0.9,
    });
  [
    ["TECHNICKÁ SLUŽBA", 22, 5.8],
    ["HZS ČEPRO", 10, 7],
    ["TS", -7, 15],
    ["MSTĚTICE", -22, 7],
    ["4773", -33, 6],
  ].forEach(([label, offset, size]) =>
    page.drawText(String(label), {
      x: x - bold.widthOfTextAtSize(String(label), Number(size)) / 2,
      y: y + Number(offset),
      font: bold,
      size: Number(size),
      color: blue,
    }),
  );
}
export async function renderOperationalPdf(input: {
  snapshot: OperationalPdfSnapshot;
  regularFont: Uint8Array;
  boldFont: Uint8Array;
  draft?: boolean;
  cancelled?: boolean;
  appendix?: boolean;
  photographs?: {
    fileName: string;
    bytes: Uint8Array;
    mimeType: "image/jpeg" | "image/png";
  }[];
}) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(input.regularFont, { subset: true }),
    bold = await pdf.embedFont(input.boldFont, { subset: true });
  const s = input.snapshot,
    number = s.number || "NÁVRH – NEVYSTAVENO";
  const allBlocks: { label: string; value: string }[] = [];
  if (s.type === "REPAIR_PROPOSAL")
    allBlocks.push({
      label: "Stav návrhu",
      value:
        s.data.approvalDecision ||
        "ČEKÁ NA SCHVÁLENÍ – návrh není objednávkou opravy.",
    });
  s.equipment.forEach((e, index) =>
    allBlocks.push({
      label: `Prostředek ${index + 1}`,
      value: `${e.name} | UID: ${e.uid} | Výr. č.: ${e.serialNumber || "—"} | Ev. č.: ${e.registrationNumber || "—"}\nVýrobce: ${e.manufacturer || "—"} | Model: ${e.model || "—"} | Umístění: ${e.placement || "—"}`,
    }),
  );
  Object.entries(s.data)
    .filter(
      ([key, value]) =>
        value && !key.endsWith("Id") && key !== "approvalDecision",
    )
    .forEach(([key, value]) =>
      allBlocks.push({
        label:
          operationalLabels[key] ??
          (
            {
              documentVersion: "Verze dokumentu",
              serviceOrganization: "Servisní organizace",
              responsiblePerson: "Odpovědná osoba",
            } as Record<string, string>
          )[key] ??
          "Doplňující údaj",
        value: publicFieldValue(key, value),
      }),
    );
  s.items?.forEach((item, index) => {
    const details = item.details as Record<string, string>;
    allBlocks.push({
      label: `Položka ${index + 1} · ${item.quantity} ks`,
      value:
        Object.entries(details)
          .filter(([, value]) => value)
          .map(([key, value]) => `${operationalLabels[key] ?? key}: ${value}`)
          .join("; ") || "Bez další poznámky",
    });
  });
  const attachmentBlock = s.attachments?.length
    ? {
        label: `Evidované přílohy (${s.attachments.length})`,
        value: s.attachments
          .map(
            (a, index) =>
              `Příloha ${index + 1}: ${a.fileName} · SHA-256 ${a.checksum.slice(0, 12)}`,
          )
          .join("\n"),
      }
    : null;
  if (attachmentBlock) allBlocks.push(attachmentBlock);
  const measure = (block: { label: string; value: string }, size = 8) =>
    13 + wrapPdfText(block.value, regular, size, WIDTH - 12).length * 10 + 5;
  const main: typeof allBlocks = [],
    annex: typeof allBlocks = [];
  const photoCount =
    s.attachments?.filter((a) => a.mimeType?.startsWith("image/")).length ??
    input.photographs?.length ??
    0;
  let used = 0;
  for (const block of allBlocks) {
    const height = measure(block);
    if (block === attachmentBlock) annex.push(block);
    else if (used + height <= 420 && annex.length === 0) {
      main.push(block);
      used += height;
    } else annex.push(block);
  }
  if (annex.length || photoCount)
    main.push({
      label: "Příloha A – pokračování protokolu a fotografie",
      value: `Nedílná příloha dokumentu ${number}: ${annex.length} pokračujících bloků, ${photoCount} fotografií. Obsahuje úplné údaje a je dostupná samostatně u tohoto protokolu.`,
    });
  let page = pdf.addPage([W, H]),
    y = H - 112;
  const header = (appendix: boolean) => {
    page.drawRectangle({ x: 0, y: H - 91, width: W, height: 91, color: navy });
    page.drawText("HZS ČEPRO", {
      x: M,
      y: H - 24,
      size: 13,
      font: bold,
      color: rgb(1, 1, 1),
    });
    page.drawText("Technická služba - Mstětice · 4773", {
      x: M,
      y: H - 40,
      size: 9,
      font: regular,
      color: rgb(1, 1, 1),
    });
    const titleLines = wrapPdfText(
      appendix ? `PŘÍLOHA A · ${s.title.toUpperCase()}` : s.title.toUpperCase(),
      bold,
      10,
      WIDTH,
    );
    titleLines.slice(0, 2).forEach((line, index) =>
      page.drawText(line, {
        x: M,
        y: H - 57 - index * 11,
        size: 10,
        font: bold,
        color: rgb(1, 1, 1),
      }),
    );
    page.drawText(number, {
      x: M,
      y: H - 83,
      size: 8,
      font: regular,
      color: rgb(1, 1, 1),
    });
    y = H - 111;
    if (appendix && (input.draft || input.cancelled)) {
      page.drawText(input.cancelled ? "STORNOVÁNO" : "NÁVRH – NEVYSTAVENO", {
        x: M,
        y,
        size: 10,
        font: bold,
        color: red,
      });
      y -= 18;
    }
  };
  const drawBlock = (block: { label: string; value: string }) => {
    page.drawRectangle({
      x: M,
      y: y - 3,
      width: WIDTH,
      height: 13,
      color: light,
    });
    page.drawText(block.label, {
      x: M + 4,
      y,
      size: 7.7,
      font: bold,
      color: navy,
    });
    y -= 13;
    for (const line of wrapPdfText(block.value, regular, 8, WIDTH - 12)) {
      if (input.appendix && y < 60) {
        headerFooter();
        page = pdf.addPage([W, H]);
        header(true);
      }
      page.drawText(line, { x: M + 4, y, size: 8, font: regular, color: navy });
      y -= 10;
    }
    y -= 5;
  };
  const headerFooter = () => {
    page.drawLine({
      start: { x: M, y: 36 },
      end: { x: W - M, y: 36 },
      color: gray,
      thickness: 0.4,
    });
    page.drawText("HZS ČEPRO · Technická služba Mstětice", {
      x: M,
      y: 22,
      size: 7,
      font: regular,
      color: gray,
    });
  };
  header(Boolean(input.appendix));
  if (input.appendix) {
    for (const block of annex) {
      if (y - Math.min(measure(block), 65) < 60) {
        headerFooter();
        page = pdf.addPage([W, H]);
        header(true);
      }
      drawBlock(block);
    }
    for (const photo of input.photographs ?? []) {
      if (y < H - 120) {
        headerFooter();
        page = pdf.addPage([W, H]);
        header(true);
      }
      const embedded =
        photo.mimeType === "image/jpeg"
          ? await pdf.embedJpg(photo.bytes)
          : await pdf.embedPng(photo.bytes);
      const scaled = embedded.scaleToFit(WIDTH, 590);
      const caption = wrapPdfText(photo.fileName, regular, 8, WIDTH);
      caption.forEach((line) => {
        page.drawText(line, { x: M, y, size: 8, font: regular, color: navy });
        y -= 11;
      });
      page.drawImage(embedded, {
        x: M + (WIDTH - scaled.width) / 2,
        y: y - scaled.height - 8,
        width: scaled.width,
        height: scaled.height,
      });
      y -= scaled.height + 20;
    }
  } else {
    const dateText = `Datum protokolu: ${formatProtocolDate(s.protocolDate)}     Datum události: ${formatProtocolDate(s.eventOccurredAt)}`;
    page.drawText(dateText, { x: M, y, size: 8, font: regular, color: navy });
    y -= 18;
    if (input.draft || input.cancelled) {
      page.drawText(input.cancelled ? "STORNOVÁNO" : "NÁVRH – NEVYSTAVENO", {
        x: M,
        y,
        size: 11,
        font: bold,
        color: red,
      });
      y -= 19;
    }
    for (const block of main) drawBlock(block);
    const conclusion =
      s.type === "HANDOVER"
        ? "Dokument k podpisu. Předávající a přebírající potvrzují skutečné předání a převzetí podpisem nebo navazujícím elektronickým potvrzením. Skutečný průběh je evidován samostatně."
        : s.type === "OUT_OF_SERVICE"
          ? "MIMO PROVOZ – NEPOUŽÍVAT. Dokument zaznamenává důvod nezpůsobilosti. Návrat do provozu vyžaduje odstranění příčiny a splnění všech požadovaných kontrol a zkoušek."
          : "Na základě zjištěného technického stavu Technická služba navrhuje výše uvedenou opravu za účelem obnovení bezpečné provozuschopnosti. Schválení se eviduje samostatně pro konkrétní verzi návrhu.";
    const conclusionLines = wrapPdfText(conclusion, regular, 7.8, WIDTH);
    if (y - conclusionLines.length * 10 < BOTTOM)
      throw new Error(
        "Povinný obsah přesahuje bezpečnou oblast jedné A4. Zkraťte úvodní údaje nebo přesuňte doplnění do přílohy.",
      );
    y -= 4;
    conclusionLines.forEach((line) => {
      page.drawText(line, {
        x: M,
        y,
        size: 7.8,
        font: regular,
        color: s.type === "OUT_OF_SERVICE" ? red : navy,
      });
      y -= 10;
    });
    page.drawLine({
      start: { x: M, y: 156 },
      end: { x: W - M, y: 156 },
      thickness: 0.4,
      color: gray,
    });
    page.drawText(`Zpracoval: ${s.author}`, {
      x: M,
      y: 141,
      font: bold,
      size: 8,
      color: navy,
    });
    page.drawText(`Datum: ${formatProtocolDate(s.protocolDate)}`, {
      x: M,
      y: 126,
      font: regular,
      size: 8,
      color: navy,
    });
    page.drawText(
      s.type === "HANDOVER"
        ? "Podpis předávajícího: __________________"
        : "Podpis zpracovatele: __________________",
      { x: M, y: 96, size: 8, font: regular, color: navy },
    );
    page.drawText(
      s.type === "HANDOVER"
        ? "Podpis přebírajícího: __________________"
        : "Schválil / neschválil / vráceno: ___________",
      { x: M, y: 72, size: 8, font: regular, color: navy },
    );
    page.drawText("Grafické označení TS nenahrazuje podpis ani schválení.", {
      x: M,
      y: 49,
      size: 6.5,
      font: regular,
      color: gray,
    });
    if (s.stampEnabled !== false) stamp(page, bold);
  }
  headerFooter();
  const pages = pdf.getPages();
  pages.forEach((current, index) => {
    const footer = `${number}${input.appendix ? " · Příloha A" : ""} · Strana ${index + 1} / ${pages.length}`;
    current.drawText(footer, {
      x: W - M - regular.widthOfTextAtSize(footer, 7),
      y: 22,
      font: regular,
      size: 7,
      color: gray,
    });
  });
  pdf.setTitle(`${s.title} ${number}${input.appendix ? " – Příloha A" : ""}`);
  return {
    bytes: await pdf.save(),
    hasAppendix:
      annex.length > 0 || photoCount > 0 || Boolean(s.attachments?.length),
    hasStamp: s.stampEnabled !== false,
  };
}

export async function mergePdfDocuments(documents: Uint8Array[]) {
  const merged = await PDFDocument.create();
  for (const bytes of documents) {
    const source = await PDFDocument.load(bytes);
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }
  return merged.save();
}
