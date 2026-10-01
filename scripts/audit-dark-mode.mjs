// Dark-mode legibility audit.
//
// Walks every class string in client/src and flags the two ways text goes
// unreadable in dark mode:
//
//   (a) dark TEXT with no dark: variant, sitting in a string that also sets a
//       dark background -> dark-on-dark.
//   (b) light TEXT (or text-white) with no dark: variant in a string whose
//       light background has a dark: variant -> light-on-light.
//
// It reads STRING LITERALS, not lines, so a wrapped prettier class list is
// still analysed as one unit.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Run from the repo root:  node scripts/audit-dark-mode.mjs
//
// Not a vitest test on purpose - CLAUDE.md section 7 is explicit that
// asserting on source text is the wrong shape for a test. This is an
// operational check: it reports, it never fails a build.
const ROOT = process.cwd();
const SRC = join(ROOT, "client/src");

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|css)$/.test(p)) files.push(p);
  }
})(SRC);

// Tailwind palette families we use.
const FAM =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

// A single utility token, with any variant prefixes kept.
const TOKEN = /[a-z-]*:?[a-zA-Z0-9[\]().,#%/_-]+/g;

const DARK_LEVELS = new Set(["700", "800", "900", "950"]);
const LIGHT_LEVELS = new Set(["50", "100", "200", "300"]);

const findings = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");

  // Every quoted string / template chunk that smells like a class list.
  const strings = text.match(/(["'`])(?:(?!\1)[\s\S])*\1/g) ?? [];

  for (const raw of strings) {
    const body = raw.slice(1, -1);
    if (!/\b(text|bg)-/.test(body)) continue;

    const tokens = body.match(TOKEN) ?? [];

    const textTokens = [];
    const bgTokens = [];
    for (const t of tokens) {
      const m = t.match(
        new RegExp(`^((?:[a-z-]+:)*)(text|bg)-(white|black|(?:${FAM})-(\\d{2,3}))`),
      );
      if (!m) continue;
      const entry = {
        token: t,
        variants: m[1],
        isDark: m[1].includes("dark:"),
        kind: m[2],
        colour: m[3],
        level: m[4] ?? null,
        // only count the bare, always-on utility (no hover:/focus:/group-*)
        bare: m[1] === "" || m[1] === "dark:",
      };
      (entry.kind === "text" ? textTokens : bgTokens).push(entry);
    }

    const hasDarkText = textTokens.some((t) => t.isDark && t.bare);
    const hasDarkBg = bgTokens.some((t) => t.isDark && t.bare);

    for (const t of textTokens) {
      if (t.isDark || !t.bare || hasDarkText) continue;

      const darkText =
        t.colour === "black" || (t.level && DARK_LEVELS.has(t.level));
      const lightText =
        t.colour === "white" || (t.level && LIGHT_LEVELS.has(t.level));

      // (a) dark text + a dark background in the same string
      if (darkText && hasDarkBg) {
        findings.push({ file, kind: "dark-on-dark", token: t.token, body });
      }
      // (b) light text that stays light while the bg flips
      else if (lightText && hasDarkBg) {
        findings.push({ file, kind: "check-light-text", token: t.token, body });
      }
      // (c) dark text with no dark bg at all -> sits on a themed surface
      else if (darkText) {
        findings.push({ file, kind: "dark-text-themed-bg", token: t.token, body });
      }
    }
  }
}

const byKind = {};
for (const f of findings) (byKind[f.kind] ??= []).push(f);

for (const kind of ["dark-on-dark", "dark-text-themed-bg", "check-light-text"]) {
  const list = byKind[kind] ?? [];
  console.log(`\n### ${kind} — ${list.length}`);
  const seen = new Set();
  for (const f of list) {
    const key = `${f.file}|${f.token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(
      `  ${relative(ROOT, f.file)}  ${f.token}\n      ${f.body.replace(/\s+/g, " ").slice(0, 140)}`,
    );
  }
}
console.log(`\nTOTAL ${findings.length}`);
