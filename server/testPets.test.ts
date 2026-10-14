import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Delegation checks, in the sense CLAUDE.md §7 allows: they count call
 * sites rather than asserting behaviour from source text.
 *
 * A test dog is only kept out of the salon's figures by a predicate on each
 * query that counts appointments. There is no join to forget and no type
 * error if one is missed — a new analytics query simply counts Link's
 * fixture grooms as somebody's work, silently, the way one of them has
 * counted as a completed groom for Charlotte Purcell since 05/10/2026.
 */
const routers = readFileSync(new URL("../server/routers.ts", import.meta.url), "utf8");

describe("test dogs stay out of the figures", () => {
  it("every appointment date-range query excludes them", () => {
    // One predicate per range condition in the analytics procedures. If a
    // query gains a range and not the predicate, this drops below the
    // count and says so.
    const ranges = routers.match(/gte\(appointments\.scheduledStart/g) ?? [];
    const guards = routers.match(/excludeTestPets\(appointments\.petId\)/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(10);
    expect(guards.length).toBeLessThanOrEqual(ranges.length);
  });

  it("reaches the predicate through the shared helper", () => {
    // Written out inline, a copy would drift from the column name the way
    // the MoeGo staff alias map did.
    const inline = routers.match(/NOT IN \(SELECT id FROM pets WHERE is_test/g) ?? [];
    expect(inline).toEqual([]);
  });

  it("does not filter the calendar or the board", () => {
    // The point of a test dog is being able to see him while testing.
    for (const procedure of ["getAppointments", "getBoard"]) {
      const at = routers.indexOf(`${procedure}: operationalProcedure`);
      expect(at).toBeGreaterThan(-1);
      const body = routers.slice(at, at + 4000);
      expect(body).not.toContain("excludeTestPets");
    }
  });

  it("keeps the inference script from reading fixture grooms as evidence", () => {
    const script = readFileSync(
      new URL("../scripts/backfill-preferred-groomers-2026-10-14.ts", import.meta.url), "utf8");
    expect(script).toContain("p.is_test = FALSE");
    expect(script).toContain("is_test = TRUE");
  });
});
