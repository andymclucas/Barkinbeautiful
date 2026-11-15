import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A grid that is one column on a phone must not hold a child that spans
 * two columns at every width.
 *
 * `grid-cols-1 sm:grid-cols-2` with a bare `col-span-2` child makes the
 * browser invent a second column on a phone, and every single-width field
 * is squeezed into what is left: about 10 pixels. That stacked the labels
 * of the staff edit form on top of each other (Lauren, 13/11/2026), and
 * the same pattern was sitting in six other places.
 *
 * This is a structural check, not a rendering test. jsdom does no layout,
 * so there is nothing to measure there; the cause is purely which classes
 * sit together, and that is what this counts.
 */
const ROOT = join(__dirname, "..", "client", "src");
const BARE_SPAN = /(?<![:\w-])col-span-(\d+)/g;
const GRID_COLS = /(?:[\w-]+:)?grid-cols-[\w[\]-]+/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    // iCloud leaves " 2.tsx" copies beside the real files; they are not built.
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) && !/ \d+\.tsx$/.test(name) ? [path] : [];
  });
}

describe("grids that are one column on a phone", () => {
  it("hold no child that spans several columns at every width", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(ROOT)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        for (const span of line.matchAll(BARE_SPAN)) {
          // The nearest grid declared above this child (or earlier on its line).
          for (let j = index; j >= Math.max(0, index - 80); j--) {
            const cols = lines[j].match(GRID_COLS);
            if (!cols) continue;
            if (j === index && lines[j].indexOf(cols[0]) > (span.index ?? 0)) continue;
            if (cols.includes("grid-cols-1")) {
              offenders.push(`${file.slice(ROOT.length + 1)}:${index + 1} col-span-${span[1]}`);
            }
            break;
          }
        }
      });
    }
    expect(offenders, "use sm:col-span-2 (or the breakpoint the grid widens at) instead").toEqual([]);
  });
});
