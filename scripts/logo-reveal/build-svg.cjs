/**
 * The animated Groomigo logo, as ONE self-contained SVG.
 *
 * Why a single SVG rather than the HTML artboard this started as:
 *
 *  - It is the REAL lockup. The artwork is stacked — teal dog above a
 *    white wordmark — and both halves are now traced from
 *    groomigo_logo_hd.png. The HTML version set the word in Quicksand,
 *    split it white/teal and invented a "GROOMING SALON SOFTWARE"
 *    tagline, none of which is the brand.
 *  - It cannot pixelate. Everything is vector in one viewBox, so it is
 *    re-rasterised at whatever size it is shown — a favicon, a phone, a
 *    projector. The HTML artboard was fixed at 1000x620 and anything
 *    that scaled it resampled a raster, which is the likeliest reason
 *    "pixelated" kept coming back however the gradients were tuned.
 *  - It works anywhere an image works: <img>, a README, Keynote, a
 *    website hero. A self-contained SVG keeps its CSS and SMIL.
 *
 * The flash is a SMIL-animated gradient rather than a moving element.
 * Animating a gradient's coordinates re-renders at full resolution each
 * frame; animating an element's transform promotes it to a composited
 * layer that gets resampled. Gradient animation is also unaffected by
 * the <mask>-content caching that killed an earlier build.
 */
const fs = require("fs");
const path = require("path");
const ART = path.join(__dirname, "art");
const OUT = path.join(__dirname, "..", "..", "client", "public");

/* The TRACED dog, from this directory — NOT from the repo working
   tree. The repo copy is whatever branch happens to be checked out,
   and switching branches silently swapped it back to the old
   hand-drawn 100x100 version mid-build: the dog rendered as a speck in
   the corner because its coordinates were 0-100, not 696-1460. */
const dogSvg = fs.readFileSync(ART + "/groomigo_logo.clean.svg", "utf8");
const DOG_D = dogSvg.match(/ d="([^"]+)"/)[1];
const wordSvg = fs.readFileSync(ART + "/word-traced.svg", "utf8");
const WORD_D = wordSvg.match(/ d="([^"]+)"/)[1];
const centre = JSON.parse(fs.readFileSync(ART + "/centreline.json", "utf8"));
const lock = JSON.parse(fs.readFileSync(ART + "/lockup.json", "utf8"));

/* The word was traced from a crop whose top-left sat here in the
   artwork, so the traced path needs putting back where it came from. */
const WORD_Y = Math.max(0, lock.word.y0 - 4);
const WORD_X = Math.max(0, lock.word.x0 - 4);

/* The reveal mask's stroke weight, in viewBox units.

   The centreline is an APPROXIMATION of the artwork's spine: it has
   spurious branches and it stops short of the ends. A pen stroked
   along it is therefore a DIFFERENT SHAPE from the traced fill — at
   24 it covers only 80% of the mark and 38% of it falls outside.
   Drawing that pen and then cross-fading to the fill put two
   differently-shaped teal shapes on screen together for about a
   second, which is exactly the double line that kept being reported.

   At 72 the stroke covers the artwork completely, so it is used as a
   MASK instead: what appears is the real mark, uncovered along the
   path the pen travels. One shape on screen, always. */
const MASK_WIDTH = 72;

/* Assert the dog actually lands where the artwork puts it. Cheap, and
   it is exactly the check that was missing above. */
{
  const n = DOG_D.match(/-?\d+(?:\.\d+)?/g).map(Number);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < n.length; i += 2) {
    if (n[i] < x0) x0 = n[i]; if (n[i] > x1) x1 = n[i];
    if (n[i + 1] < y0) y0 = n[i + 1]; if (n[i + 1] > y1) y1 = n[i + 1];
  }
  const near = (a, b) => Math.abs(a - b) <= 12;
  if (!(near(x0, lock.dog.x0) && near(x1, lock.dog.x1) && near(y0, lock.dog.y0) && near(y1, lock.dog.y1))) {
    throw new Error(`dog path is not in artwork coordinates: got ${x0},${y0}..${x1},${y1}, `
      + `artwork has ${lock.dog.x0},${lock.dog.y0}..${lock.dog.x1},${lock.dog.y1}`);
  }
  console.log("dog bounds ok:", Math.round(x0) + "," + Math.round(y0), "->", Math.round(x1) + "," + Math.round(y1));
}

const PAD = 190;
const VB = `${-PAD} ${-PAD} ${lock.W + PAD * 2} ${lock.H + PAD * 2}`;

