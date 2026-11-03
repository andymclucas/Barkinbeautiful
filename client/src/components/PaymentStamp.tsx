/**
 * The PAID / PART PAID / MEMBER stamp on an appointment card.
 *
 * One component rather than the same six lines in every renderer that
 * draws a card. The day grid and the week agenda are separate pieces of
 * JSX that happen to draw the same thing, and the week one went live
 * without any payment stamp at all until Andy asked for it on
 * 04/11/2026 — a dog read as settled on the day board and as owing on
 * the week board, from the same data.
 *
 * This app has been bitten by that shape before at a larger size: a
 * rule copied to three call sites, changed at one, with the test still
 * matching the other two.
 *
 * What to stamp is decided by `appointmentPaymentDisplay` in shared/,
 * which is where the rule and its reasoning live. This file is only the
 * pixels.
 */
import type { PaymentDisplay } from "@shared/appointmentPaymentDisplay";

export function PaymentStamp({ pay }: { pay: PaymentDisplay }) {
  /* Nothing to say is the common case — an ordinary unpaid booking —
     so the guard lives here rather than at each call site. */
  if (!pay.label) return null;
  return (
    <div
      data-testid={`appt-payment-${pay.key}`}
      /* No margin of its own: it shares a row with the VIP disc, and
         the row owns the spacing. */
      className="inline-flex rounded-sm border bg-white/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]"
      style={{ color: pay.accent ?? undefined, borderColor: pay.accent ?? undefined }}
    >
      {pay.label}
    </div>
  );
}

export default PaymentStamp;
