/**
 * Converts docs/dices/01.png … 20.png into /public/d20/01.webp … 20.webp.
 * Run: npm run generate:d20
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "docs/dices");
const outDir = path.join(root, "public/d20");
const OUT_SIZE = 1024;

await mkdir(outDir, { recursive: true });

for (let n = 1; n <= 20; n++) {
  const stem = String(n).padStart(2, "0");
  const src = path.join(srcDir, `${stem}.png`);
  const file = path.join(outDir, `${stem}.webp`);
  await sharp(src)
    .resize(OUT_SIZE, OUT_SIZE, {
      fit: "contain",
      background: { r: 8, g: 12, b: 18, alpha: 1 },
    })
    .webp({ quality: 88 })
    .toFile(file);
  console.log(`wrote ${path.relative(root, file)}`);
}
