import { describe, expect, it } from "vitest";
import { PREVIEW_BOOKING_NOTE, buildOnlineBookingNotes } from "../shared/onlineBookingPreview";
import { getEligibleOnlineBookingServices, getPetWeightBand } from "../shared/onlineBookingWeightEligibility";

describe("online booking preview notes", () => {
  it("marks preview requests so they remain auditable and non-client-facing", () => {
    expect(buildOnlineBookingNotes({
      notes: "Test one",
      sizeLabel: "Extra Large",
      weightKg: 35,
      preview: true,
    })).toBe(`${PREVIEW_BOOKING_NOTE}\nTest one\nOnline booking size: Extra Large (35kg).`);
  });

  it("keeps normal requests free of preview markers", () => {
    expect(buildOnlineBookingNotes({ sizeLabel: "Small", weightKg: 8, preview: false }))
      .toBe("Online booking size: Small (8kg).");
  });

  it("prepares an auditable preview request across all six requested weight boundaries", () => {
    const cases = [
      [10, "Small"],
      [11, "Small–Medium"],
      [14, "Medium"],
      [17, "Large"],
      [26, "Extra Large"],
      [36, "Giant"],
    ] as const;

    for (const [weightKg, label] of cases) {
      const band = getPetWeightBand(weightKg);
      const service = getEligibleOnlineBookingServices(weightKg).find((entry) => entry.value === "classic_groom");
      expect(band?.label).toBe(label);
      expect(service?.label).toContain(label);
      expect(buildOnlineBookingNotes({ sizeLabel: band!.label, weightKg, preview: true }))
        .toContain(PREVIEW_BOOKING_NOTE);
    }
  });
});
