/**
 * Whether an appointment reads as paid at a glance on the calendar.
 *
 * Lauren, 30/10/2026: "When a person is invoiced. In the appointment
 * screen it's really hard to see when it's all squished together. Can
 * the box change colour completely? Cause I can't see unless I go
 * through each appointment on the day to see if it's invoiced."
 *
 * The calendar box is coloured by SERVICE, which is what makes a day
 * readable while booking it — so this does not repaint everything.
 * Only a settled appointment changes: an unpaid one keeps its service
 * colour, because unpaid is the ordinary state and tinting all of them
 * would destroy the coding she plans the day with. In practice that
 * means past days turn green as they settle and upcoming days stay
 * service-coloured, which is the distinction she is looking for.
 *
 * Part-paid is deliberately its own colour rather than a shade of
 * paid. A half-collected groom is money still owed, and reading it as
 * done is the expensive mistake.
 *
 * A membership groom is the fourth case and the odd one out: it is
 * never going to be paid, because the weekly payment already covered
 * it. It gets a stamp but NOT a recolour — see the branch below for
 * why that distinction is load-bearing.
 *
 * Order matters. Money first, plan second: an appointment is tested
 * for paid and part-paid BEFORE membership, so a membership client who
 * owes for extras done on the day still reads as owing.
 */

export type AppointmentPaymentStatus = "unpaid" | "partial" | "paid" | null | undefined;

export type PaymentDisplay = {
  /** Whether to override the service colour at all. */
  recolour: boolean;
  key: "paid" | "partial" | "unpaid" | "member";
  /** Short stamp for the box. Null when nothing should be stamped. */
  label: string | null;
  /** Box background, as a CSS gradient. Null means keep the service colour. */
  background: string | null;
  /** Colour for the stamp text and border. */
  accent: string | null;
};

const NOTHING: PaymentDisplay = { recolour: false, key: "unpaid", label: null, background: null, accent: null };

export function appointmentPaymentDisplay(
  paymentStatus: AppointmentPaymentStatus,
  opts: { isCancelled?: boolean; onMembership?: boolean } = {},
): PaymentDisplay {
  /* A cancelled booking already owns the whole box, and nobody is
     chasing payment on a dog that did not come. Cancelled wins. */
  if (opts.isCancelled) return NOTHING;

  if (paymentStatus === "paid") {
    return {
      recolour: true,
      key: "paid",
      label: "PAID",
      background: "linear-gradient(135deg, #d1fae5 0%, #ffffff 180%)",
      accent: "#047857",
    };
  }

  if (paymentStatus === "partial") {
    return {
      recolour: true,
      key: "partial",
      label: "PART PAID",
      background: "linear-gradient(135deg, #fef3c7 0%, #ffffff 180%)",
      accent: "#b45309",
    };
  }

  /*
   * On a membership, and nothing collected against it.
   *
   * Lauren, 03/11/2026: "after you invoice the dogs the colour changes
   * ... well membership dogs you can't complete the invoice if it's
   * $0. It doesn't change colour. Will they have an easy way to tell
   * if they are on a membership from the appointment view."
   *
   * She is right, and the reason is mechanical. paymentStatus is
   * DERIVED by refreshPaymentStatus, which only runs when somebody
   * records a payment. A membership groom is $0, so nobody ever opens
   * the payment panel, so it is never derived and the column stays
   * null for ever. The dog sits in the "not settled" pile on the board
   * permanently, and the only way to find out otherwise is to open it
   * — which is the exact complaint that produced the PAID stamp.
   *
   * Deliberately NOT green, and deliberately no `background`.
   *
   * Green and a recoloured box mean "the money arrived". Here no money
   * is going to arrive, which is a different fact, and the salon bills
   * extras done on the day to membership clients — so a membership dog
   * CAN still owe for a nail trim. Painting it as paid would hide that.
   * The stamp says what is true, the box keeps its service colour, and
   * a membership dog that genuinely owes for extras still shows PART
   * PAID or PAID above, because those two are tested first.
   */
  if (opts.onMembership) {
    return {
      recolour: false,
      key: "member",
      label: "MEMBER",
      background: null,
      accent: "#6d28d9",
    };
  }

  /* unpaid, and null — which is every appointment that has never had
     an invoice line. Both are "not settled", and neither should take
     the service colour away. */
  return NOTHING;
}
