import { describe, expect, it } from "vitest";
import { buildFailedPaymentEmail } from "./failedPaymentEmail";

const base = {
  clientId: 42,
  clientName: "Sam Example",
  memberships: [{ name: "Silver VIP Classic", dogNames: ["Biscuit"] }],
  amountDueCents: 3900,
  reason: "We'll try again.",
  suspended: false,
  retryAt: new Date("2026-11-23T00:00:00Z"),
  appBaseUrl: "https://staff.example.test/",
};

describe("buildFailedPaymentEmail", () => {
  it("names the client and the dog in the subject", () => {
    const { title } = buildFailedPaymentEmail(base);
    expect(title).toBe("⚠️ Membership payment failed: Sam Example (Biscuit)");
  });

  it("gives the plan, amount, reason, retry day and a link to the client", () => {
    const { content } = buildFailedPaymentEmail(base);
    expect(content.split("\n")).toEqual([
      "<strong>Sam Example (Biscuit)</strong>",
      "Plan: Silver VIP Classic",
      "Amount: $39.00",
      "Why: We'll try again.",
      "Groomigo will try the card again on Mon 23 Nov.",
      '<a href="https://staff.example.test/clients/42">Open Sam Example in Groomigo</a>',
    ]);
  });

  it("says bookings are on hold when suspended, and offers no retry day", () => {
    const { title, content } = buildFailedPaymentEmail({ ...base, suspended: true, retryAt: null });
    expect(title).toBe("⛔ Membership payment failed, bookings on hold: Sam Example (Biscuit)");
    expect(content).toContain("Their bookings are on hold until a payment goes through.");
    expect(content).not.toContain("try the card again");
  });

  it("lists every dog once across a shared payment", () => {
    const { title, content } = buildFailedPaymentEmail({
      ...base,
      memberships: [
        { name: "Gold", dogNames: ["Biscuit", "Crumb"] },
        { name: "Silver", dogNames: ["Crumb", "Toast"] },
      ],
    });
    expect(title).toContain("Sam Example (Biscuit, Crumb and Toast)");
    expect(content).toContain("Plan: Gold + Silver");
  });

  it("escapes names, and copes with nothing known", () => {
    const { title, content } = buildFailedPaymentEmail({
      ...base,
      clientId: null,
      clientName: null,
      memberships: [{ name: null, dogNames: ["<b>Rex</b> & co"] }],
      amountDueCents: null,
    });
    expect(title).toContain("A client (<b>Rex</b> & co)");
    expect(content).toContain("&lt;b&gt;Rex&lt;/b&gt; &amp; co");
    expect(content).toContain("Plan: Membership");
    expect(content).not.toContain("Amount:");
    expect(content).not.toContain("<a ");
  });
});
