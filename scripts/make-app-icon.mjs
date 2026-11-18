// Makes the staff app's home-screen icons.
//
// Andy, 17/11/2026: black background with the neon teal dog instead of
// white, the dog centred and slightly larger. Later the same day: "the
// lines are too thick". He compared three weights on his own home screen
// and chose the one between B and C, which is what this draws.
//
// Drawn from groomigo_logo.svg, the traced artwork, so the icon and the
// favicon are the same dog.
//
//   node scripts/make-app-icon.mjs "$PWD"
//
// THE FILE NAMES CARRY A VERSION ON PURPOSE. The server sends every static
// file except four named ones with `immutable, max-age=31536000`
// (server/_core/vite.ts), so a browser that has fetched /icon-192.png keeps
// that copy for a year. A changed icon under the same name never reaches
// it. To change the icon again: bump ICON_VERSION here, run this, and
// update the three places that name the files (client/index.html,
// client/public/manifest.webmanifest and sw.js, shared/portalManifest.ts).
import sharp from "sharp";
import fs from "node:fs";

const repo = process.argv[2];
if (!repo) throw new Error('usage: node scripts/make-app-icon.mjs "$PWD"');

export const ICON_VERSION = "v3";
const NEON = { r: 0x1f, g: 0xe3, b: 0xdf };
/** The dog's longest side as a share of the icon; inside Android's maskable circle. */
const DOG_SHARE = 0.55;
/** How much is taken off each side of every line, in pixels of the 2400px drawing. */
const THIN_PX = 14;
/** Glow radius as a share of the icon. A wide glow reads as a thicker line. */
const GLOW = 0.011;

const svg = fs.readFileSync(`${repo}/client/public/groomigo_logo.svg`, "utf8");
// The dog alone, trimmed to its own outline so it is centred by what is drawn, not by the artboard.
const base = await sharp(Buffer.from(svg), { density: 600 }).resize({ width: 2400 }).trim().png().toBuffer();

// Thin the lines on the alpha mask, then paint the mask teal.
// sharp's `dilate` is what narrows the shape here: on this single-channel
// mask it grows the dark background into the light lines. `erode` thickens
// them. Checked by eye on 17/11/2026; check again if sharp is upgraded.
const { data, info } = await sharp(base).ensureAlpha().extractChannel(3).dilate(THIN_PX)
  .toColourspace("b-w").raw().toBuffer({ resolveWithObject: true });
if (info.channels !== 1) throw new Error(`mask has ${info.channels} channels, expected 1`);
const dog = await sharp({ create: { width: info.width, height: info.height, channels: 3, background: NEON } })
  .joinChannel(data, { raw: { width: info.width, height: info.height, channels: 1 } })
  .png().toBuffer();

async function make(size, out) {
  const box = Math.round(size * DOG_SHARE);
  const fitted = await sharp(dog).resize({ width: box, height: box, fit: "inside" }).png().toBuffer();
  const m = await sharp(fitted).metadata();
  const left = Math.round((size - m.width) / 2), top = Math.round((size - m.height) / 2);
  const layer = await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: fitted, left, top }]).png().toBuffer();
  const glow = await sharp(layer).blur(size * GLOW).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: "#000000" } })
    .composite([{ input: glow, blend: "screen" }, { input: fitted, left, top }])
    .png({ compressionLevel: 9 }).toFile(out);
  console.log(out.replace(repo + "/", ""), `${size}px, dog ${m.width}x${m.height} at ${left},${top}`);
}

const pub = `${repo}/client/public`;
await make(512, `${pub}/icon-512-${ICON_VERSION}.png`);
await make(192, `${pub}/icon-192-${ICON_VERSION}.png`);
await make(180, `${pub}/icon-180-${ICON_VERSION}.png`);
// The old names too, for anything still pointing at them (a service worker
// or manifest fetched before the rename).
await make(512, `${pub}/icon-512.png`);
await make(192, `${pub}/icon-192.png`);
