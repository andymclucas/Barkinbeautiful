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
 */

export type AppointmentPaymentStatus = "unpaid" | "partial" | "paid" | null | undefined;

export type PaymentDisplay = {
  /** Whether to override the service colour at all. */
  recolour: boolean;
  key: "paid" | "partial" | "unpaid";
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
  opts: { isCancelled?: boolean } = {},
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

  /* unpaid, and null — which is every appointment that has never had
     an invoice line. Both are "not settled", and neither should take
     the service colour away. */
  return NOTHING;
}
