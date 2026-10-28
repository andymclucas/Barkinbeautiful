/**
 * Shared geometry and path maths for the brand-reveal render.
 *
 * The artwork lives in its own coordinate space (2064 x 1219, dog above
 * word) and every layer is drawn in that space, then placed on the
 * 1920x1080 canvas by one transform. Keeping the artwork untouched
 * means the video, the SVG and the favicon are all literally the same
 * paths.
 */
const fs = require("fs");
const LOGO = require("path").join(__dirname, "art");

const DOG_D = fs.readFileSync(LOGO + "/groomigo_logo.clean.svg", "utf8").match(/ d="([^"]+)"/)[1];
const WORD_D = fs.readFileSync(LOGO + "/word-traced.svg", "utf8").match(/ d="([^"]+)"/)[1];
const centre = JSON.parse(fs.readFileSync(LOGO + "/centreline.json", "utf8"));
const lock = JSON.parse(fs.readFileSync(LOGO + "/lockup.json", "utf8"));
const WORD_X = Math.max(0, lock.word.x0 - 4);
const WORD_Y = Math.max(0, lock.word.y0 - 4);
const PEN_WIDTH = 24;

// ── path flattening, so a stroke can be drawn to a length and a spark
//    placed exactly at the pen's tip ──────────────────────────────────
/** Flatten "M x y C ... C ..." into a polyline with cumulative lengths. */
function flatten(d, perCurve = 18) {
  const nums = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const pts = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push([nums[i], nums[i + 1]]);
  const out = [pts[0]];
  for (let i = 1; i + 2 < pts.length; i += 3) {
    const [p0, p1, p2, p3] = [out[out.length - 1], pts[i], pts[i + 1], pts[i + 2]];
    for (let k = 1; k <= perCurve; k++) {
      const t = k / perCurve, u = 1 - t;
      out.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
  }
  const cum = [0];
  for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
  return { pts: out, cum, length: cum[cum.length - 1] };
}

/** The point a given fraction of the way along a flattened path. */
function pointAt(flat, frac) {
  const target = flat.length * Math.max(0, Math.min(1, frac));
  let lo = 0, hi = flat.cum.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (flat.cum[mid] < target) lo = mid + 1; else hi = mid; }
  const i = Math.max(1, lo);
  const span = flat.cum[i] - flat.cum[i - 1] || 1;
  const t = (target - flat.cum[i - 1]) / span;
  return [flat.pts[i - 1][0] + (flat.pts[i][0] - flat.pts[i - 1][0]) * t,
          flat.pts[i - 1][1] + (flat.pts[i][1] - flat.pts[i - 1][1]) * t];
}

/** Six bands, ordered roughly the way a hand would draw them. */
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
const BANDS = bandsOf(centre.paths).map((paths) => paths.map((d) => ({ d, flat: flatten(d) })));

module.exports = { DOG_D, WORD_D, BANDS, lock, WORD_X, WORD_Y, PEN_WIDTH, pointAt };
