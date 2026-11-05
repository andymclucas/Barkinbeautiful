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
import { and, eq } from "drizzle-orm";
import { groomQuoteLines, groomQuotes, pets } from "../drizzle/schema";
import { quoteLineDescription } from "@shared/groomQuote";

export type ApprovedQuoteExtra = {
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
      petName: pets.name,
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
    .leftJoin(pets, eq(pets.id, groomQuotes.petId))
    .where(
      and(
        eq(groomQuotes.tenantId, tenantId),
        eq(groomQuotes.appointmentId, appointmentId),
        eq(groomQuotes.status, "approved"),
      ),
    );

  return rows.map((r: { description: string; amount: string; petName: string | null }) => ({
    // Named on the invoice the way the owner will recognise it weeks later:
    // the dog, what was done, and that they agreed to it on the day.
    description: quoteLineDescription(r.petName, r.description),
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
