import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Every piece of state in DashboardLayout reaches something.
 *
 * On 05/11/2026 MyProfileDialog was imported, `profileOpen` was set by
 * the account menu, and the dialog was never rendered. "My profile" did
 * nothing when clicked, and the sidebar-hover preference that lives
 * inside it could not be reached at all — Andy went looking for the
 * switch he had asked for and there was no way in.
 *
 * `tsc` cannot see this. A destructured `[value, setValue]` counts as
 * used the moment the setter is, so an open-flag that nothing reads
 * compiles perfectly and renders nothing. It is the same shape as
 * 45253c5, where a router was defined in its own file and never
 * composed into appRouter: everything builds, nothing runs.
 * procedureSurface.test.ts guards that class on the server; this is the
 * client half of it.
 *
 * Deliberately a wiring check and not a behaviour one — CLAUDE.md §7
 * allows a structural test to prove DELEGATION. It asserts that each
 * state value is consumed somewhere, not what it looks like when it is.
 */
const source = readFileSync(
  new URL("../client/src/components/DashboardLayout.tsx", import.meta.url),
  "utf8",
);

describe("DashboardLayout wiring", () => {
  it("reads every useState value it declares", () => {
    const declared = [...source.matchAll(/const \[(\w+), set\w+\] = useState/g)].map(
      (m) => m[1],
    );
    // If this ever hits zero the regex has rotted and the test is
    // passing vacuously, which is worse than failing.
    expect(declared.length).toBeGreaterThan(0);

    const unread = declared.filter((name) => {
      // Occurrences of the bare identifier, excluding its own declaration.
      const uses = source.match(new RegExp(`\\b${name}\\b`, "g")) ?? [];
      return uses.length < 2;
    });

    expect(
      unread,
      `set but never read, so whatever they control is unreachable: ${unread.join(", ")}`,
    ).toEqual([]);
  });

  it("renders the profile dialog it imports", () => {
    // The specific regression, named, so the reason survives even if the
    // general check above is ever loosened.
    expect(source).toContain('import { MyProfileDialog }');
    expect(source).toMatch(/<MyProfileDialog\s+open=\{profileOpen\}/);
  });
});
