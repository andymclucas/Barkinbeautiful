import { describe, expect, it } from "vitest";
import { isStaffPressedRetry, STAFF_RETRY_METADATA_KEY, STAFF_RETRY_WINDOW_SECONDS } from "./stripeBilling";

const stamped = (at: number) => ({ [STAFF_RETRY_METADATA_KEY]: String(at) });

describe("isStaffPressedRetry", () => {
  const pressedAt = 1_800_000_000;

  it("is the button's when the failure lands just after the stamp", () => {
    expect(isStaffPressedRetry(stamped(pressedAt), pressedAt + 2)).toBe(true);
    expect(isStaffPressedRetry(stamped(pressedAt), pressedAt + STAFF_RETRY_WINDOW_SECONDS)).toBe(true);
  });

  it("allows a few seconds of clock difference the other way", () => {
    expect(isStaffPressedRetry(stamped(pressedAt), pressedAt - 5)).toBe(true);
    expect(isStaffPressedRetry(stamped(pressedAt), pressedAt - 60)).toBe(false);
  });

  it("counts an automatic attempt on an invoice with no stamp", () => {
    expect(isStaffPressedRetry(null, pressedAt)).toBe(false);
    expect(isStaffPressedRetry({}, pressedAt)).toBe(false);
    expect(isStaffPressedRetry({ other: "1" }, pressedAt)).toBe(false);
  });

  it("counts Stripe's later automatic attempt on an invoice stamped earlier", () => {
    expect(isStaffPressedRetry(stamped(pressedAt), pressedAt + STAFF_RETRY_WINDOW_SECONDS + 1)).toBe(false);
    expect(isStaffPressedRetry(stamped(pressedAt), pressedAt + 3 * 24 * 3600)).toBe(false);
  });

  it("counts when the stamp or the event time is unreadable", () => {
    expect(isStaffPressedRetry({ [STAFF_RETRY_METADATA_KEY]: "soon" }, pressedAt)).toBe(false);
    expect(isStaffPressedRetry({ [STAFF_RETRY_METADATA_KEY]: "" }, pressedAt)).toBe(false);
    expect(isStaffPressedRetry(stamped(pressedAt), null)).toBe(false);
    expect(isStaffPressedRetry(stamped(pressedAt), 0)).toBe(false);
  });
});
