import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const sourceRoot = process.env.LEGACY_ROOT || "C:\\cores-e-fragrancias-by-berenice-3.6";
const downloadsPdf = process.env.PRODUCTS_PDF || "C:\\Users\\valen\\Downloads\\produtos (1).pdf";

const copies = [
  [path.join(sourceRoot, "store.db"), path.join(root, "server/data/store.db")],
  [path.join(sourceRoot, "assets/logo1.jpeg"), path.join(root, "public/logo1.jpeg")],
  [path.join(sourceRoot, "assets/logo1.jpeg"), path.join(root, "public/favicon.jpeg")],
  [downloadsPdf, path.join(root, "server/data/produtos.pdf")]
];

for (const [from, to] of copies) {
  if (!fs.existsSync(from)) {
    console.warn(`Nao encontrado: ${from}`);
    continue;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log(`Copiado: ${from} -> ${to}`);
}
