import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/*
 * The banner reads one tRPC query. There is no shared tRPC test provider
 * yet (CLAUDE.md §7), so the one hook it calls is mocked here.
 */
const paymentMethod = vi.fn();
vi.mock("@/lib/trpc", () => ({
  trpc: { clientPortal: { getMyPaymentMethod: { useQuery: (...args: unknown[]) => paymentMethod(...args) } } },
}));

const { PortalCardNeededBanner } = await import("./ClientPortal");

describe("PortalCardNeededBanner", () => {
  beforeEach(() => paymentMethod.mockReset());

  it("asks a client with no card to add one, in red at the top", () => {
    paymentMethod.mockReturnValue({ data: { hasCard: false, expired: false } });
    render(<PortalCardNeededBanner />);
    expect(screen.getByRole("alert")).toHaveTextContent("Please add your card details");
    expect(screen.getByRole("link", { name: /Add my card/ })).toHaveAttribute("href", "#payment-details");
  });

  it("asks for a new card when the saved one has expired", () => {
    paymentMethod.mockReturnValue({ data: { hasCard: true, expired: true } });
    render(<PortalCardNeededBanner />);
    expect(screen.getByRole("alert")).toHaveTextContent("Your card has expired");
  });

  it("shows staff on a preview what a client with no card sees", () => {
    paymentMethod.mockReturnValue({ data: undefined });
    render(<PortalCardNeededBanner readOnly previewCard={{ hasCard: false, expired: false }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Please add your card details");
  });

  it("says nothing once a good card is saved, while loading, or on a preview without card state", () => {
    paymentMethod.mockReturnValue({ data: { hasCard: true, expired: false } });
    const { container, rerender } = render(<PortalCardNeededBanner />);
    expect(container).toBeEmptyDOMElement();
    paymentMethod.mockReturnValue({ data: undefined });
    rerender(<PortalCardNeededBanner />);
    expect(container).toBeEmptyDOMElement();
    paymentMethod.mockReturnValue({ data: { hasCard: false, expired: false } });
    rerender(<PortalCardNeededBanner readOnly />);
    expect(container).toBeEmptyDOMElement();
  });
});
