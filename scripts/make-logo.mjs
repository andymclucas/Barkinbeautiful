// Draws the standard Groomigo logo: the dog above the word "groomigo".
//
// Andy settled it on 17/11/2026, option by option:
//   - the dog in teal, with lines thinner than the original artwork (the
//     same weight as the app icon, scripts/make-app-icon.mjs);
//   - "Groomigo wording needs to be underneath the dog icon in all
//     instances", 'groom' in white and 'igo' in teal;
//   - the word WIDER than the dog (he was offered it matched to the dog's
//     width, tail to nose, and chose the wider one);
//   - on a light screen white lettering disappears, so there is a second
//     version with 'groom' in dark ink and a deeper teal ("Yes, dark ink").
//
// The lettering is the brand's own, taken from the wordmark path in
// client/public/groomigo-animated-dark.svg, not a font.
//
//   node scripts/make-logo.mjs "$PWD"
//
// File names carry a version for the reason make-app-icon.mjs gives: static
// files are served immutable for a year. Change the drawing, bump VERSION,
// and update client/src/components/GroomigoLogo.tsx.
import sharp from "sharp";
import fs from "node:fs";

const repo = process.argv[2];
if (!repo) throw new Error('usage: node scripts/make-logo.mjs "$PWD"');
const VERSION = "v1";
// Defaults draw the app's two files. The marketing site wants one large
// drawing in its own folder:
//   LOGO_WIDTH=1400 LOGO_OUT=website LOGO_TONES=on-dark node scripts/make-logo.mjs "$PWD"
const OUT_WIDTH = Number(process.env.LOGO_WIDTH) || 560;
const OUT_DIR = process.env.LOGO_OUT || "client/public";
const ONLY = process.env.LOGO_TONES ? process.env.LOGO_TONES.split(",") : null;
/** The word is this many times the dog's width, tail to nose. */
const WORD_SCALE = 1.45;
const THIN_PX = 14;

const TONES = {
  // for dark backgrounds: slides, the staff "My day" header, dark mode
  "on-dark": { dog: "#1FE3DF", groom: "#FFFFFF", igo: "#1FE3DF", glow: 0.55 },
  // for light backgrounds: the sign-in screen and the sidebar in light mode
  "on-light": { dog: "#0FA9A7", groom: "#1E1229", igo: "#0FA9A7", glow: 0 },
};
const rgb = (hex) => ({ r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) });

const anim = fs.readFileSync(`${repo}/client/public/groomigo-animated-dark.svg`, "utf8");
const word = /<g class="word">\s*<path transform="translate\(0 767\)"[^>]*? d="([^"]+)"/.exec(anim)?.[1];
if (!word) throw new Error("could not find the wordmark path in groomigo-animated-dark.svg");
const subpaths = word.match(/M[^M]*/g);
const leftEdge = (sp) => Math.min(...sp.match(/-?\d+(?:\.\d+)?/g).map(Number).filter((_, i) => i % 2 === 0));
// "groom" ends at x = 1385 and the dot of the "i" starts at 1434.
const groom = subpaths.filter((sp) => leftEdge(sp) < 1400).join(" ");
const igo = subpaths.filter((sp) => leftEdge(sp) >= 1400).join(" ");
const WORD_BOX = { x: -1, y: 3, w: 2066, h: 451 };

const logo = fs.readFileSync(`${repo}/client/public/groomigo_logo.svg`, "utf8");
const base = await sharp(Buffer.from(logo), { density: 600 }).resize({ width: 2400 }).trim().png().toBuffer();
const baseMeta = await sharp(base).metadata();
// A clear margin round the dog before thinning: with the outline touching
// the picture's edge the thinning leaves small ticks at the top of the head
// and along the base line. `dilate` is what narrows the lines here (see
// make-app-icon.mjs).
const M = 60;
const padded = await sharp(base).ensureAlpha().extend({ top: M, bottom: M, left: M, right: M, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
const thinned = await sharp(padded).extractChannel(3).dilate(THIN_PX).png().toBuffer();
const { data: mask, info } = await sharp(thinned).extract({ left: M, top: M, width: baseMeta.width, height: baseMeta.height })
  .toColourspace("b-w").raw().toBuffer({ resolveWithObject: true });
if (info.channels !== 1) throw new Error(`mask has ${info.channels} channels, expected 1`);
const dw = info.width, dh = info.height;
const clear = { r: 0, g: 0, b: 0, alpha: 0 };

for (const [tone, c] of Object.entries(TONES)) {
  if (ONLY && !ONLY.includes(tone)) continue;
  const dog = await sharp({ create: { width: dw, height: dh, channels: 3, background: rgb(c.dog) } })
    .joinChannel(mask, { raw: { width: dw, height: dh, channels: 1 } }).png().toBuffer();
  const tw = Math.round(dw * WORD_SCALE), th = Math.round(tw * WORD_BOX.h / WORD_BOX.w);
  const text = await sharp(Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${WORD_BOX.x} ${WORD_BOX.y} ${WORD_BOX.w} ${WORD_BOX.h}" width="${tw}" height="${th}">` +
    `<path fill="${c.groom}" fill-rule="evenodd" d="${groom}"/><path fill="${c.igo}" fill-rule="evenodd" d="${igo}"/></svg>`)).png().toBuffer();
  const gap = Math.round(dw * 0.11), pad = Math.round(dw * 0.04);
  const W = Math.max(dw, tw) + pad * 2, H = dh + gap + th + pad * 2;
  const dogLeft = Math.round((W - dw) / 2), textLeft = Math.round((W - tw) / 2);
  const layers = [];
  if (c.glow > 0) {
    const dogOnly = await sharp({ create: { width: W, height: H, channels: 4, background: clear } }).composite([{ input: dog, left: dogLeft, top: pad }]).png().toBuffer();
    layers.push({ input: await sharp(dogOnly).blur(dw * 0.012).ensureAlpha(c.glow).png().toBuffer() });
  }
  layers.push({ input: dog, left: dogLeft, top: pad }, { input: text, left: textLeft, top: pad + dh + gap });
  const full = await sharp({ create: { width: W, height: H, channels: 4, background: clear } }).composite(layers).png().toBuffer();
  const file = `${OUT_DIR}/groomigo-logo-${tone}-${VERSION}.png`;
  await sharp(full).resize({ width: OUT_WIDTH }).png({ compressionLevel: 9, palette: false }).toFile(`${repo}/${file}`);
  const m = await sharp(`${repo}/${file}`).metadata();
  console.log(file, `${m.width}x${m.height}`, `${Math.round(fs.statSync(`${repo}/${file}`).size / 1024)} KB`);
}
