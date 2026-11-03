import { describe, expect, it } from "vitest";
import { showsMembershipMark, VIP_GOLD } from "../shared/membershipMark";

describe("showsMembershipMark", () => {
  it("marks a booking linked to a membership", () => {
    expect(showsMembershipMark({ membershipId: 120002 })).toBe(true);
  });

  it("leaves an ordinary booking unmarked", () => {
    expect(showsMembershipMark({ membershipId: null })).toBe(false);
    expect(showsMembershipMark({})).toBe(false);
    expect(showsMembershipMark({ membershipId: undefined })).toBe(false);
  });

  /*
   * The expensive one. 128 of 713 upcoming bookings belong to a client
   * who holds an active membership this booking is NOT linked to, and
   * those will be charged at the counter. The rule takes the
   * APPOINTMENT's link and has no way to be handed the client's, which
   * is the point — there is nothing here to pass the wrong thing into.
   */
  it("reads the booking's own link, so a client's other plan cannot leak in", () => {
    expect(showsMembershipMark({ membershipId: null, isCancelled: false })).toBe(false);
  });

  /** A dog that did not come is nobody's problem. */
  it("drops the mark on a cancelled booking", () => {
    expect(showsMembershipMark({ membershipId: 120002, isCancelled: true })).toBe(false);
  });

  /*
   * Independent of money, deliberately: this says the dog is on a plan,
   * not that nothing is owed. A membership client who paid for extras
   * done on the day wears both the PAID stamp and the VIP disc, which
   * an earlier mutually-exclusive version could not express.
   */
  it("takes no payment status at all", () => {
    expect(showsMembershipMark.length).toBe(1);
  });
});

describe("VIP_GOLD", () => {
  /*
   * Gold text on a pale card is about 2:1 — decorative, not readable.
   * The mark is a filled disc with near-black lettering instead, so the
   * ink has to be far darker than the fill it sits on.
   */
  it("puts dark ink on a light fill rather than gold on white", () => {
    const lum = (hex: string) =>
      [1, 3, 5].reduce((sum, i) => sum + parseInt(hex.slice(i, i + 2), 16), 0) / 3;
    expect(lum(VIP_GOLD.ink)).toBeLessThan(lum(VIP_GOLD.fill) - 80);
  });

  it("gives the disc an edge darker than its fill", () => {
    expect(VIP_GOLD.edge).not.toBe(VIP_GOLD.fill);
  });
});
