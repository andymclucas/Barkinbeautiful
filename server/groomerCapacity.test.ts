import { describe, expect, it } from "vitest";
import { addsToGroomerDay, groomerDayLoad, overbookingWarning, isClip, isTidy, clipLoadFor, clipLoadOf } from "@shared/groomerCapacity";

describe("what uses up a groomer's day", () => {
  it("counts clips", () => {
    expect(isClip("classic_groom")).toBe(true);
    expect(isClip("styled_groom")).toBe(true);
  });

  it("does not count the work that goes to the bathers", () => {
    // Lauren, 08/10/2026: "Desheds will be on the bathers."
    for (const service of ["deshed", "bath_only", "nail_trim", "fft", "daycare", "other"]) {
      expect(isClip(service)).toBe(false);
    }
    expect(isClip(null)).toBe(false);
  });
});

describe("how full a day is", () => {
  it("shows the real numbers", () => {
    const load = groomerDayLoad(4, 8);
    expect(load.label).toBe("4/8");
    expect(load.state).toBe("space");
    expect(load.remaining).toBe(4);
  });

  it("knows when a day is exactly full", () => {
    expect(groomerDayLoad(8, 8).state).toBe("full");
    expect(groomerDayLoad(8, 8).remaining).toBe(0);
  });

  it("knows when it is over, which the diary already is", () => {
    // Ashleigh had 8 booked for 13 October against a capacity of 5.
    const load = groomerDayLoad(8, 5);
    expect(load.state).toBe("over");
    expect(load.remaining).toBe(-3);
    expect(load.label).toBe("8/5");
  });

  it("says nothing it cannot know when no capacity is set", () => {
    // Every bather, both managers, and any future salon on day one.
    const load = groomerDayLoad(4, null);
    expect(load.state).toBe("unknown");
    expect(load.label).toBe("4");
    expect(load.remaining).toBeNull();
  });

  it("treats a zero capacity as nobody having said", () => {
    // Zero is what an emptied input box saves as. Reading it as "can do no
    // dogs" would mark a working groomer permanently over.
    expect(groomerDayLoad(3, 0).state).toBe("unknown");
    expect(groomerDayLoad(3, -2).state).toBe("unknown");
  });
});

describe("warning before one more is added", () => {
  it("says nothing while there is room", () => {
    expect(overbookingWarning(groomerDayLoad(4, 8), "Megs")).toBeNull();
    expect(overbookingWarning(groomerDayLoad(7, 8), "Megs")).toBeNull();
  });

  it("speaks up on the one that tips it over", () => {
    expect(overbookingWarning(groomerDayLoad(8, 8), "Megs Graham"))
      .toBe("Megs Graham would be 1 clip over an 8-dog day (9 booked).");
  });

  it("counts how far over, not just that it is", () => {
    expect(overbookingWarning(groomerDayLoad(8, 5), "Ashleigh Knight"))
      .toBe("Ashleigh Knight would be 4 clips over a 5-dog day (9 booked).");
  });

  it("says nothing when nobody has stated a capacity", () => {
    expect(overbookingWarning(groomerDayLoad(20, null), "Lauren")).toBeNull();
  });

  it("handles adding several dogs at once", () => {
    // A family booking puts three dogs on one groomer in one go.
    expect(overbookingWarning(groomerDayLoad(6, 8), "Megs", 3))
      .toBe("Megs would be 1 clip over an 8-dog day (9 booked).");
  });
});

describe("a tidy is half a clip", () => {
  // Lauren, 08/10/2026: "Rule of thumb.. 2 tidys = a clip time."
  it("costs half a clip, while still not BEING a clip", () => {
    expect(clipLoadFor("fft")).toBe(0.5);
    expect(isTidy("fft")).toBe(true);
    // The two questions have different answers and both are asked.
    expect(isClip("fft")).toBe(false);
  });

  it("costs a whole clip for a groom and nothing for the bathers' work", () => {
    expect(clipLoadFor("classic_groom")).toBe(1);
    expect(clipLoadFor("styled_groom")).toBe(1);
    for (const service of ["deshed", "bath_only", "nail_trim", "daycare", "other", null]) {
      expect(clipLoadFor(service)).toBe(0);
    }
  });

  it("adds a day up the way Lauren counts it", () => {
    // Charlotte's real day: 6 clips and 5 tidies against an 8.
    expect(clipLoadOf(["classic_groom", "classic_groom", "classic_groom",
      "classic_groom", "classic_groom", "classic_groom",
      "fft", "fft", "fft", "fft", "fft"])).toBe(8.5);
  });

  it("does not hide the half that tips a groomer over", () => {
    // 8 clips + 1 tidy = 8.5 against an 8. Flooring read this as 8/8.
    const load = groomerDayLoad(8.5, 8);
    expect(load.state).toBe("over");
    expect(load.label).toBe("8.5/8");
  });

  it("still reads a whole day as a whole number", () => {
    expect(groomerDayLoad(6, 8).label).toBe("6/8");
  });

  it("says 'half a clip over' rather than '0.5 clips over'", () => {
    expect(overbookingWarning(groomerDayLoad(8, 8), "Charlotte", 0.5))
      .toBe("Charlotte would be half a clip over an 8-dog day (8.5 booked).");
  });

  it("leaves a day with room alone even once tidies count", () => {
    // 5 clips + 1 tidy = 5.5 against an 8.
    expect(overbookingWarning(groomerDayLoad(5.5, 8), "Megs", 1)).toBeNull();
  });
});

describe("whether a change adds to a groomer's day", () => {
  const onZee = { staffId: 7, dateKey: "2026-11-17", serviceType: "classic_groom" };

  it("does not when only the time, a note or the price changes", () => {
    // Lauren, 17/11/2026: a dog already on an over-full day could not be
    // saved without pressing "Move anyway".
    expect(addsToGroomerDay({ from: onZee, to: { ...onZee } })).toBe(false);
  });

  it("does when the dog moves to a different groomer", () => {
    expect(addsToGroomerDay({ from: onZee, to: { ...onZee, staffId: 8 } })).toBe(true);
    expect(addsToGroomerDay({ from: { ...onZee, staffId: null }, to: onZee })).toBe(true);
  });

  it("does when the dog moves to a different day", () => {
    expect(addsToGroomerDay({ from: onZee, to: { ...onZee, dateKey: "2026-11-18" } })).toBe(true);
  });

  it("does when the service gets heavier, and not when it gets lighter or stays", () => {
    expect(addsToGroomerDay({ from: { ...onZee, serviceType: "fft" }, to: onZee })).toBe(true);
    expect(addsToGroomerDay({ from: onZee, to: { ...onZee, serviceType: "fft" } })).toBe(false);
    expect(addsToGroomerDay({ from: onZee, to: { ...onZee, serviceType: "styled_groom" } })).toBe(false);
  });

  it("does when a cancelled booking is brought back, because it was not being counted", () => {
    expect(addsToGroomerDay({ from: { ...onZee, cancelled: true }, to: { ...onZee } })).toBe(true);
  });

  it("errs towards asking when the day is not known", () => {
    expect(addsToGroomerDay({ from: { ...onZee, dateKey: null }, to: onZee })).toBe(true);
    expect(addsToGroomerDay({ from: onZee, to: { ...onZee, dateKey: "" } })).toBe(true);
  });
});
