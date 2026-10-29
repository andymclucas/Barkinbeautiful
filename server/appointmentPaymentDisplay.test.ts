import { describe, it, expect } from "vitest";
import { appointmentPaymentDisplay } from "../shared/appointmentPaymentDisplay";

describe("appointmentPaymentDisplay", () => {
  it("turns a settled appointment green and stamps it", () => {
    const d = appointmentPaymentDisplay("paid");
    expect(d.recolour).toBe(true);
    expect(d.label).toBe("PAID");
    expect(d.background).toContain("#d1fae5");
  });

  /** Money still owed must not read as money collected. */
  it("gives part paid its own colour, not a shade of paid", () => {
    const partial = appointmentPaymentDisplay("partial");
    const paid = appointmentPaymentDisplay("paid");
    expect(partial.recolour).toBe(true);
    expect(partial.label).toBe("PART PAID");
    expect(partial.background).not.toBe(paid.background);
    expect(partial.accent).not.toBe(paid.accent);
  });

  /**
   * The service colour is what makes a day readable while booking it.
   * Unpaid is the ordinary state, so repainting those boxes would cost
   * the coding and gain nothing.
   */
  it("leaves an unsettled appointment its service colour", () => {
    for (const status of ["unpaid", null, undefined] as const) {
      const d = appointmentPaymentDisplay(status);
      expect(d.recolour, String(status)).toBe(false);
      expect(d.background, String(status)).toBeNull();
      expect(d.label, String(status)).toBeNull();
    }
  });

  /** Nobody is chasing payment on a dog that did not come. */
  it("lets a cancelled booking keep its own treatment", () => {
    expect(appointmentPaymentDisplay("paid", { isCancelled: true }).recolour).toBe(false);
    expect(appointmentPaymentDisplay("partial", { isCancelled: true }).label).toBeNull();
  });

  it("never returns a label without a colour to draw it in", () => {
    for (const status of ["unpaid", "partial", "paid", null] as const) {
      const d = appointmentPaymentDisplay(status);
      if (d.label !== null) {
        expect(d.accent, String(status)).not.toBeNull();
        expect(d.background, String(status)).not.toBeNull();
      }
    }
  });
});
