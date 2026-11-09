import { describe, it, expect } from "vitest";
import { EARLIEST_AUTOMATED_TEXT_HOUR, withinSendingHours } from "@shared/sendingHours";
import { QUIET_FROM_HOUR } from "@shared/bookingConfirmationSms";
import { REBOOK_QUIET_FROM_HOUR } from "@shared/rebookReminder";

/**
 * Andy, 09/11/2026: "9am texts only. No earlier than that."
 *
 * Before this there were four answers — 7, 7, 8, and none at all for
 * the appointment reminders, where the 06:30 cron schedule was the only
 * thing stopping them. This file exists so there is one.
 */
describe("EARLIEST_AUTOMATED_TEXT_HOUR", () => {
  it("is nine", () => {
    expect(EARLIEST_AUTOMATED_TEXT_HOUR).toBe(9);
  });

  /*
   * The point of the shared constant. Each of these used to carry its
   * own number and they disagreed with each other; if one drifts back
   * to a local literal this fails rather than quietly texting someone
   * at seven.
   */
  it("is the floor every sender uses", () => {
    expect(QUIET_FROM_HOUR).toBe(EARLIEST_AUTOMATED_TEXT_HOUR);
    expect(REBOOK_QUIET_FROM_HOUR).toBe(EARLIEST_AUTOMATED_TEXT_HOUR);
  });
});

describe("withinSendingHours", () => {
  it("refuses every hour before nine", () => {
    for (let hour = 0; hour < 9; hour++) {
      expect(withinSendingHours(hour, 19), `${hour}:00`).toBe(false);
    }
  });

  it("allows nine", () => {
    // Inclusive on the floor: "9am texts only" means nine is fine.
    expect(withinSendingHours(9, 19)).toBe(true);
  });

  it("stops at the latest hour, exclusive", () => {
    expect(withinSendingHours(18, 19)).toBe(true);
    expect(withinSendingHours(19, 19)).toBe(false);
    expect(withinSendingHours(23, 19)).toBe(false);
  });

  /*
   * Andy set a floor, not a window — each sender keeps the evening it
   * already had, so the function takes the latest hour rather than
   * owning it.
   */
  it("lets each sender keep its own evening", () => {
    expect(withinSendingHours(19, 20)).toBe(true);
    expect(withinSendingHours(19, 19)).toBe(false);
  });

  it("refuses the small hours whatever the latest is", () => {
    for (const latest of [19, 20, 23]) {
      expect(withinSendingHours(3, latest), `latest ${latest}`).toBe(false);
    }
  });
});
