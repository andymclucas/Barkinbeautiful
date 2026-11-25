import { describe, expect, it } from "vitest";
import {
  clientFailureNotice,
  isScheduledRetry,
  isStaffPressedRetry,
  planAfterFailure,
  SCHEDULED_RETRY_METADATA_KEY,
} from "@shared/stripeBilling";

describe("what the client is told after a failed membership payment (Andy, 25/11/2026)", () => {
  const monday = new Date("2026-10-26T04:00:00Z");

  it("walks portal notice, then email, then suspension for a weekly membership", () => {
    const steps = [1, 2, 3].map((count) => {
      const plan = planAfterFailure(count, "retry", monday, "weekly");
      return clientFailureNotice(count, plan.suspend);
    });
    expect(steps).toEqual(["portal", "retry_email", "suspended_email"]);
  });

  it("goes straight to the suspension email for a card no retry can fix", () => {
    const plan = planAfterFailure(1, "new_card", monday, "weekly");
    expect(clientFailureNotice(1, plan.suspend)).toBe("suspended_email");
  });

  it("emails on every retried failure after the first on a monthly plan", () => {
    expect(clientFailureNotice(2, false)).toBe("retry_email");
    expect(clientFailureNotice(3, false)).toBe("retry_email");
  });
});

describe("the 9 am retry's own decline is not counted twice", () => {
  const stampedAt = 1_800_000_000;
  const metadata = { [SCHEDULED_RETRY_METADATA_KEY]: String(stampedAt) };

  it("recognises a failure that lands just after the job's stamp", () => {
    expect(isScheduledRetry(metadata, stampedAt + 20)).toBe(true);
  });

  it("counts Stripe's own later attempt on the same invoice as usual", () => {
    expect(isScheduledRetry(metadata, stampedAt + 6 * 3600)).toBe(false);
  });

  it("is not mistaken for a staff-pressed retry", () => {
    expect(isStaffPressedRetry(metadata, stampedAt + 20)).toBe(false);
  });
});
