import { describe, expect, it } from "vitest";
import {
  hasCardOnFile,
  isPortalNoCardRecipient,
  portalNoCardRecipients,
  type PortalNoCardCandidate,
} from "./portalNoCardAudience";

const none = new Set<number>();

const c = (id: number, over: Partial<PortalNoCardCandidate> = {}): PortalNoCardCandidate => ({
  id,
  status: "active",
  portalAccountStatus: "active",
  stripeCustomerId: null,
  stripeDefaultPaymentMethodId: null,
  ...over,
});

describe("portal, no card audience", () => {
  it("includes an active client on the portal with no card", () => {
    expect(isPortalNoCardRecipient(c(1), none)).toBe(true);
  });

  it("leaves out a client who has a card", () => {
    const withCard = c(1, { stripeCustomerId: "cus_1", stripeDefaultPaymentMethodId: "pm_1" });
    expect(isPortalNoCardRecipient(withCard, none)).toBe(false);
  });

  it("still includes a Stripe customer with no payment method", () => {
    expect(isPortalNoCardRecipient(c(1, { stripeCustomerId: "cus_1" }), none)).toBe(true);
    expect(hasCardOnFile({ stripeCustomerId: "cus_1", stripeDefaultPaymentMethodId: null })).toBe(false);
    expect(hasCardOnFile({ stripeCustomerId: null, stripeDefaultPaymentMethodId: "pm_1" })).toBe(false);
  });

  it.each(["not_enabled", "setup_pending", "revoked", null])(
    "leaves out a portal account that is %s",
    (portalAccountStatus) => {
      expect(isPortalNoCardRecipient(c(1, { portalAccountStatus }), none)).toBe(false);
    },
  );

  it.each(["inactive", "blocked", "archived", null])("leaves out a client whose status is %s", (status) => {
    expect(isPortalNoCardRecipient(c(1, { status }), none)).toBe(false);
  });

  it("leaves out a client the salon has on hold", () => {
    expect(isPortalNoCardRecipient(c(15), new Set([15, 258]))).toBe(false);
  });

  it("filters a list and keeps the rows' other fields", () => {
    const rows = [
      { ...c(1), email: "a@example.com" },
      { ...c(2, { stripeCustomerId: "cus_2", stripeDefaultPaymentMethodId: "pm_2" }), email: "b@example.com" },
      { ...c(3, { portalAccountStatus: "setup_pending" }), email: "c@example.com" },
      { ...c(258), email: "d@example.com" },
    ];
    expect(portalNoCardRecipients(rows, new Set([258]))).toEqual([rows[0]]);
  });
});
