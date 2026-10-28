/**
 * Trace the WORDMARK out of the real artwork.
 *
 * The animation has been setting "groomigo" in Quicksand, split white /
 * teal, with an invented tagline underneath — none of which is the
 * brand. The actual logo is one stacked lockup: the teal dog above a
 * white wordmark, and the app ships it as groomigo_logo.png.
 *
 * The word is WHITE on transparent, so a luminance threshold finds
 * nothing. Classify on alpha first, then split teal from white on the
 * red channel: teal is #12BDBB (r=18), the word is #FFFFFF.
 */
const fs = require("fs");
const sharp = require("sharp");
// potrace is not a project dependency: it is only needed to RE-trace
// the artwork, which should not happen again unless the logo changes.
//   corepack pnpm dlx potrace --version   (or pnpm add -D potrace)
const potrace = require("potrace");
const D = require("path").join(__dirname, "art");
const SRC = D + "/groomigo_logo_hd.png";

(async () => {
  const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;

  const box = () => ({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, n: 0 });
  const grow = (b, x, y) => { if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; b.n++; };
  const dog = box(), word = box();

  // One byte per pixel, 255 = ink, for the two masks potrace will read.
  const wordMask = Buffer.alloc(W * H, 255);   // white page, black ink
  const dogMask  = Buffer.alloc(W * H, 255);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * C;
      if (data[i + 3] < 128) continue;          // transparent
      const isWhite = data[i] > 170;            // r: 18 for teal, 255 for the word
      if (isWhite) { grow(word, x, y); wordMask[y * W + x] = 0; }
      else { grow(dog, x, y); dogMask[y * W + x] = 0; }
    }
  }

  const dim = (b) => `${b.x1 - b.x0 + 1}x${b.y1 - b.y0 + 1} at (${b.x0},${b.y0})  [${b.n} px]`;
  console.log("image:", W + "x" + H);
  console.log("dog  :", dim(dog));
  console.log("word :", dim(word));
  console.log("gap between dog bottom and word top:", word.y0 - dog.y1, "px");
  console.log("word width / dog width:", ((word.x1 - word.x0) / (dog.x1 - dog.x0)).toFixed(3));
  fs.writeFileSync(D + "/lockup.json", JSON.stringify({ W, H, dog, word }, null, 1));

  // Crop the word, with a little air, and hand it to potrace.
  const pad = 4;
  const wx = Math.max(0, word.x0 - pad), wy = Math.max(0, word.y0 - pad);
  const ww = Math.min(W - wx, word.x1 - word.x0 + 1 + pad * 2);
  const wh = Math.min(H - wy, word.y1 - word.y0 + 1 + pad * 2);
  const cropped = await sharp(wordMask, { raw: { width: W, height: H, channels: 1 } })
    .extract({ left: wx, top: wy, width: ww, height: wh })
    .png().toBuffer();
  fs.writeFileSync(D + "/word-bitmap.png", cropped);

  await new Promise((res, rej) =>
    potrace.trace(cropped, { threshold: 128, turdSize: 2, alphaMax: 1, optCurve: true, optTolerance: 0.2 },
      (err, svg) => err ? rej(err) : (fs.writeFileSync(D + "/word-traced.svg", svg), res())));
  const traced = fs.readFileSync(D + "/word-traced.svg", "utf8");
  const dcount = (traced.match(/ d="/g) || []).length;
  console.log("traced the word:", dcount, "path element(s),", (traced.length / 1024).toFixed(1), "KB");
})();
