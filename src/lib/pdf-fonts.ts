import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
let cached: Promise<{ regularFont: Buffer; boldFont: Buffer }> | undefined;
export function pdfFonts() {
  return (cached ??= Promise.all([
    readFile(
      join(process.cwd(), "node_modules/dejavu-fonts-ttf/ttf/DejaVuSans.ttf"),
    ),
    readFile(
      join(
        process.cwd(),
        "node_modules/dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf",
      ),
    ),
  ]).then(([regularFont, boldFont]) => ({ regularFont, boldFont })));
}
