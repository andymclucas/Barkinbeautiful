/**
 * What an appointment's approved quotes add to its invoice.
 *
 * One loader, used by all three invoice paths — completion, "Create Bills",
 * and the combined family invoice — for the same reason buildInvoiceLines
 * is shared: a bill raised by hand and one raised on completion must not be
 * able to differ. The add-on loader next to it proved that the hard way.
 *
 * ## Only "approved", and only still-approved
 *
 * A quote bills in exactly one state. Nothing here falls back to "sent" or
 * treats silence as a yes, because an owner who did not answer did not
 * agree — see rule 2 in shared/groomQuote.ts.
 *
 * Expiry is applied at READ time rather than trusted from the column. A
 * quote sent at 9am and never answered is still `sent` in the database
 * until something looks at it, so a loader that filtered on status alone
 * would be correct only as often as the sweeper had run. Filtering to
 * `approved` makes that moot for billing — an expired quote was never
 * approved — but the rule is stated here because the obvious "optimisation"
 * later is to widen this query, and that is the one change that would start
 * billing for work nobody agreed to.
 */
import { and, eq, inArray } from "drizzle-orm";
import { groomQuoteLines, groomQuotes } from "../drizzle/schema";

export type ApprovedQuoteExtra = {
  /**
   * RAW, as the groomer typed it — "De-matting", not "Link — De-matting
   * (agreed on the day)".
   *
   * buildInvoiceLines applies quoteLineDescription itself, and it has the
   * pet name to do it with. Formatting here as well produced
   * "Link — Link — De-matting (agreed on the day) (agreed on the day)" on
   * the invoice: both halves individually correct, each unaware of the
   * other. Invoice presentation belongs to the invoice builder.
   */
  description: string;
  amount: string;
};

/**
 * The agreed extras on one appointment, ready for buildInvoiceLines.
 *
 * Returns [] when there are none, so every call site can pass the result
 * straight through without a conditional — a membership dog with no quotes
 * behaves exactly as it did before this feature existed.
 */
export async function loadApprovedQuoteExtras(
  db: any,
  tenantId: number,
  appointmentId: number,
): Promise<ApprovedQuoteExtra[]> {
  const rows = await db
    .select({
      description: groomQuoteLines.description,
      amount: groomQuoteLines.amount,
    })
    .from(groomQuotes)
    .innerJoin(
      groomQuoteLines,
      and(
        eq(groomQuoteLines.quoteId, groomQuotes.id),
        // The lines carry their own tenant_id and it is indexed with the
        // quote id, so joining on both uses the index and cannot reach a
        // line belonging to another salon even if an id ever collided.
        eq(groomQuoteLines.tenantId, groomQuotes.tenantId),
      ),
    )
    .where(
      and(
        eq(groomQuotes.tenantId, tenantId),
        eq(groomQuotes.appointmentId, appointmentId),
        eq(groomQuotes.status, "approved"),
      ),
    );

  return rows.map((r: { description: string; amount: string }) => ({
    description: r.description,
    amount: String(r.amount),
  }));
}

/**
 * The same figures as one dollar amount, for decideAppointmentInvoice.
 *
 * It needs a total and not the lines because it answers a different
 * question — whether there is anything to bill at all. A membership dog
 * whose groom is covered and who had no add-ons raises no invoice unless
 * something here says otherwise, which is how an agreed de-matt would
 * otherwise be given away in silence.
 */
export function approvedQuoteExtrasTotal(extras: readonly ApprovedQuoteExtra[]): string {
  let cents = 0;
  for (const extra of extras) {
    const n = Number(extra.amount);
    if (Number.isFinite(n)) cents += Math.round(n * 100);
  }
  return (cents / 100).toFixed(2);
}

export type ApprovedQuoteExtraForAppointment = ApprovedQuoteExtra & { appointmentId: number };

/**
 * The agreed extras across several appointments at once, for the payment
 * panel and everything that settles up at the counter.
 *
 * Scoped by appointment id rather than tenant, matching the add-on query
 * beside it in loadBillableTotals: the caller has already resolved which
 * appointments it may see, and appointment ids are unique across salons.
 *
 * This exists because wiring quotes into the three INVOICE builders alone
 * left the counter asking for the old figure. The invoice said $205, the
 * panel said $145 owing, recording $205 was refused as "more than the
 * outstanding", and the booking went out stamped paid in full with the
 * agreed $60 stranded on a draft invoice nobody chases.
 */
export async function loadApprovedQuoteExtrasForAppointments(
  db: any,
  appointmentIds: number[],
): Promise<ApprovedQuoteExtraForAppointment[]> {
  if (appointmentIds.length === 0) return [];
  const rows = await db
    .select({
      appointmentId: groomQuotes.appointmentId,
      description: groomQuoteLines.description,
      amount: groomQuoteLines.amount,
    })
    .from(groomQuotes)
    .innerJoin(
      groomQuoteLines,
      and(
        eq(groomQuoteLines.quoteId, groomQuotes.id),
        eq(groomQuoteLines.tenantId, groomQuotes.tenantId),
      ),
    )
    .where(and(
      inArray(groomQuotes.appointmentId, appointmentIds),
      eq(groomQuotes.status, "approved"),
    ));
  return rows.map((r: ApprovedQuoteExtraForAppointment) => ({
    appointmentId: r.appointmentId,
    description: r.description,
    amount: String(r.amount),
  }));
}
