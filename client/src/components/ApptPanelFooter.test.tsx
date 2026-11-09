import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * The pinned total and Take payment on the appointment panel.
 *
 * Andy, 09/11/2026: "Show the total 'estimated price' in Groomigo when
 * an appt is clicked on and also the option to be able to 'Take
 * Payment' as the two default buttons."
 *
 * The component's only input is payments.forBooking, so the query is
 * mocked and the states that matter are driven directly. What is worth
 * pinning is which NUMBER leads — the counter asks for the amount
 * owing, not the total — and that a settled booking offers no way to
 * charge again.
 */
const useQuery = vi.fn();
vi.mock("@/lib/trpc", () => ({
  trpc: { payments: { forBooking: { useQuery: (...a: unknown[]) => useQuery(...a) } } },
}));

const { ApptPanelFooter } = await import("./ApptPanelFooter");

const show = (data: unknown, onTakePayment = () => {}) => {
  useQuery.mockReturnValue({ data });
  return render(<ApptPanelFooter appointmentId={1} onTakePayment={onTakePayment} />);
};

beforeEach(() => useQuery.mockReset());

describe("the appointment panel footer", () => {
  it("shows the estimated total before anything is paid", () => {
    show({ bookingTotal: "145.00", bookingPaid: "0", bookingOutstanding: "145.00" });
    expect(screen.getByText("Estimated total")).toBeInTheDocument();
    expect(screen.getByText("$145.00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /take payment/i })).toBeInTheDocument();
  });

  it("leads with what is still owing once part of it is paid", () => {
    // The only number anybody needs at that point. The total drops to
    // the line beneath rather than disappearing.
    show({ bookingTotal: "145.00", bookingPaid: "100.00", bookingOutstanding: "45.00" });
    expect(screen.getByText("Still owing")).toBeInTheDocument();
    expect(screen.getByText("$45.00")).toBeInTheDocument();
    expect(screen.getByText(/\$145\.00 total · \$100\.00 paid/)).toBeInTheDocument();
  });

  it("offers no way to charge a booking that is settled", () => {
    // Offering "Take payment" on a paid booking invites a second charge.
    show({ bookingTotal: "145.00", bookingPaid: "145.00", bookingOutstanding: "0" });
    expect(screen.getByText("Paid in full")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /take payment/i })).toBeNull();
  });

  it("says a covered groom has nothing to collect", () => {
    // A membership groom carries no price. Left bare, $0.00 reads as a
    // booking somebody forgot to price.
    show({ bookingTotal: "0", bookingPaid: "0", bookingOutstanding: "0" });
    expect(screen.getByText("Nothing to collect")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /take payment/i })).toBeNull();
  });

  it("shows nothing at all until the query answers", () => {
    // A $0.00 that becomes $145.00 a moment later is worse than a blank.
    const { container } = show(undefined);
    expect(container).toBeEmptyDOMElement();
  });

  it("hands the click back so the panel can scroll to the payment box", () => {
    const onTakePayment = vi.fn();
    show({ bookingTotal: "60.00", bookingPaid: "0", bookingOutstanding: "60.00" }, onTakePayment);
    return userEvent.setup({ delay: null })
      .click(screen.getByRole("button", { name: /take payment/i }))
      .then(() => expect(onTakePayment).toHaveBeenCalled());
  });

  /*
   * This asserted the OPPOSITE until 09/11/2026 — "stays pinned to the
   * bottom of the scrolling panel", expecting `sticky bottom-0`. That is
   * what produced the overlap Andy reported: a sticky child of a scroll
   * container is MEANT to have the content pass underneath it, so the
   * Payments card, the card-on-file box and the panel's own Take payment
   * button all slid under this bar on the way past, readable through a
   * translucent background.
   *
   * The pinning is now structural — Calendar.tsx makes the panel a flex
   * column and this bar is a sibling of the scrolling body, not a child
   * of it. So the bar must NOT reintroduce either.
   */
  it("is not sticky, so nothing can scroll underneath it", () => {
    const { container } = show({ bookingTotal: "60.00", bookingPaid: "0", bookingOutstanding: "60.00" });
    const cls = container.firstElementChild?.className ?? "";
    expect(cls).not.toContain("sticky");
    expect(cls).not.toContain("fixed");
    expect(cls).not.toContain("absolute");
  });

  it("is opaque, so nothing shows through it", () => {
    // bg-background, not bg-background/95 + backdrop-blur. The
    // translucency was half of why the overlap was so hard to read.
    const cls = show({ bookingTotal: "60.00", bookingPaid: "0", bookingOutstanding: "60.00" })
      .container.firstElementChild?.className ?? "";
    expect(cls).toContain("bg-background");
    expect(cls).not.toContain("bg-background/");
    expect(cls).not.toContain("backdrop-blur");
  });

  it("keeps its own height in a flex column", () => {
    // Without shrink-0 the column squeezes the bar to nothing when the
    // body is long, which is every booking with a payment panel.
    const cls = show({ bookingTotal: "60.00", bookingPaid: "0", bookingOutstanding: "60.00" })
      .container.firstElementChild?.className ?? "";
    expect(cls).toContain("shrink-0");
  });
});