/** Order the strokes roughly top to bottom, in six bands, so the reveal
 *  is a handful of staggered steps rather than 52 separate animations. */
function bandsOf(paths) {
  const withY = paths.map((d) => {
    const n = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
    let minY = Infinity, minX = Infinity;
    for (let i = 0; i + 1 < n.length; i += 2) { if (n[i + 1] < minY) minY = n[i + 1]; if (n[i] < minX) minX = n[i]; }
    return { d, minY, minX };
  });
  withY.sort((a, b) => (a.minY - b.minY) || (a.minX - b.minX));
  const bands = [[], [], [], [], [], []];
  withY.forEach((p, i) => bands[Math.floor(i / Math.ceil(withY.length / 6))].push(p.d));
  return bands;
}
const BANDS = bandsOf(centre.paths);

const BAND_KEYS = [[3, 14], [8, 19], [13, 24], [18, 28], [22, 32], [26, 36]];

/* The sweep: a band of teal light 900 units wide, parked off the left
   until the word has arrived, then carried across it and parked off the
   right. Only the gradient's coordinates move. */
const SWEEP_W = 900;
const sweepFrom = -SWEEP_W - 150;
const sweepTo = lock.W + 150;
const anim = (attr, a, b) =>
  `<animate attributeName="${attr}" dur="7s" repeatCount="indefinite" calcMode="linear"
        keyTimes="0;0.52;0.70;1" values="${a};${a};${b};${b}"/>`;

/* Paint declared as an inline style, not just a presentation attribute.
   A presentation attribute is the LOWEST priority paint there is — any
   stylesheet rule beats it. Dropped into a stroke-based icon system
   (Lucide, Feather, Heroicons outline — this app uses Lucide), a rule
   like `svg path { fill: none; stroke: currentColor }` overrides
   fill="#12BDBB" and the mark renders as a hollow outline: every line
   of the dog becomes two thin lines with a gap. That is the "double
   lines", and it is invisible from inside the file. An inline style
   wins against everything but !important. */
const paint = (fill) => `fill="${fill}" stroke="none" style="fill:${fill};stroke:none"`;

