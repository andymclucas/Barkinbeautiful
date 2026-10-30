/**
 * Whether an invoice may actually leave the building.
 *
 * Andy, 30/10/2026, minutes after the feature merged: "Do not send out
 * any invoices right now until confirmed all is working and correct."
 *
 * So the button ships, the confirmation box works, and the send is
 * held. The whole path can be walked and checked against real bookings
 * without a single client receiving anything.
 *
 * **This is enforced on the SERVER**, in `payments.emailInvoice`. A
 * disabled button is a hint, not a gate — the procedure is reachable by
 * anyone signed in, and a held send has to hold whatever the client
 * does. The button is disabled too, so staff see why rather than
 * pressing a thing that silently does nothing.
 *
 * Turning it on is a CODE change, deliberately — the same rule as the
 * automated-SMS allow-list in `shared/automatedSms.ts`. An env var can
 * be flipped by anyone with access to the Render dashboard, at a
 * moment when nobody is looking at whether the invoice is correct.
 * Flip this to `true`, in a commit, when Andy says the numbers check
 * out.
 */
export const INVOICE_EMAIL_ENABLED = false;

/** Shown to staff on the held button, and returned by the refused send. */
export const INVOICE_EMAIL_HELD_MESSAGE =
  "Invoice emails are on hold until the figures have been checked. Nothing has been sent.";
