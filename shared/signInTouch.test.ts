import { describe, expect, it } from "vitest";
import { SIGN_IN_TOUCH_INTERVAL_MS, shouldRecordSignIn } from "./signInTouch";

describe("shouldRecordSignIn", () => {
  const now = new Date("2026-11-24T00:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("skips the write while the last one is recent", () => {
    expect(shouldRecordSignIn(ago(5_000), now)).toBe(false);
    expect(shouldRecordSignIn(ago(SIGN_IN_TOUCH_INTERVAL_MS - 1), now)).toBe(false);
  });

  it("writes once the interval has passed", () => {
    expect(shouldRecordSignIn(ago(SIGN_IN_TOUCH_INTERVAL_MS), now)).toBe(true);
    expect(shouldRecordSignIn(ago(86_400_000).toISOString(), now)).toBe(true);
  });

  it("writes when there is no usable value, or one in the future", () => {
    expect(shouldRecordSignIn(null, now)).toBe(true);
    expect(shouldRecordSignIn("not a date", now)).toBe(true);
    expect(shouldRecordSignIn(new Date(now.getTime() + 60_000), now)).toBe(true);
  });
});
