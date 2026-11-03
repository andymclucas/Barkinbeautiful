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

  /*
   * The stamp is drawn in the accent colour and nothing else carries
   * it, so a null accent would be invisible text on a white chip. The
   * rule promises an accent whenever it gives a label; this is the
   * drawing half of that promise.
   */
  it("paints the stamp in the rule's accent colour", () => {
    render(<PaymentStamp pay={appointmentPaymentDisplay("partial")} />);
    const stamp = screen.getByTestId("appt-payment-partial");
    expect(stamp.style.color).not.toBe("");
    expect(stamp.style.borderColor).toBe(stamp.style.color);
  });
});
