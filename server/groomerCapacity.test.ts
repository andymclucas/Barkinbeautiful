import { describe, expect, it } from "vitest";
import { groomerDayLoad, overbookingWarning, isClip } from "@shared/groomerCapacity";

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
