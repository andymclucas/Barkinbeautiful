/**
 * Render the Groomigo brand reveal to PNG frames.
 *
 * The reference Andy sent is a rendered video — a dark ground, embers
 * drifting, the mark assembling with light. SVG cannot do bloom or
 * depth-of-field, so the atmosphere is composited in sharp instead:
 * every layer is drawn as vector, rasterised, then blurred and screened
 * the way a compositor would. The artwork itself is untouched — the
 * same traced paths as the favicon and the animated SVG.
 *
 *   node render-frames.cjs            # all frames
 *   node render-frames.cjs --at 3.6   # one frame, for looking at
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const G = require("./geometry.cjs");

const W = 1920, H = 1080, FPS = 30, DUR = 7.5;
const N = Math.round(FPS * DUR);
const OUT = path.join(__dirname, "frames");

const TEAL = "#12BDBB", BRIGHT = "#9DF6F4", WORD_INK = "#FFFFFF";

/* The lockup sits a little above centre: the word is the base, and
   optical centre for a stacked mark is higher than geometric. */
const SCALE = 600 / 1219;
const OX = (W - 2064 * SCALE) / 2;
const OY = (H - 1219 * SCALE) / 2 - 18;
const place = (inner) => `<g transform="translate(${OX} ${OY}) scale(${SCALE})">${inner}</g>`;

// ── timing ──────────────────────────────────────────────────────────
const clamp = (v) => Math.max(0, Math.min(1, v));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOut = (p) => 1 - Math.pow(1 - p, 3);

const T = {
  bandStart: 0.35, bandStep: 0.33, bandDur: 0.66,
  markIn: [2.60, 3.45],
  penOut: [3.10, 3.65],
  settle: [3.30, 4.10],      // the bloom pulse as the ink lands
  wordIn: [3.65, 4.50],
  sweep: [4.45, 5.75],
};

// ── deterministic drifting motes ────────────────────────────────────
const mulberry = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const MOTES = (() => {
  const rnd = mulberry(20261028);
  const out = [];
  for (let i = 0; i < 110; i++) {
    const near = rnd() > 0.62;
    out.push({
      x: rnd() * (W + 200) - 100,
      y: rnd() * (H + 200) - 100,
      r: near ? 3 + rnd() * 5 : 1 + rnd() * 2.2,
      rise: (near ? 16 : 7) + rnd() * 12,
      sway: 10 + rnd() * 26,
      phase: rnd() * Math.PI * 2,
      alpha: (near ? 0.22 : 0.34) + rnd() * 0.24,
      near,
    });
  }
  return out;
})();

function motesSvg(t, nearLayer) {
  const dots = MOTES.filter((m) => m.near === nearLayer).map((m) => {
    const y = ((m.y - m.rise * t) % (H + 200) + (H + 200)) % (H + 200) - 100;
    const x = m.x + Math.sin(t * 0.5 + m.phase) * m.sway;
    /* They drift in over the first beat rather than being there from
       frame one, which would read as a still image that then moves. */
    const a = m.alpha * easeOut(seg(t, 0, 0.9)) * (0.75 + 0.25 * Math.sin(t * 1.3 + m.phase));
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${m.r.toFixed(2)}" fill="${BRIGHT}" fill-opacity="${a.toFixed(3)}"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#000"/>${dots}</svg>`;
}

// ── the mark itself, at time t ──────────────────────────────────────
function logoSvg(t) {
  const markO = easeInOut(seg(t, ...T.markIn));
  const penO = 1 - easeInOut(seg(t, ...T.penOut));
  const wordO = easeInOut(seg(t, ...T.wordIn));

  let pen = "", sparks = "";
  if (penO > 0.01) {
    G.BANDS.forEach((band, i) => {
      const a = T.bandStart + i * T.bandStep;
      band.forEach(({ d, flat }, j) => {
        /* Stagger the strokes WITHIN a band too. Starting all nine at
           once put a row of sparks across the frame that read as a
           zip rather than a hand drawing. */
        const lead = (j / band.length) * T.bandDur * 0.45;
        const p = easeInOut(seg(t, a + lead, a + lead + T.bandDur * 0.7));
        if (p <= 0) return;
        const L = flat.length;
        pen += `<path d="${d}" stroke-dasharray="${L.toFixed(1)}" stroke-dashoffset="${(L * (1 - p)).toFixed(1)}"/>`;
        /* A spark rides the tip while a stroke is being laid down, and
           is gone the moment it finishes. Short strokes — the eye, the
           brow — get none; a spark bigger than the mark it is drawing
           looks like a blob, not a pen. */
        if (p > 0.02 && p < 0.985 && L > 150) {
          const [x, y] = G.pointAt(flat, p);
          sparks += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="46" fill="${BRIGHT}" fill-opacity="0.13"/>`
                 +  `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="13" fill="#FFFFFF" fill-opacity="0.7"/>`;
        }
      });
    });
  }

  // The light that crosses the finished lockup.
  const sweepP = seg(t, ...T.sweep);
  const bandW = 900;
  const x1 = -bandW - 200 + sweepP * (2064 + bandW + 400);
  const flashOn = sweepP > 0 && sweepP < 1 ? Math.sin(Math.PI * Math.min(1, sweepP / 0.12)) >= 0 ? 1 : 1 : 0;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="sweep" gradientUnits="userSpaceOnUse" y1="0" y2="0" x1="${x1.toFixed(0)}" x2="${(x1 + bandW).toFixed(0)}">
      <stop offset="0" stop-color="${TEAL}" stop-opacity="0"/>
      <stop offset="0.3" stop-color="${TEAL}" stop-opacity="0.3"/>
      <stop offset="0.44" stop-color="#3CD8D6" stop-opacity="0.75"/>
      <stop offset="0.5" stop-color="${BRIGHT}" stop-opacity="0.97"/>
      <stop offset="0.56" stop-color="#3CD8D6" stop-opacity="0.75"/>
      <stop offset="0.7" stop-color="${TEAL}" stop-opacity="0.3"/>
      <stop offset="1" stop-color="${TEAL}" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="lock" clipPathUnits="userSpaceOnUse">
      <path d="${G.DOG_D}"/>
      <path transform="translate(${G.WORD_X} ${G.WORD_Y})" d="${G.WORD_D}"/>
    </clipPath>
  </defs>
  ${place(`
    <g opacity="${markO.toFixed(3)}"><path fill="${TEAL}" fill-rule="evenodd" d="${G.DOG_D}"/></g>
    <g opacity="${penO.toFixed(3)}" fill="none" stroke="${TEAL}" stroke-width="${G.PEN_WIDTH}" stroke-linecap="round" stroke-linejoin="round">${pen}</g>
    <g opacity="${penO.toFixed(3)}">${sparks}</g>
    <g opacity="${wordO.toFixed(3)}"><path transform="translate(${G.WORD_X} ${G.WORD_Y})" fill="${WORD_INK}" fill-rule="evenodd" d="${G.WORD_D}"/></g>
    ${flashOn ? `<rect x="-500" y="-500" width="3100" height="2300" fill="url(#sweep)" clip-path="url(#lock)"/>` : ""}
  `)}
