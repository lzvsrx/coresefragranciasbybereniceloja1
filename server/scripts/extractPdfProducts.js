import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFParse } from "pdf-parse";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const pdfPath = process.argv[2] || path.join(root, "server/data/produtos.pdf");
const outPath = process.argv[3] || path.join(root, "server/data/produtos-pdf-text.txt");

if (!fs.existsSync(pdfPath)) {
  console.error(`PDF nao encontrado: ${pdfPath}`);
  process.exit(1);
}

const parser = new PDFParse({ data: fs.readFileSync(pdfPath) });
const result = await parser.getText();
await parser.destroy();

fs.writeFileSync(outPath, result.text, "utf8");
console.log(`Paginas: ${result.total}`);
console.log(`Texto extraido: ${outPath}`);
