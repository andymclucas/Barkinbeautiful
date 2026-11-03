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

  /*
   * `accent` draws the stamp's text and border, so a label without one
   * is invisible. `background` is a different promise — it only has to
   * exist when the box is actually being recoloured, which MEMBER
   * deliberately does not do.
   */
  it("never returns a label without a colour to draw it in", () => {
    for (const status of ["unpaid", "partial", "paid", null] as const) {
      for (const onMembership of [false, true]) {
        const d = appointmentPaymentDisplay(status, { onMembership });
        const where = `${status} / member=${onMembership}`;
        if (d.label !== null) expect(d.accent, where).not.toBeNull();
        if (d.recolour) expect(d.background, where).not.toBeNull();
      }
    }
  });
});

/**
 * Lauren, 03/11/2026: "membership dogs you can't complete the invoice
 * if it's $0. It doesn't change colour. Will they have an easy way to
 * tell if they are on a membership from the appointment view."
 */
describe("appointmentPaymentDisplay, membership grooms", () => {
  it("stamps a membership groom that has nothing collected against it", () => {
    for (const status of ["unpaid", null, undefined] as const) {
      const d = appointmentPaymentDisplay(status, { onMembership: true });
      expect(d.label, String(status)).toBe("MEMBER");
      expect(d.key, String(status)).toBe("member");
      expect(d.accent, String(status)).not.toBeNull();
    }
  });

  /*
   * The whole point of the distinction. Green means money arrived; on a
   * membership none is going to. Painting the box as paid would also
   * hide extras done on the day, which this salon DOES bill.
   */
  it("does not repaint the box, so it cannot be read as paid", () => {
    const member = appointmentPaymentDisplay(null, { onMembership: true });
    const paid = appointmentPaymentDisplay("paid");
    expect(member.recolour).toBe(false);
    expect(member.background).toBeNull();
    expect(member.accent).not.toBe(paid.accent);
  });

  /*
   * Money first, plan second. A membership client who owes for a nail
   * trim done on the day must still read as owing — this is the case
   * that makes the ordering load-bearing rather than cosmetic.
   */
  it("lets money still owed win over the membership stamp", () => {
    const owing = appointmentPaymentDisplay("partial", { onMembership: true });
    expect(owing.label).toBe("PART PAID");
    expect(owing.key).toBe("partial");
    expect(owing.recolour).toBe(true);
  });

  it("lets money collected win over the membership stamp", () => {
    const settled = appointmentPaymentDisplay("paid", { onMembership: true });
    expect(settled.label).toBe("PAID");
    expect(settled.key).toBe("paid");
  });

  /** A dog that did not come is nobody's problem, membership or not. */
  it("still lets a cancelled booking keep its own treatment", () => {
    const d = appointmentPaymentDisplay(null, { onMembership: true, isCancelled: true });
    expect(d.label).toBeNull();
    expect(d.recolour).toBe(false);
  });

  /** Absent the flag, nothing changes for the 7,000 non-member grooms. */
  it("leaves a non-membership groom exactly as it was", () => {
    expect(appointmentPaymentDisplay(null, { onMembership: false }))
      .toEqual(appointmentPaymentDisplay(null));
  });
});
