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
 *   node render-frames.cjs                        # landscape, all frames
 *   node render-frames.cjs --format square       # 1080x1080
 *   node render-frames.cjs --format portrait     # 1080x1920
 *   node render-frames.cjs --at 3.6              # one frame, for looking at
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const G = require("./geometry.cjs");

const FPS = 30, DUR = 7.5;
const N = Math.round(FPS * DUR);

/**
 * The three cuts.
 *
 * `lockup` is the lockup's width as a fraction of the frame's, which is
 * the only honest way to scale across aspect ratios: the artwork is
 * 1.69:1 and wider than any of these frames, so width is always what
 * constrains it. `rise` lifts it off geometric centre, because a
 * stacked mark with a heavy wordmark at its foot reads as low when it
 * is centred by arithmetic.
 */
const FORMATS = {
  landscape: { W: 1920, H: 1080, lockup: 0.529, rise: 0.017 },
  square:    { W: 1080, H: 1080, lockup: 0.780, rise: 0.022 },
  /* Portrait keeps more air at the sides and sits only slightly above
     centre: a story has a profile row across the top and a reply bar
     across the bottom, so the usable band is the middle. */
  portrait:  { W: 1080, H: 1920, lockup: 0.780, rise: 0.028 },
};
const fmtArg = process.argv.indexOf("--format");
const FORMAT = fmtArg > -1 ? process.argv[fmtArg + 1] : "landscape";
if (!FORMATS[FORMAT]) { console.error(`unknown --format ${FORMAT}; try ${Object.keys(FORMATS).join(", ")}`); process.exit(2); }
const { W, H, lockup, rise } = FORMATS[FORMAT];
const OUT = path.join(__dirname, FORMAT === "landscape" ? "frames" : `frames-${FORMAT}`);

const TEAL = "#12BDBB", BRIGHT = "#9DF6F4", WORD_INK = "#FFFFFF";

const SCALE = (W * lockup) / 2064;
const OX = (W - 2064 * SCALE) / 2;
const OY = (H - 1219 * SCALE) / 2 - rise * H;
const place = (inner) => `<g transform="translate(${OX} ${OY}) scale(${SCALE})">${inner}</g>`;

/* Atmosphere is measured in pixels, so it has to be scaled or the
   square cut gets landscape-sized bloom on a smaller mark. Glow
   follows the MARK; motes follow the FRAME. */
const MARK_K = (W * lockup) / 1016;                    // 1016px = the landscape lockup
const FRAME_K = Math.sqrt((W * H) / (1920 * 1080));

// ── timing ──────────────────────────────────────────────────────────
const clamp = (v) => Math.max(0, Math.min(1, v));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const easeOut = (p) => 1 - Math.pow(1 - p, 3);

const T = {
  bandStart: 0.35, bandStep: 0.33, bandDur: 0.66,
  settle: [2.95, 3.80],      // the bloom pulse as the last of the ink lands
  wordIn: [3.45, 4.35],
  sweep: [4.45, 5.75],
};

/* The reveal mask's stroke weight, in artwork units.
   The centreline is an APPROXIMATION of the artwork's spine — it has
   spurious branches and it misses the ends — so a pen stroked along it
   is a different shape from the traced fill: at 24 it covers only 80%
   of the mark and 38% of it falls outside. Showing both at once was
   the double line. At 72 the stroke covers the artwork completely, so
   it can be used as a MASK instead: what gets drawn is the real mark,
   uncovered along the path the pen travels. One shape, always. */
