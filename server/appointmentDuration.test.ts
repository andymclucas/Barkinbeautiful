import { describe, it, expect } from "vitest";
import { getAutoDurationMinutes, getAutoDurationMinutesForPets } from "../shared/appointmentDuration";

describe("automatic appointment duration by weight", () => {
  it("maps each weight band to the requested duration for full grooms", () => {
    expect(getAutoDurationMinutes("classic_groom", 8)).toBe(60);   // small
    expect(getAutoDurationMinutes("classic_groom", 12)).toBe(60);  // small-medium
    expect(getAutoDurationMinutes("styled_groom", 15)).toBe(90);   // medium
    expect(getAutoDurationMinutes("styled_groom", 20)).toBe(120);  // large
    expect(getAutoDurationMinutes("classic_groom", 30)).toBe(180); // extra large
    expect(getAutoDurationMinutes("styled_groom", 50)).toBe(180);  // giant
  });

  it("applies the same durations to FFT as full grooms", () => {
    expect(getAutoDurationMinutes("fft", 8)).toBe(60);
    expect(getAutoDurationMinutes("fft", 15)).toBe(90);
    expect(getAutoDurationMinutes("fft", 20)).toBe(120);
    expect(getAutoDurationMinutes("fft", 50)).toBe(180);
  });

  it("does not suggest a duration for other service types", () => {
    expect(getAutoDurationMinutes("bath_only", 20)).toBeNull();
    expect(getAutoDurationMinutes("nail_trim", 20)).toBeNull();
    expect(getAutoDurationMinutes("deshed", 20)).toBeNull();
  });

  it("does not suggest a duration when weight is unknown", () => {
    expect(getAutoDurationMinutes("classic_groom", null)).toBeNull();
    expect(getAutoDurationMinutes("classic_groom", undefined)).toBeNull();
  });

  it("sums durations across a family booking's dogs", () => {
    expect(getAutoDurationMinutesForPets("classic_groom", [8, 15])).toBe(60 + 90);
    expect(getAutoDurationMinutesForPets("styled_groom", [20, 50, 8])).toBe(120 + 180 + 60);
  });

  it("falls back to no suggestion if any family-booking dog's weight is unknown", () => {
    expect(getAutoDurationMinutesForPets("classic_groom", [8, null])).toBeNull();
  });
});

/**
 * Andy, 04/11/2026, after a two-dog booking refused to save: "Fix the
 * Ends field bug."
 *
 * The end time is suggested from the dogs' size, and the only way in
 * was a recorded WEIGHT — even though the table is keyed by band and
 * `pets.size_band` already holds one. 4,478 active dogs have a band and
 * no weight. One unknown dog abandons the whole total, so a family with
 * a weighed dog and an unweighed one got no suggestion at all, left the
 * end time empty, and the booking would not save.
 */
describe("falling back to the recorded size band", () => {
  it("uses the band when no weight is on file", () => {
    expect(getAutoDurationMinutes("classic_groom", null, "small")).toBe(60);
    expect(getAutoDurationMinutes("classic_groom", null, "medium")).toBe(90);
    expect(getAutoDurationMinutes("styled_groom", null, "large")).toBe(120);
    expect(getAutoDurationMinutes("fft", null, "giant")).toBe(180);
  });

  /*
   * A figure from the scales beats a band somebody set by hand years
   * ago, so the weight still wins where both exist.
   */
  it("prefers a recorded weight over the band", () => {
    expect(getAutoDurationMinutes("classic_groom", 42, "small")).toBe(180);
    expect(getAutoDurationMinutes("classic_groom", 8, "giant")).toBe(60);
  });

  it("still gives nothing when neither is known", () => {
    expect(getAutoDurationMinutes("classic_groom", null, null)).toBeNull();
    expect(getAutoDurationMinutes("classic_groom", null, "   ")).toBeNull();
    expect(getAutoDurationMinutes("classic_groom", null)).toBeNull();
  });

  it("ignores a band it does not recognise rather than guessing", () => {
    expect(getAutoDurationMinutes("classic_groom", null, "enormous")).toBeNull();
  });

  it("still refuses a service that is not timed by size", () => {
    expect(getAutoDurationMinutes("bath_only", null, "small")).toBeNull();
    expect(getAutoDurationMinutes("nail_trim", 8, "small")).toBeNull();
  });
});

describe("a family booking of weighed and unweighed dogs", () => {
  /* Exactly the booking that failed: a 42 kg dog and a banded one. */
  it("totals a weighed dog and a banded one", () => {
    expect(getAutoDurationMinutesForPets("classic_groom", [
      { weightKg: 42, sizeBand: null },
      { weightKg: null, sizeBand: "small" },
    ])).toBe(180 + 60);
  });

  it("totals three dogs known only by band", () => {
    expect(getAutoDurationMinutesForPets("styled_groom", [
      { weightKg: null, sizeBand: "small" },
      { weightKg: null, sizeBand: "medium" },
      { weightKg: null, sizeBand: "large" },
    ])).toBe(60 + 90 + 120);
  });

  /*
   * Still all-or-nothing. A dog whose size is genuinely unknown makes
   * the TOTAL a guess, and a wrong end time on a family booking blocks
   * a groomer's afternoon.
   */
  it("gives nothing when one dog's size is genuinely unknown", () => {
    expect(getAutoDurationMinutesForPets("classic_groom", [
      { weightKg: 42, sizeBand: "giant" },
      { weightKg: null, sizeBand: null },
    ])).toBeNull();
  });

  it("still accepts a bare list of weights, as the old callers passed", () => {
    expect(getAutoDurationMinutesForPets("classic_groom", [8, 15])).toBe(60 + 90);
    expect(getAutoDurationMinutesForPets("classic_groom", [8, null])).toBeNull();
  });

  it("gives nothing for no dogs at all", () => {
    expect(getAutoDurationMinutesForPets("classic_groom", [])).toBeNull();
  });
});
