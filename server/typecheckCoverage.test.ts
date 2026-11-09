import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * What `pnpm run check` is actually allowed to see.
 *
 * Until 09/11/2026 tsconfig.json excluded `**\/*.test.ts` and never
 * included `scripts/**`, so two large bodies of code were outside the
 * gate entirely: 319 server test files and ~45 operational scripts. The
 * gate read clean and said nothing about either.
 *
 * That hid 41 real type errors. Several were not test-only noise:
 *
 *   - PushEventInput named none of `tenantId`, `callSid` or `petNames`,
 *     which every event on the bus carries, and server/pushFanout.ts
 *     papered over the gap with a cast. A field added to an event could
 *     never have failed anything.
 *   - onlineBookingNotify.test.ts asserted on `sendEmail.mock.calls[0][0]`
 *     where the mock took no parameters, so the call list was an empty
 *     tuple and the `as { subject, html }` casts were converting
 *     `undefined`. Those assertions were checked against nothing.
 *   - withoutRevenueTarget's constraint was a weak type, so it rejected a
 *     record carrying no target -- the exact case its own test covers.
 *
 * So this pins the gate's reach rather than any one of those fixes. A
 * reinstated exclude silently un-checks thousands of lines, and the
 * symptom is a green check, which is the hardest kind of regression to
 * notice.
 */
describe("tsconfig covers everything we write", () => {
  const raw = readFileSync(resolve(import.meta.dirname, "../tsconfig.json"), "utf8");

  /**
   * tsconfig.json is JSONC by spec. This one holds no comments, but
   * stripping them means adding one later does not fail this test with a
   * parse error that says nothing about what it guards.
   */
  const config = JSON.parse(
    raw.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1"),
  ) as { include?: string[]; exclude?: string[] };

  const include = config.include ?? [];
  const exclude = config.exclude ?? [];

  it("includes every directory we author TypeScript in", () => {
    for (const root of ["client/src", "shared", "server", "scripts"]) {
      expect(include, `${root} must be inside the typecheck`).toContain(`${root}/**/*`);
    }
  });

  it("excludes nothing that we wrote", () => {
    // Only build output and dependencies. Anything else here is source
    // that stops being checked.
    expect([...exclude].sort()).toEqual(["build", "dist", "node_modules"]);
  });

  it("does not exclude test files", () => {
    // Named separately from the assertion above, so the failure says which
    // mistake was made rather than just "the list changed".
    const excludesTests = exclude.filter((pattern) => /\.test\./.test(pattern));
    expect(
      excludesTests,
      "test files were outside the gate until 09/11/2026 and hid 36 type errors",
    ).toEqual([]);
  });

  it("keeps strict on, since none of the above means much without it", () => {
    const options = (JSON.parse(
      raw.replace(/^\s*\/\/.*$/gm, "").replace(/,(\s*[}\]])/g, "$1"),
    ) as { compilerOptions?: Record<string, unknown> }).compilerOptions ?? {};
    expect(options.strict).toBe(true);
  });
});
