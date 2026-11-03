import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PaymentStamp } from "./PaymentStamp";
import { appointmentPaymentDisplay } from "@shared/appointmentPaymentDisplay";

/**
 * Driven through the real rule rather than hand-built props, so a
 * change to what the rule decides shows up here as a change to what
 * the card draws — which is the whole relationship worth testing.
 */
describe("PaymentStamp", () => {
  it("draws nothing for an ordinary unpaid booking", () => {
    const { container } = render(<PaymentStamp pay={appointmentPaymentDisplay("unpaid")} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("draws nothing for a cancelled booking, whatever it owes", () => {
    const { container } = render(
      <PaymentStamp pay={appointmentPaymentDisplay("partial", { isCancelled: true })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("stamps a settled booking PAID", () => {
    render(<PaymentStamp pay={appointmentPaymentDisplay("paid")} />);
    expect(screen.getByText("PAID")).toBeInTheDocument();
    expect(screen.getByTestId("appt-payment-paid")).toBeInTheDocument();
  });

  it("stamps a part-paid booking as money still owed", () => {
    render(<PaymentStamp pay={appointmentPaymentDisplay("partial")} />);
    expect(screen.getByText("PART PAID")).toBeInTheDocument();
  });

  it("stamps a membership groom MEMBER", () => {
    render(<PaymentStamp pay={appointmentPaymentDisplay(null, { onMembership: true })} />);
    expect(screen.getByText("MEMBER")).toBeInTheDocument();
    expect(screen.getByTestId("appt-payment-member")).toBeInTheDocument();
  });

  /*
   * The stamp is drawn in the accent colour and nothing else carries
   * it, so a null accent would be invisible text on a white chip. The
   * rule promises an accent whenever it gives a label; this is the
   * drawing half of that promise.
   */
  it("paints the stamp in the rule's accent colour", () => {
    render(<PaymentStamp pay={appointmentPaymentDisplay(null, { onMembership: true })} />);
    const stamp = screen.getByTestId("appt-payment-member");
    expect(stamp.style.color).not.toBe("");
    expect(stamp.style.borderColor).toBe(stamp.style.color);
  });

  /*
   * Lauren, 03/11/2026, is the reason MEMBER exists at all, and the
   * reason it must not look like PAID: green means the money arrived
   * and on a membership none is going to.
   */
  it("gives MEMBER a different colour from PAID", () => {
    const { rerender } = render(
      <PaymentStamp pay={appointmentPaymentDisplay(null, { onMembership: true })} />,
    );
    const member = screen.getByTestId("appt-payment-member").style.color;
    rerender(<PaymentStamp pay={appointmentPaymentDisplay("paid")} />);
    expect(screen.getByTestId("appt-payment-paid").style.color).not.toBe(member);
  });
});
