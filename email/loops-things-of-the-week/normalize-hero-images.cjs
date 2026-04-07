/**
 * Re-encode iPhone / wide-gamut heroes for Loops: bake EXIF orientation, strip metadata,
 * sRGB JPEG. Uses readFile → sharp → toBuffer → writeFile (avoids corrupting same-path I/O).
 *
 * From repo root: npm run email:normalize-hero-images
 */
const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");

const IMG_DIR = path.join(__dirname, "img");
const MAX_EDGE = 1040;

const HERO_FILES = [
  "hero-carrie.jpeg",
  "hero-fredwilson.jpg",
  "hero-emma.jpeg",
];

async function rewriteHero(filename) {
  const p = path.join(IMG_DIR, filename);
  const inputBuf = await fs.readFile(p);
  const outBuf = await sharp(inputBuf)
    .rotate()
    .resize(MAX_EDGE, MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 86 })
    .toBuffer();
  await fs.writeFile(p, outBuf);
}

async function rewriteAvatarJpeg(filename) {
  const p = path.join(IMG_DIR, filename);
  const inputBuf = await fs.readFile(p);
  const outBuf = await sharp(inputBuf)
    .rotate()
    .resize(96, 96, { fit: "cover" })
    .jpeg({ quality: 92 })
    .toBuffer();
  await fs.writeFile(p, outBuf);
}

async function main() {
  for (const f of HERO_FILES) {
    await rewriteHero(f);
    process.stdout.write(`OK ${f}\n`);
  }
  await rewriteAvatarJpeg("avatar-carrie.jpg");
  process.stdout.write("OK avatar-carrie.jpg\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
