import { describe, expect, it } from "vitest";
import {
  canAccessSalon, resolveActiveSalon, shouldOfferSalonSwitcher,
} from "../shared/salonAccess";

const BARKIN = 1;
const PET_PAD = 2;

describe("which salon a request acts on", () => {
  it("honours a requested salon the user actually has access to", () => {
    expect(resolveActiveSalon({
      requested: PET_PAD, accessible: [BARKIN, PET_PAD], fallback: BARKIN,
    })).toBe(PET_PAD);
  });

  it("IGNORES a requested salon the user has no access to", () => {
    /*
     * The number arrives from the browser. This is the whole security
     * boundary: everything the salon can see is filtered by what this
     * returns, so a value somebody typed into a request must never be
     * able to select a salon they are not in.
     */
    expect(resolveActiveSalon({
      requested: 999, accessible: [BARKIN], fallback: BARKIN,
    })).toBe(BARKIN);
    expect(resolveActiveSalon({
      requested: PET_PAD, accessible: [BARKIN], fallback: BARKIN,
    })).toBe(BARKIN);
  });

  it("falls back rather than throwing on a stale selection", () => {
    // A tab left open on a salon whose access was since removed must not
    // lock the person out of everything — they drop back to their own.
    expect(resolveActiveSalon({
      requested: PET_PAD, accessible: [BARKIN], fallback: null,
    })).toBe(BARKIN);
  });

  it("uses the home salon when nothing was requested", () => {
    expect(resolveActiveSalon({
      accessible: [BARKIN, PET_PAD], fallback: PET_PAD,
    })).toBe(PET_PAD);
  });

  it("is deterministic when there is no request and no usable fallback", () => {
    /*
     * tenantForUser used to resolve a multi-salon user through
     * `staff.tenantId` with `.limit(1)` and no ORDER BY. With one salon
     * that is fine; with two, which one Lauren lands in is whatever the
     * database returns first — and it can differ between two requests a
     * second apart, with nothing to notice. Same answer every time, or
     * it is not a boundary.
     */
    for (let i = 0; i < 5; i++) {
      expect(resolveActiveSalon({ accessible: [PET_PAD, BARKIN], fallback: null })).toBe(BARKIN);
      expect(resolveActiveSalon({ accessible: [BARKIN, PET_PAD], fallback: 999 })).toBe(BARKIN);
    }
  });

  it("returns null for somebody with no salon at all", () => {
    // Never 1. Defaulting to the first salon is exactly the behaviour
    // shared/tenantResolution.ts exists to remove.
    expect(resolveActiveSalon({ accessible: [], fallback: BARKIN })).toBeNull();
    expect(resolveActiveSalon({ requested: BARKIN, accessible: [] })).toBeNull();
  });

  it("ignores junk ids from either side", () => {
    expect(resolveActiveSalon({
      requested: 0, accessible: [BARKIN], fallback: BARKIN,
    })).toBe(BARKIN);
    expect(resolveActiveSalon({
      requested: -3, accessible: [BARKIN, -1, 0, 1.5] as number[], fallback: null,
    })).toBe(BARKIN);
    expect(resolveActiveSalon({
      accessible: [Number.NaN, BARKIN] as number[], fallback: Number.NaN,
    })).toBe(BARKIN);
  });

  it("tolerates a duplicated access row", () => {
    // A person given access twice is a data accident, not a second salon.
    expect(shouldOfferSalonSwitcher([BARKIN, BARKIN])).toBe(false);
    expect(resolveActiveSalon({ accessible: [BARKIN, BARKIN], fallback: null })).toBe(BARKIN);
  });
});

describe("canAccessSalon", () => {
  it("is the check every write should be guarded by", () => {
    expect(canAccessSalon([BARKIN, PET_PAD], PET_PAD)).toBe(true);
    expect(canAccessSalon([BARKIN], PET_PAD)).toBe(false);
    expect(canAccessSalon([], BARKIN)).toBe(false);
    expect(canAccessSalon([BARKIN], null)).toBe(false);
    expect(canAccessSalon([BARKIN], undefined)).toBe(false);
  });
});

describe("the switcher only appears when there is something to switch to", () => {
  it("stays hidden for a single-salon account", () => {
    // Which is almost every account. A dropdown with one entry reads as a
    // setting somebody has failed to finish configuring.
    expect(shouldOfferSalonSwitcher([BARKIN])).toBe(false);
    expect(shouldOfferSalonSwitcher([])).toBe(false);
  });

  it("appears for Lauren", () => {
    expect(shouldOfferSalonSwitcher([BARKIN, PET_PAD])).toBe(true);
  });
});
