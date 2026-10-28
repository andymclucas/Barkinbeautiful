/**
 * Pull a CENTRELINE out of the Groomigo artwork.
 *
 * The logo is a line drawing, but the only sources are raster. A trace
 * gives the OUTLINE of the ink, so stroking it draws a line down both
 * sides of every stroke — the doubled look. A centreline is the line
 * the pen actually travelled, which is what a draw-on animation needs,
 * and what the mark should have been stored as all along.
 *
 * Zhang-Suen thinning to a one-pixel skeleton, then the skeleton is
 * walked into polylines from its endpoints and junctions, simplified,
 * and emitted as smooth paths.
 */
const sharp = require("sharp");
const fs = require("fs");
const D = require("path").join(__dirname, "art");
const SRC = D + "/groomigo_logo_hd.png";

(async () => {
  const meta = await sharp(SRC).metadata();
  const dogH = Math.round(meta.height * 0.62);
  const W = 760; // working width; coordinates scale back at the end
  const scale = meta.width / W;

  const { data, info } = await sharp(SRC)
    .extract({ left: 0, top: 0, width: meta.width, height: dogH })
    .resize(W)
    .flatten({ background: "#ffffff" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width, h = info.height;
  // Ink is dark on white after greyscale.
  let grid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) grid[i] = data[i * info.channels] < 170 ? 1 : 0;

  const at = (g, x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : g[y * w + x];

  /** One Zhang-Suen sub-iteration. Returns how many pixels were removed. */
  function thinPass(g, step) {
    const kill = [];
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (!at(g, x, y)) continue;
        const p2 = at(g, x, y - 1), p3 = at(g, x + 1, y - 1), p4 = at(g, x + 1, y),
              p5 = at(g, x + 1, y + 1), p6 = at(g, x, y + 1), p7 = at(g, x - 1, y + 1),
              p8 = at(g, x - 1, y), p9 = at(g, x - 1, y - 1);
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;
        const seq = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
        let A = 0;
        for (let i = 0; i < 8; i++) if (seq[i] === 0 && seq[i + 1] === 1) A++;
        if (A !== 1) continue;
        if (step === 0) {
          if (p2 * p4 * p6) continue;
          if (p4 * p6 * p8) continue;
        } else {
          if (p2 * p4 * p8) continue;
          if (p2 * p6 * p8) continue;
        }
        kill.push(y * w + x);
      }
    }
    for (const i of kill) g[i] = 0;
    return kill.length;
  }

  let removed = 1, rounds = 0;
  while (removed > 0 && rounds < 200) {
    removed = thinPass(grid, 0) + thinPass(grid, 1);
    rounds++;
  }
  const skelCount = grid.reduce((n, v) => n + v, 0);
  console.log(`thinned in ${rounds} rounds — skeleton pixels: ${skelCount}`);

  // ── walk the skeleton into polylines ──────────────────────────────
  const neighbours = (x, y) => {
    const out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (at(grid, x + dx, y + dy)) out.push([x + dx, y + dy]);
    }
    return out;
  };
  const degree = (x, y) => neighbours(x, y).length;

  const visited = new Uint8Array(w * h);
  const polylines = [];

  function walkFrom(sx, sy) {
    let x = sx, y = sy;
    const pts = [[x, y]];
    visited[y * w + x] = 1;
    for (;;) {
      const next = neighbours(x, y).filter(([nx, ny]) => !visited[ny * w + nx]);
      if (next.length === 0) break;
      // Prefer a straight continuation so a junction does not snap the line.
      next.sort((a, b) => {
        const d = (p) => Math.abs(p[0] - x) + Math.abs(p[1] - y);
        return d(a) - d(b);
      });
      const [nx, ny] = next[0];
      visited[ny * w + nx] = 1;
      pts.push([nx, ny]);
      x = nx; y = ny;
      if (degree(x, y) > 2 && pts.length > 6) { /* keep going through junctions */ }
    }
    return pts;
  }

  // Start at endpoints (degree 1), then anything left (closed loops).
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (at(grid, x, y) && !visited[y * w + x] && degree(x, y) === 1) {
      const pts = walkFrom(x, y);
      if (pts.length > 8) polylines.push(pts);
    }
  }
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (at(grid, x, y) && !visited[y * w + x]) {
      const pts = walkFrom(x, y);
      if (pts.length > 12) polylines.push(pts);
    }
  }

  console.log("polylines:", polylines.length, "| lengths:", polylines.map(p => p.length).sort((a,b)=>b-a).slice(0, 12).join(", "));

  // ── simplify + smooth ─────────────────────────────────────────────
  function rdp(pts, eps) {
    if (pts.length < 3) return pts;
    let maxD = 0, idx = 0;
    const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = 1; i < pts.length - 1; i++) {
      const [px, py] = pts[i];
      const d = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD <= eps) return [pts[0], pts[pts.length - 1]];
    return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
  }

  /** Catmull-Rom through the points, emitted as cubic beziers. */
  function toPath(pts) {
    const p = pts.map(([x, y]) => [ +(x * scale).toFixed(1), +(y * scale).toFixed(1) ]);
    if (p.length < 2) return null;
    let d = `M${p[0][0]} ${p[0][1]}`;
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p[i + 1];
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0]} ${p2[1]}`;
    }
    return d;
  }

  const paths = polylines
    .map(pts => rdp(pts, 1.1))
    .map(toPath)
    .filter(Boolean);

  // Stroke weight = the ink's thickness, measured off the source.
  const strokePx = Math.round(5.32 / 100 * (dogH)) ;
  fs.writeFileSync(D + "/centreline.json", JSON.stringify({ paths, scale, strokePx }, null, 1));
  console.log("paths emitted:", paths.length, "| suggested stroke (source px):", strokePx);
})();
