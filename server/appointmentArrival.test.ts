import { describe, expect, it } from "vitest";
import { arrivalLabel, hasArrivedOnSite } from "../shared/appointmentArrival";

describe("hasArrivedOnSite", () => {
  it("is false before the dog is checked in", () => {
    expect(hasArrivedOnSite("scheduled")).toBe(false);
  });

  // The point of the tick: it must survive the dog being moved along the
  // board. One that vanished the moment bathing started would be worse than
  // no tick at all.
  it("stays true through every stage of the groom", () => {
    for (const state of [
      "checked_in", "waiting_for_bath", "bathing", "waiting_for_dry",
      "drying", "waiting_for_groom", "grooming", "ready",
    ]) {
      expect(hasArrivedOnSite(state)).toBe(true);
    }
  });

  it("stays true once complete — the dog did come in today", () => {
    expect(hasArrivedOnSite("complete")).toBe(true);
  });

  it("is false for a dog that never came", () => {
    expect(hasArrivedOnSite("cancelled")).toBe(false);
    expect(hasArrivedOnSite("no_show")).toBe(false);
  });

  // A row can sit at a mid-workflow state and still be cancelled on the
  // status column — today's MoeGo sync cancelled rows that way. The tick
  // must follow the cancellation, not the stale stage.
  it("is false when the booking is cancelled even if the stage says otherwise", () => {
    expect(hasArrivedOnSite("bathing", "cancelled")).toBe(false);
    expect(hasArrivedOnSite("grooming", "no_show")).toBe(false);
  });

  it("is true when the status is a normal one", () => {
    expect(hasArrivedOnSite("bathing", "confirmed")).toBe(true);
    expect(hasArrivedOnSite("bathing", "pending")).toBe(true);
  });

  it("is false for missing or unknown values rather than guessing", () => {
    expect(hasArrivedOnSite(null)).toBe(false);
    expect(hasArrivedOnSite(undefined)).toBe(false);
    expect(hasArrivedOnSite("")).toBe(false);
    expect(hasArrivedOnSite("waiting_for_pickup")).toBe(false);
  });
});

describe("arrivalLabel", () => {
  it("says checked in whatever stage the dog has reached", () => {
    expect(arrivalLabel("bathing")).toBe("Checked in");
    expect(arrivalLabel("checked_in")).toBe("Checked in");
  });

  it("adds the useful detail at the two stages staff act on", () => {
    expect(arrivalLabel("ready")).toBe("Checked in — ready for pickup");
    expect(arrivalLabel("complete")).toBe("Checked in — groom complete");
  });
});
