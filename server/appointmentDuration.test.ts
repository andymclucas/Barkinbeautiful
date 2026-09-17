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
