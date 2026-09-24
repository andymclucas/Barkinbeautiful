import { describe, expect, it } from "vitest";
import { buildPetTrackerSms } from "./sms";

describe("Pet Tracker SMS template", () => {
  it("includes the pet, salon and unique tracker URL", () => {
    const body = buildPetTrackerSms({
      clientFirstName: "Lauren",
      petName: "Ruby",
      salonName: "Barkin' Beautiful",
      trackerUrl: "https://staff.barkinbeautiful.com.au/track/abc123",
    });
    expect(body).toContain("Ruby has checked in");
    expect(body).toContain("Barkin' Beautiful");
    expect(body).toContain("/track/abc123");
  });
});
