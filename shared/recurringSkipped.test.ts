import { describe, expect, it } from "vitest";
import { skippedOccurrenceMessages } from "./recurringSkipped";

const day = (when: Date | string) => String(when);

describe("skippedOccurrenceMessages", () => {
  it("gives the server's own reason, not a fixed one about the groomer", () => {
    const reason = "Joy and Sonny are already booked in that day — pick another date, or move the booking that exists";
    expect(skippedOccurrenceMessages([
      { scheduledStart: "Fri 20 Nov", reason },
      { scheduledStart: "Fri 18 Dec", reason },
    ], day)).toEqual([`Not booked on Fri 20 Nov, Fri 18 Dec. ${reason}.`]);
  });

  it("keeps different reasons apart, and keeps names as written", () => {
    expect(skippedOccurrenceMessages([
      { scheduledStart: "Fri 20 Nov", reason: "Charlie is not working then — Annual leave" },
      { scheduledStart: "Fri 18 Dec", reason: "Joy is already booked in that day." },
    ], day)).toEqual([
      "Not booked on Fri 20 Nov. Charlie is not working then — Annual leave.",
      "Not booked on Fri 18 Dec. Joy is already booked in that day.",
    ]);
  });

  it("still says something when no reason came back, and nothing when nothing was skipped", () => {
    expect(skippedOccurrenceMessages([{ scheduledStart: "Fri 20 Nov" }], day)).toEqual(["Not booked on Fri 20 Nov. It could not be booked."]);
    expect(skippedOccurrenceMessages([], day)).toEqual([]);
  });
});
