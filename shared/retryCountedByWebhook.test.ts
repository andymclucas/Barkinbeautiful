import { describe, expect, it } from "vitest";
import { retryCountedByWebhook } from "./stripeBilling";

describe("retryCountedByWebhook", () => {
  it("leaves a failed retry of an open invoice to the webhook, so it is one strike", () => {
    expect(retryCountedByWebhook("in_123")).toBe(true);
  });

  it("counts a direct charge at the button, because Stripe sends no invoice event for it", () => {
    for (const none of [null, undefined, "", "  "]) expect(retryCountedByWebhook(none)).toBe(false);
  });
});
