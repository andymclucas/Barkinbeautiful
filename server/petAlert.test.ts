import { describe, expect, it } from "vitest";
import { petAlertTone, petAlertText, stripAlertProvenance } from "@shared/petAlert";

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
    // "MoeGo source alert..." became "MoeGo sourc al" on screen. Bear's
    // warning is the longest on file and every word of it matters.
    const long = "Bites for face and feet. Do not muzzle; nails last with a second person holding. No crate; hitch to wall.";
    expect(petAlertText({ alertLevel: "caution", warnings: long })).toBe(long);
  });

  it("still says something when the level is set but no text was written", () => {
    expect(petAlertText({ alertLevel: "danger" })).toMatch(/danger/i);
    expect(petAlertText({ alertLevel: "caution" })).toMatch(/caution/i);
  });
});

describe("stripping the import's provenance off a warning", () => {
  it("leaves just the alert itself", () => {
    // All four shapes that exist in the salon's data.
    expect(stripAlertProvenance("MoeGo source alert (20 Aug 2026): allergy to chicken."))
      .toBe("Allergy to chicken.");
    expect(stripAlertProvenance("MoeGo source behaviour (20 Aug 2026): Noisy."))
      .toBe("Noisy.");
    expect(stripAlertProvenance("MoeGo recovery (20 Aug 2026): Bites for face and feet."))
      .toBe("Bites for face and feet.");
    expect(stripAlertProvenance("MoeGo report recovery (13 Aug 2025): described as a little shy."))
      .toBe("Described as a little shy.");
  });

  it("reads through to what the board actually shows", () => {
    expect(petAlertText({ alertLevel: "caution", warnings: "MoeGo source alert (20 Aug 2026): allergy to beef and green ants." }))
      .toBe("Allergy to beef and green ants.");
  });

  it("leaves a warning somebody typed themselves alone", () => {
    const written = "Bites for face and feet. Do not muzzle; nails last with a second person holding.";
    expect(stripAlertProvenance(written)).toBe(written);
    expect(stripAlertProvenance("Lead chewer.")).toBe("Lead chewer.");
  });

  it("keeps the original if stripping would leave nothing", () => {
    // A warning that is only provenance is still better than a blank chip.
    expect(stripAlertProvenance("MoeGo source alert (20 Aug 2026):")).toBe("MoeGo source alert (20 Aug 2026):");
  });

  it("does not strip a mention of MoeGo mid-sentence", () => {
    const text = "Owner says MoeGo had the wrong number (fixed).";
    expect(stripAlertProvenance(text)).toBe(text);
  });
});