</svg>`;
}

// ── static ground: plum, a soft lift behind the mark, a vignette ────
const groundSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <radialGradient id="lift" cx="0.5" cy="0.46" r="0.62">
      <stop offset="0" stop-color="#2A1B3C"/>
      <stop offset="0.55" stop-color="#1E1229"/>
      <stop offset="1" stop-color="#140D1C"/>
    </radialGradient>
    <radialGradient id="vig" cx="0.5" cy="0.5" r="0.78">
      <stop offset="0.55" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.55"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#lift)"/>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>
</svg>`;

/** Blur on a half-size copy: a wide gaussian at full resolution is the
 *  slowest thing here and the result is identical once it is this soft. */
async function glow(pngBuffer, sigma, gain) {
  return sharp(pngBuffer)
    .flatten({ background: "#000000" })
    .resize(W / 2, H / 2)
    .blur(sigma)
    .resize(W, H)
    .linear(gain, 0)
    .png().toBuffer();
}

async function renderFrame(i, groundBuf) {
  const t = i / FPS;
  const [farBuf, nearBuf, logoBuf] = await Promise.all([
    sharp(Buffer.from(motesSvg(t, false))).png().toBuffer(),
    sharp(Buffer.from(motesSvg(t, true))).blur(7).png().toBuffer(),
    sharp(Buffer.from(logoSvg(t))).png().toBuffer(),
  ]);

  /* Bloom: strong while the ink is landing, then a slow breath. */
  const pulse = Math.sin(Math.PI * seg(t, ...T.settle));
  const gain = 0.30 + 0.34 * pulse + 0.05 * Math.sin(t * 1.1);
  const [wide, tight] = await Promise.all([
    glow(logoBuf, 17, gain),
    glow(logoBuf, 5, gain * 0.55),
  ]);

  const grain = await sharp({
    create: { width: W, height: H, channels: 3, background: "#808080",
              noise: { type: "gaussian", mean: 128, sigma: 7 } },
  }).png().toBuffer();

  return sharp(groundBuf).composite([
    { input: farBuf, blend: "screen" },
    { input: nearBuf, blend: "screen" },
    { input: wide, blend: "screen" },
    { input: logoBuf, blend: "over" },
    { input: tight, blend: "screen" },
    { input: grain, blend: "soft-light" },
  ]).png({ compressionLevel: 3 }).toBuffer();
}

(async () => {
  const groundBuf = await sharp(Buffer.from(groundSvg)).png().toBuffer();
  const at = process.argv.indexOf("--at");
  if (at > -1) {
    const t = Number(process.argv[at + 1]);
    const buf = await renderFrame(Math.round(t * FPS), groundBuf);
    fs.writeFileSync(path.join(__dirname, `probe-${t}.png`), buf);
    console.log("wrote probe-" + t + ".png  (t=" + t + "s)");
    return;
  }
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const started = Date.now();
  for (let i = 0; i < N; i++) {
    fs.writeFileSync(path.join(OUT, `f${String(i).padStart(4, "0")}.png`), await renderFrame(i, groundBuf));
    if (i % 25 === 0) process.stdout.write(`  ${i}/${N}  ${((Date.now() - started) / 1000).toFixed(0)}s\n`);
  }
  console.log(`rendered ${N} frames in ${((Date.now() - started) / 1000).toFixed(0)}s -> ${OUT}`);
})();
