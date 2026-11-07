import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SalonBillingCardView, type SalonBillingStatus } from "./SalonBillingCard";

/**
 * The salon's own subscription card, in each state it actually reaches.
 *
 * Tested through the View rather than the card: the View takes plain
 * props with no tRPC and no context, which is the shape CLAUDE.md §7
 * blesses and the reason the component was split in two. The data half
 * is three mutations and a query; there is nothing in it a test would
 * learn that the procedures' own tests do not already cover.
 *
 * Two of these states are the ones that matter commercially and neither
 * is reachable by clicking today: nothing has a Stripe price configured,
 * so `purchasablePlans` is empty in production right now, and `past_due`
 * only happens when a real card fails.
 */
const base: SalonBillingStatus = {
  plan: "trial",
  status: "trialing",
  description: "Free trial — ends 14 November",
  hasAccess: true,
  billingSetUp: false,
  subscribed: false,
  purchasablePlans: [],
};

const view = (status: Partial<SalonBillingStatus>, isAdmin = true, props = {}) =>
  render(<SalonBillingCardView status={{ ...base, ...status }} isAdmin={isAdmin} {...props} />);

describe("the salon's subscription card", () => {
  it("leads with the plan and the sentence the server wrote", () => {
    view({});
    expect(screen.getByText("Trial")).toBeInTheDocument();
    expect(screen.getByText("Free trial — ends 14 November")).toBeInTheDocument();
  });

  /**
   * Today's real state. `purchasablePlans` is empty because no
   * STRIPE_PRICE_* id is set, and the backend filters unbuyable plans out
   * precisely so this screen can explain rather than show a button that
   * throws "no Stripe price configured".
   */
  it("explains itself rather than offering a plan nobody can buy", () => {
    view({ purchasablePlans: [] });
    expect(screen.getByText(/not open for self-service yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /choose/i })).not.toBeInTheDocument();
    // And it does not leak our own misconfiguration at a customer who
    // could not fix it anyway.
    expect(screen.queryByText(/STRIPE_PRICE/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/environment/i)).not.toBeInTheDocument();
  });

  it("offers each plan the server says is actually buyable", () => {
    view({ purchasablePlans: ["professional", "enterprise"] });
    expect(screen.getByText("Software + Messaging")).toBeInTheDocument();
    expect(screen.getByText("Complete, with Workflow")).toBeInTheDocument();
    expect(screen.getByText("2,500 client texts a month included")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /choose/i })).toHaveLength(2);
    // No invented figure anywhere — Stripe states the price at checkout.
    expect(screen.getByText(/Stripe shows you the price/i)).toBeInTheDocument();
  });

  it("passes the chosen plan back, not the first one on the list", () => {
    const onSubscribe = vi.fn();
    view({ purchasablePlans: ["professional", "enterprise"] }, true, { onSubscribe });
    screen.getAllByRole("button", { name: /choose/i })[1].click();
    expect(onSubscribe).toHaveBeenCalledWith("enterprise");
  });

  /**
   * A failed card must not read as the salon being shut off. They are
   * mid-service with real dogs in the building, and planEntitlements is
   * explicit that past_due keeps everything.
   */
  it("promises nothing has stopped when a payment has failed", () => {
    view({
      status: "past_due", plan: "enterprise", subscribed: true, billingSetUp: true,
      description: "Payment failed — update the card to keep the salon running",
    });
    expect(screen.getByText(/Nothing has been switched off/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /manage billing/i })).toBeInTheDocument();
  });

  it("says what survives a subscription that has ended", () => {
    view({ status: "cancelled", hasAccess: false, description: "Cancelled" });
    expect(screen.getByText(/still open the diary/i)).toBeInTheDocument();
    expect(screen.getByText(/that is yours either way/i)).toBeInTheDocument();
  });

  /**
   * startCheckout's own error says to use the portal to change an
   * existing subscription, so the offer list must not be there to click.
   */
  it("stops offering plans once one is running", () => {
    view({
      status: "active", plan: "enterprise", subscribed: true, billingSetUp: true,
      description: "Active — renews 1 December", purchasablePlans: ["enterprise"],
    });
    expect(screen.queryByRole("button", { name: /choose/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /manage billing/i })).toBeInTheDocument();
  });

  /**
   * `status` is protectedProcedure and the two money procedures are
   * adminProcedure, so an owner who is not an administrator can read the
   * bill and not act on it. Buttons that would throw are worse than none.
   */
  it("shows an owner the state without buttons that would fail", () => {
    view({ subscribed: true, billingSetUp: true, purchasablePlans: ["enterprise"] }, false);
    expect(screen.queryByRole("button", { name: /manage billing/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /choose/i })).not.toBeInTheDocument();
    expect(screen.getByText(/administrator has to make billing changes/i)).toBeInTheDocument();
  });

  /**
   * The one piece of copy carried over from the design proposal, whose
   * own note says salons confuse the two Stripe relationships
   * constantly. It belongs in every state, so it is asserted here rather
   * than in one of them.
   */
  it("always says this is not where the clients' money goes", () => {
    for (const status of [{}, { status: "active" as const, subscribed: true }, { hasAccess: false }]) {
      const { unmount } = view(status);
      expect(screen.getByText(/not where your clients’ money goes/i)).toBeInTheDocument();
      expect(screen.getByText(/land in your own bank/i)).toBeInTheDocument();
      unmount();
    }
  });
});