function build({ ground, dogColour, wordColour, id, themed, markOnly, responsive }) {
  const dogPaint = themed ? `var(--gg-dog, ${dogColour})` : dogColour;
  const wordPaint = themed ? `var(--gg-word, ${wordColour})` : wordColour;
  /* Every mask path carries its own paint inline, for the same reason
     the mark does: a stylesheet rule on `svg path` beats anything
     inherited from the group, so an icon system's `stroke-width: 9`
     shrinks the reveal mask from 72 to 9 and uncovers a sliver of the
     artwork instead of all of it.
     NOT stroke-dashoffset, though — that is inherited from the band
     group, where the animation lives, and a declaration on the path
     would beat the animated value and freeze the draw. */
  const penPaint = `fill:none;stroke:#fff;stroke-width:${MASK_WIDTH};stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1`;
  const bands = BANDS.map((paths, i) =>
    `<g class="b${i + 1}">${paths.map((d) => `<path pathLength="1" style="${penPaint}" d="${d}"/>`).join("")}</g>`
  ).join("\n      ");

  const dogPad = 70;
  const vb = markOnly
    ? `${lock.dog.x0 - dogPad} ${lock.dog.y0 - dogPad} ${lock.dog.x1 - lock.dog.x0 + dogPad * 2} ${lock.dog.y1 - lock.dog.y0 + dogPad * 2}`
    : VB;
  const [, , vw, vh] = vb.split(" ").map(Number);
  const size = responsive
    ? `width="100%" height="100%" preserveAspectRatio="xMidYMid meet" style="display:block"`
    : `width="${vw}" height="${vh}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" ${size} role="img" aria-label="Groomigo">
  <title>Groomigo</title>
  <style>
    .pen path { stroke-dasharray: 1; }
    .pen g { stroke-dashoffset: 1; animation-duration: 7s; animation-iteration-count: infinite; animation-timing-function: ease-in-out; }
${BAND_KEYS.map((k, i) => `    .pen .b${i + 1} { animation-name: band${i + 1}; }`).join("\n")}
${BAND_KEYS.map(([a, b], i) => `    @keyframes band${i + 1} { 0%, ${a}% { stroke-dashoffset: 1; } ${b}%, 100% { stroke-dashoffset: 0; } }`).join("\n")}

    /* The mark is on from the first frame; the MASK is what makes it
       appear. At 0% the mask is empty, so nothing shows. This opacity
       only clears the lockup at the end of the loop. */
    .mark { animation: markOut 7s ease-in-out infinite; }
    @keyframes markOut { 0%, 91% { opacity: 1; } 99%, 100% { opacity: 0; } }

    /* The word fades up. No slide, no scale. */
    .word { opacity: 0; animation: fadeWord 7s ease-in-out infinite; }
    @keyframes fadeWord { 0%, 40% { opacity: 0; } 54%, 91% { opacity: 1; } 99%, 100% { opacity: 0; } }

    .flash { opacity: 0; animation: flashOn 7s linear infinite; }
    @keyframes flashOn { 0%, 51% { opacity: 0; } 54%, 70% { opacity: 1; } 73%, 100% { opacity: 0; } }

    @media (prefers-reduced-motion: reduce) {
      .flash { animation: none; opacity: 0; }
      .pen g { animation: none; stroke-dashoffset: 0; }
      .mark, .word { animation: none; opacity: 1; }
    }
  </style>
  <defs>
    <linearGradient id="sweep-${id}" gradientUnits="userSpaceOnUse" y1="0" y2="0"
                    x1="${sweepFrom}" x2="${sweepFrom + SWEEP_W}">
      ${anim("x1", sweepFrom, sweepTo)}
      ${anim("x2", sweepFrom + SWEEP_W, sweepTo + SWEEP_W)}
      <stop offset="0"    stop-color="#12BDBB" stop-opacity="0"/>
      <stop offset="0.3"  stop-color="#12BDBB" stop-opacity="0.28"/>
      <stop offset="0.44" stop-color="#3CD8D6" stop-opacity="0.72"/>
      <stop offset="0.5"  stop-color="#9DF6F4" stop-opacity="0.95"/>
      <stop offset="0.56" stop-color="#3CD8D6" stop-opacity="0.72"/>
      <stop offset="0.7"  stop-color="#12BDBB" stop-opacity="0.28"/>
      <stop offset="1"    stop-color="#12BDBB" stop-opacity="0"/>
    </linearGradient>
    <mask id="reveal-${id}" maskUnits="userSpaceOnUse" x="-400" y="-400" width="${lock.W + 800}" height="${lock.H + 800}">
      <g class="pen" style="fill:none;stroke:#fff;stroke-width:${MASK_WIDTH};stroke-linecap:round;stroke-linejoin:round">${bands}</g>
    </mask>
    <clipPath id="lockclip-${id}" clipPathUnits="userSpaceOnUse">
      <path d="${DOG_D}"/>
      <path transform="translate(${WORD_X} ${WORD_Y})" d="${WORD_D}"/>
    </clipPath>
  </defs>
${ground ? `  <rect x="-99999" y="-99999" width="199999" height="199999" fill="${ground}"/>` : ""}

  <path class="mark" ${paint(dogPaint)} fill-rule="evenodd" mask="url(#reveal-${id})" d="${DOG_D}"/>

${markOnly ? "" : `  <g class="word">
    <path transform="translate(${WORD_X} ${WORD_Y})" ${paint(wordPaint)} fill-rule="evenodd" d="${WORD_D}"/>
  </g>`}

  <!-- One light crossing the finished lockup. Clipped to the dog AND
       the word, so it reads as a single flash passing over the logo
       rather than an effect stuck on the wordmark. On the teal dog it
       is barely there; on the white word it tints teal, which is where
       the eye catches it. -->
  <rect class="flash" x="-99999" y="-99999" width="199999" height="199999"
        fill="url(#sweep-${id})" clip-path="url(#lockclip-${id})"/>
</svg>
`;
}

const dark = build({ ground: "#1E1229", dogColour: "#12BDBB", wordColour: "#FFFFFF", id: "d" });
const light = build({ ground: "#FFFFFF", dogColour: "#0E9C9A", wordColour: "#1E1229", id: "l" });
const clear = build({ ground: null, dogColour: "#12BDBB", wordColour: "#FFFFFF", id: "t" });
const themed = build({ ground: null, dogColour: "#12BDBB", wordColour: "#FFFFFF", id: "v", themed: true });
fs.writeFileSync(OUT + "/groomigo-animated-themed.svg", themed);

fs.writeFileSync(OUT + "/groomigo-animated-dark.svg", dark);
fs.writeFileSync(OUT + "/groomigo-animated-light.svg", light);
fs.writeFileSync(OUT + "/groomigo-animated-transparent.svg", clear);
console.log("viewBox", VB, "| word at", WORD_X + "," + WORD_Y, "| mask", MASK_WIDTH);
console.log("dark svg:", (dark.length / 1024).toFixed(1), "KB");

module.exports = { build, lock, PAD, VB };
