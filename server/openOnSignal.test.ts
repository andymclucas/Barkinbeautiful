import { describe, expect, it } from "vitest";
import { shouldActOnSignal } from "@shared/openOnSignal";

describe("a counter prop asking a child to act", () => {
  it("does nothing on mount, whatever the parent starts from", () => {
    // The regression: the store credit dialog opened every time somebody
    // opened a client's Payments tab, because the effect's first run was
    // indistinguishable from a request.
    for (const start of [0, 1, 7, -3]) {
      expect(shouldActOnSignal(start, start)).toBe(false);
    }
  });

  it("acts when the parent bumps it", () => {
    expect(shouldActOnSignal(1, 0)).toBe(true);
    expect(shouldActOnSignal(2, 1)).toBe(true);
  });

  it("does nothing again until the next bump", () => {
    // Re-renders re-run the effect with an unchanged value.
    expect(shouldActOnSignal(1, 1)).toBe(false);
  });

  it("does nothing when the parent is not using the signal at all", () => {
    expect(shouldActOnSignal(undefined, undefined)).toBe(false);
    expect(shouldActOnSignal(undefined, 4)).toBe(false);
  });
});