const MASK_WIDTH = 72;

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
  for (let i = 0; i < Math.round(110 * FRAME_K * FRAME_K); i++) {
    const near = rnd() > 0.62;
    out.push({
      x: rnd() * (W + 200) - 100,
      y: rnd() * (H + 200) - 100,
      r: (near ? 3 + rnd() * 5 : 1 + rnd() * 2.2) * FRAME_K,
      rise: ((near ? 16 : 7) + rnd() * 12) * FRAME_K,
      sway: (10 + rnd() * 26) * FRAME_K,
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
const SVG_OPEN = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;

/** The traced dog, whole. Static — the reveal is done by the mask. */
const dogSvg = `${SVG_OPEN}${place(`<path fill="${TEAL}" fill-rule="evenodd" d="${G.DOG_D}"/>`)}</svg>`;

/** How far each stroke has been laid down at time t. */
function strokeProgress(t) {
  const out = [];
  G.BANDS.forEach((band, i) => {
    const a = T.bandStart + i * T.bandStep;
    band.forEach(({ d, flat }, j) => {
      /* Stagger the strokes WITHIN a band too. Starting all nine at
         once put a row of sparks across the frame that read as a zip
         rather than a hand drawing. */
      const lead = (j / band.length) * T.bandDur * 0.45;
      out.push({ d, flat, p: easeInOut(seg(t, a + lead, a + lead + T.bandDur * 0.7)) });
    });
  });
  return out;
}

/** White where the artwork has been uncovered. */
function maskSvg(t) {
  const strokes = strokeProgress(t).filter((s) => s.p > 0).map(({ d, flat, p }) => {
    const L = flat.length;
    return `<path d="${d}" stroke-dasharray="${L.toFixed(1)}" stroke-dashoffset="${(L * (1 - p)).toFixed(1)}"/>`;
  }).join("");
  return `${SVG_OPEN}${place(`<g fill="none" stroke="#fff" stroke-width="${MASK_WIDTH}" stroke-linecap="round" stroke-linejoin="round">${strokes}</g>`)}</svg>`;
}

function logoSvg(t) {
  const wordO = easeInOut(seg(t, ...T.wordIn));

  let sparks = "";
  {
    G.BANDS.forEach((band, i) => {
      const a = T.bandStart + i * T.bandStep;
      band.forEach(({ flat }, j) => {
        const lead = (j / band.length) * T.bandDur * 0.45;
        const p = easeInOut(seg(t, a + lead, a + lead + T.bandDur * 0.7));
        /* A spark rides the tip while a stroke is being laid down, and
           is gone the moment it finishes. Short strokes — the eye, the
           brow — get none; a spark bigger than the mark it is drawing
           looks like a blob, not a pen. */
        if (p > 0.02 && p < 0.985 && flat.length > 150) {
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
    <g>${sparks}</g>
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

async function renderFrame(i, groundBuf, dogBuf) {
  const t = i / FPS;
  const [farBuf, nearBuf, restBuf, maskBuf] = await Promise.all([
    sharp(Buffer.from(motesSvg(t, false))).png().toBuffer(),
    sharp(Buffer.from(motesSvg(t, true))).blur(Math.max(0.3, 7 * FRAME_K)).png().toBuffer(),
    sharp(Buffer.from(logoSvg(t))).png().toBuffer(),
    sharp(Buffer.from(maskSvg(t))).png().toBuffer(),
  ]);

  /* The real mark, uncovered as far as the pen has got. `dest-in`
     keeps the dog only where the mask has alpha, so there is never a
     second shape on screen to read as a double line. */
  const dogRevealed = await sharp(dogBuf)
    .composite([{ input: maskBuf, blend: "dest-in" }]).png().toBuffer();

  /* Bloom is taken from everything that is lit, mark and word alike. */
  const logoBuf = await sharp(dogRevealed)
    .composite([{ input: restBuf, blend: "over" }]).png().toBuffer();

  /* Bloom: strong while the ink is landing, then a slow breath. */
  const pulse = Math.sin(Math.PI * seg(t, ...T.settle));
  const gain = 0.30 + 0.34 * pulse + 0.05 * Math.sin(t * 1.1);
  const [wide, tight] = await Promise.all([
    glow(logoBuf, Math.max(0.3, 17 * MARK_K), gain),
    glow(logoBuf, Math.max(0.3, 5 * MARK_K), gain * 0.55),
  ]);

  const grain = await sharp({
    create: { width: W, height: H, channels: 3, background: "#808080",
              noise: { type: "gaussian", mean: 128, sigma: 7 } },
  }).png().toBuffer();

  return sharp(groundBuf).composite([
    { input: farBuf, blend: "screen" },
    { input: nearBuf, blend: "screen" },
    { input: wide, blend: "screen" },
    { input: dogRevealed, blend: "over" },
    { input: restBuf, blend: "over" },
    { input: tight, blend: "screen" },
    { input: grain, blend: "soft-light" },
  ]).png({ compressionLevel: 3 }).toBuffer();
}

(async () => {
  const groundBuf = await sharp(Buffer.from(groundSvg)).png().toBuffer();
  const dogBuf = await sharp(Buffer.from(dogSvg)).png().toBuffer();

  /* The mask must end up covering the artwork completely, or the logo
     holds with a bite out of it. Check, rather than trust the 72. */
  {
    const full = await sharp(dogBuf).composite([
      { input: await sharp(Buffer.from(maskSvg(DUR))).png().toBuffer(), blend: "dest-in" },
    ]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const bare = await sharp(dogBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let missing = 0, total = 0;
    for (let k = 3; k < bare.data.length; k += 4) {
      if (bare.data[k] > 128) { total++; if (full.data[k] < 128) missing++; }
    }
    const pct = (100 * missing) / total;
    console.log(`mask covers ${(100 - pct).toFixed(2)}% of the mark at width ${MASK_WIDTH}`);
    if (pct > 0.05) throw new Error(`reveal mask misses ${pct.toFixed(2)}% of the artwork — raise MASK_WIDTH`);
  }
  const at = process.argv.indexOf("--at");
  if (at > -1) {
    const t = Number(process.argv[at + 1]);
    const buf = await renderFrame(Math.round(t * FPS), groundBuf, dogBuf);
    fs.writeFileSync(path.join(__dirname, `probe-${FORMAT}-${t}.png`), buf);
    console.log(`wrote probe-${FORMAT}-${t}.png  (${W}x${H}, t=${t}s)`);
    return;
  }
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const started = Date.now();
  for (let i = 0; i < N; i++) {
    fs.writeFileSync(path.join(OUT, `f${String(i).padStart(4, "0")}.png`), await renderFrame(i, groundBuf, dogBuf));
    if (i % 25 === 0) process.stdout.write(`  ${i}/${N}  ${((Date.now() - started) / 1000).toFixed(0)}s\n`);
  }
  console.log(`rendered ${N} ${W}x${H} frames in ${((Date.now() - started) / 1000).toFixed(0)}s -> ${OUT}`);
})();
