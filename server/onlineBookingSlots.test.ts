import { describe, expect, it } from "vitest";
import {
  ONLINE_BOOKING_SLOT_INTERVAL_MINUTES,
  buildOnlineBookingSlotStarts,
} from "../shared/onlineBookingSlots";

describe("online booking slot candidates", () => {
  it("builds half-hour AEST starts that allow a full service before closing", () => {
    const slots = buildOnlineBookingSlotStarts("2026-08-11", 120);
    expect(slots).toHaveLength(15);
    expect(slots[0]?.toISOString()).toBe("2026-08-10T22:00:00.000Z");
    expect(slots.at(-1)?.toISOString()).toBe("2026-08-11T05:00:00.000Z");
    expect(slots[1]!.getTime() - slots[0]!.getTime()).toBe(ONLINE_BOOKING_SLOT_INTERVAL_MINUTES * 60_000);
  });

  it("does not offer a start when the selected service cannot finish in booking hours", () => {
    expect(buildOnlineBookingSlotStarts("2026-08-11", 600)).toEqual([]);
  });
});
