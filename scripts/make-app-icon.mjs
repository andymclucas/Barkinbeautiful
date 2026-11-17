// Makes the staff app's home-screen icons: icon-512.png and icon-192.png.
//
// Andy, 17/11/2026: black background with the neon teal dog instead of
// white, the dog centred and slightly larger. Drawn from groomigo_logo.svg,
// the traced artwork, so the icon and the favicon are the same dog.
//
//   node scripts/make-app-icon.mjs "$PWD"
//
// The dog's longest side is 55% of the icon, which keeps all of it inside
// the circle Android crops a "maskable" icon to.
import sharp from "sharp";
import fs from "node:fs";
const repo = process.argv[2];
const NEON = "#1FE3DF";
const svg = fs.readFileSync(`${repo}/client/public/groomigo_logo.svg`, "utf8").replaceAll("#12BDBB", NEON);
// The dog alone, trimmed to its own outline so it can be centred by what is drawn, not by the artboard.
const dog = await sharp(Buffer.from(svg), { density: 600 }).resize({ width: 2000 }).trim().png().toBuffer();
async function make(size, out) {
  const box = Math.round(size * 0.55);           // dog's longest side, as a share of the icon
  const fitted = await sharp(dog).resize({ width: box, height: box, fit: "inside" }).png().toBuffer();
  const m = await sharp(fitted).metadata();
  const left = Math.round((size - m.width) / 2), top = Math.round((size - m.height) / 2);
  const glow = await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: fitted, left, top }]).png().toBuffer();
  const blurred = await sharp(glow).blur(size * 0.022).modulate({ brightness: 1.1 }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#000000" } })
    .composite([{ input: blurred, blend: "screen" }, { input: fitted, left, top }])
    .png({ compressionLevel: 9 }).toFile(out);
  console.log(out, size, "dog", m.width, "x", m.height, "at", left, top);
}
await make(512, `${repo}/client/public/icon-512.png`);
await make(192, `${repo}/client/public/icon-192.png`);
