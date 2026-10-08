import { describe, expect, it } from "vitest";
import { petAlertTone, petAlertText } from "@shared/petAlert";

describe("when a dog gets a warning flag", () => {
  it("flags a written warning even when the level was never set", () => {
    // Bear, pet #26 on 09/10/2026: a real handling instruction sitting at
    // alertLevel "ok", so the board showed nothing at all.
    const bear = { alertLevel: "ok", warnings: "Bites for face and feet. Do not muzzle; nails last with a second person holding." };
    expect(petAlertTone(bear)).toBe("caution");
    expect(petAlertText(bear)).toContain("Do not muzzle");
  });

  it("keeps danger louder than caution", () => {
    expect(petAlertTone({ alertLevel: "danger" })).toBe("danger");
    expect(petAlertTone({ alertLevel: "caution" })).toBe("caution");
  });

  it("says nothing about a dog with nothing on file", () => {
    expect(petAlertTone({ alertLevel: "ok" })).toBeNull();
    expect(petAlertTone({ alertLevel: "ok", warnings: "   " })).toBeNull();
    expect(petAlertTone({})).toBeNull();
    expect(petAlertText({ alertLevel: "ok" })).toBeNull();
  });

  it("never truncates the text", () => {
    // The old badge cut the warning at 15 characters, which is how
    // "MoeGo source alert..." became "MoeGo sourc al" on screen.
    const long = "MoeGo source alert (20 Aug 2026): allergy to beef and green ants.";
    expect(petAlertText({ alertLevel: "caution", warnings: long })).toBe(long);
  });

  it("still says something when the level is set but no text was written", () => {
    expect(petAlertText({ alertLevel: "danger" })).toMatch(/danger/i);
    expect(petAlertText({ alertLevel: "caution" })).toMatch(/caution/i);
  });
});
