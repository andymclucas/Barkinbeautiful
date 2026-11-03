import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { VipMark } from "./VipMark";
import { PaymentStamp } from "./PaymentStamp";
import { appointmentPaymentDisplay } from "@shared/appointmentPaymentDisplay";
import { VIP_GOLD } from "@shared/membershipMark";

describe("VipMark", () => {
  it("reads VIP", () => {
    render(<VipMark />);
    expect(screen.getByTestId("appt-vip-mark")).toHaveTextContent("VIP");
  });

  /*
   * A disc, not an oval. It sits in a row beside a truncating dog name
   * on a card that gets as narrow as 47px, so it has to refuse to
   * shrink — an ellipse reads as damage rather than as a badge, which
   * is exactly what happened to the Christmas garland bulbs.
   */
  it("is round and refuses to be squashed", () => {
    render(<VipMark />);
    const mark = screen.getByTestId("appt-vip-mark");
    expect(mark.style.width).toBe(mark.style.height);
    expect(mark.className).toContain("rounded-full");
    expect(mark.className).toContain("shrink-0");
  });

  it("is gold, from the shared palette rather than a literal here", () => {
    render(<VipMark />);
    const mark = screen.getByTestId("appt-vip-mark");
    /* jsdom rewrites hex to rgb() inside a gradient, so compare like
       with like rather than pinning whichever form it happens to use. */
    const rgb = (hex: string) =>
      `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
    expect(mark.style.background).toContain(rgb(VIP_GOLD.fill));
    expect(mark.style.color).toBe(rgb(VIP_GOLD.ink));
    expect(mark.style.borderColor).toBe(rgb(VIP_GOLD.edge));
  });

  /** Staff hover it before they learn it; screen readers need it always. */
  it("says what it means without being hovered", () => {
    render(<VipMark />);
    expect(screen.getByLabelText("On a weekly membership")).toBeInTheDocument();
  });

  /*
   * Andy, 04/11/2026, asked for a circular icon "for all membership
   * clients". The whole reason it is a disc rather than a MEMBER chip
   * is that it can share the row with the payment stamp — so a
   * membership dog that paid for extras shows both, which the previous
   * mutually-exclusive version could not.
   */
  it("sits alongside a payment stamp rather than replacing it", () => {
    render(
      <div>
        <PaymentStamp pay={appointmentPaymentDisplay("paid")} />
        <VipMark />
      </div>,
    );
    expect(screen.getByTestId("appt-payment-paid")).toBeInTheDocument();
    expect(screen.getByTestId("appt-vip-mark")).toBeInTheDocument();
  });
});
