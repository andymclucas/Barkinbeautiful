import { describe, expect, it } from "vitest";
import { billingSourceOf, membershipListFilter } from "./membershipBillingSource";

describe("who is billing a membership (Andy, 25/11/2026)", () => {
  it("is Groomigo when a subscription exists", () => {
    expect(billingSourceOf({ stripeSubscriptionId: "sub_123" })).toBe("groomigo");
    expect(billingSourceOf({ gatewaySubscriptionId: "gw_9" })).toBe("groomigo");
  });

  it("is MoeGo when nothing here can charge it", () => {
    expect(billingSourceOf({ stripeSubscriptionId: null, gatewaySubscriptionId: null })).toBe("moego");
    expect(billingSourceOf({ stripeSubscriptionId: "  " })).toBe("moego");
  });

  it("splits Active into billed in Groomigo and To be migrated", () => {
    expect(membershipListFilter("active")).toEqual({ status: "active", billing: "groomigo" });
    expect(membershipListFilter("to_migrate")).toEqual({ status: "active", billing: "moego" });
    expect(membershipListFilter("paused")).toEqual({ status: "paused" });
    expect(membershipListFilter("failed_payments")).toEqual({});
  });
});
