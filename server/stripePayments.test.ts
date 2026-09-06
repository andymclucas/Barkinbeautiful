import { describe, expect, it } from "vitest";
import { buildInvoiceCheckoutMetadata } from "./stripePayments";

describe("Stripe invoice Checkout metadata", () => {
  it("links a hosted invoice settlement to the precise Groomigo records without card data", () => {
    expect(buildInvoiceCheckoutMetadata({ invoiceId: 42, clientId: 9, membershipId: 3, tenantId: 1 })).toEqual({
      invoice_id: "42", client_id: "9", membership_id: "3", tenant_id: "1", payment_kind: "invoice_settlement",
    });
  });

  it("marks metadata for a payment outcome without including card or client contact data", () => {
    const metadata = buildInvoiceCheckoutMetadata({ invoiceId: 7, clientId: 5, membershipId: null, tenantId: 1 });
    expect(metadata).toMatchObject({ invoice_id: "7", client_id: "5", membership_id: "", payment_kind: "invoice_settlement" });
    expect(Object.keys(metadata)).not.toContain("card_number");
  });
});
