import { describe, it, expect } from "vitest";
import {
  SERVICE_TYPES, SERVICE_LABEL, SERVICE_BOARD_LABEL, SERVICE_COLOUR,
  serviceLabel, serviceBoardLabel, serviceColour, isNotAFullGroom,
  UNKNOWN_SERVICE_COLOUR,
} from "@shared/serviceTypes";

/**
 * Lauren, 04/11/2026: "one of the girls didn't see the service was just
 * a tidy and saw the code and did a clip... So this customer just got
 * free upgrade service."
 *
 * The workflow board carried its own copy of these maps keyed on
 * `tidy`, a service type renamed to `fft` long before. Every FFT
 * booking rendered grey with the raw string `fft`, and the board's own
 * legend advertised a pink "Tidy" that no row could ever wear.
 *
 * The maps are Record<ServiceType, ...> so the compiler catches a
 * missing key. These catch the things it cannot: an EMPTY label, and a
 * key that is not a real service type.
 */
describe("every service is labelled and coloured", () => {
  it("covers every service type, with nothing blank", () => {
    for (const type of SERVICE_TYPES) {
      expect(SERVICE_LABEL[type]?.trim(), type).toBeTruthy();
      expect(SERVICE_BOARD_LABEL[type]?.trim(), type).toBeTruthy();
      expect(SERVICE_COLOUR[type], type).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  /*
   * The actual bug: a key in the map that no appointment can ever have.
   * `tidy` sat here for months looking perfectly reasonable.
   */
  it("carries no key that is not a real service type", () => {
    for (const map of [SERVICE_LABEL, SERVICE_BOARD_LABEL, SERVICE_COLOUR]) {
      expect(Object.keys(map).sort()).toEqual([...SERVICE_TYPES].sort());
    }
  });

  it("still has a pink for FFT, now on a key that matches", () => {
    expect(SERVICE_COLOUR.fft).toBe("#ec4899");
    expect(serviceColour("fft")).toBe("#ec4899");
  });

  it("never gives two services the same colour unless they are the same job", () => {
    // classic and styled are both green on purpose — both are a full
    // groom, and the board distinguishes them by name.
    const byColour = new Map<string, string[]>();
    for (const type of SERVICE_TYPES) {
      const c = SERVICE_COLOUR[type];
      byColour.set(c, [...(byColour.get(c) ?? []), type]);
    }
    const shared = [...byColour.values()].filter((v) => v.length > 1);
    expect(shared).toEqual([["classic_groom", "styled_groom"]]);
  });
});

describe("the board label", () => {
  it("says TIDY ONLY on an FFT, which is the fact that was missed", () => {
    expect(serviceBoardLabel("fft")).toContain("TIDY ONLY");
  });

  it("keeps the full name available for everything else", () => {
    expect(serviceLabel("fft")).toBe("FFT (Face, Feet & Hygiene Tidy)");
    expect(serviceLabel("classic_groom")).toBe("Classic Groom");
  });

  it("never renders a raw snake_case string to a groomer", () => {
    for (const type of SERVICE_TYPES) {
      expect(serviceLabel(type), type).not.toMatch(/_/);
      expect(serviceBoardLabel(type), type).not.toMatch(/_/);
    }
  });
});

describe("falling back", () => {
  it("greys an unknown service rather than throwing", () => {
    expect(serviceColour("tidy")).toBe(UNKNOWN_SERVICE_COLOUR);
    expect(serviceColour(null)).toBe(UNKNOWN_SERVICE_COLOUR);
  });

  it("shows what it got rather than nothing", () => {
    expect(serviceLabel("mystery")).toBe("mystery");
    expect(serviceLabel(null)).toBe("—");
  });
});

describe("isNotAFullGroom", () => {
  /*
   * The expensive direction: work done, dog home, difference unbillable.
   */
  it("flags the jobs a groomer must not mistake for a clip", () => {
    expect(isNotAFullGroom("fft")).toBe(true);
    expect(isNotAFullGroom("bath_only")).toBe(true);
    expect(isNotAFullGroom("nail_trim")).toBe(true);
    expect(isNotAFullGroom("daycare")).toBe(true);
  });

  it("leaves the full grooms alone", () => {
    expect(isNotAFullGroom("classic_groom")).toBe(false);
    expect(isNotAFullGroom("styled_groom")).toBe(false);
    expect(isNotAFullGroom("deshed")).toBe(false);
  });

  it("does not flag something it has never heard of", () => {
    expect(isNotAFullGroom("tidy")).toBe(false);
    expect(isNotAFullGroom(undefined)).toBe(false);
  });
});
