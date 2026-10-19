/**
 * When somebody actually became a client.
 *
 * The list showed `clients.created_at`, which for 10,075 of 10,101
 * clients is **3 August 2026** — the day the MoeGo data was merged, not
 * a fact about any of those people. A column where ten thousand rows
 * share one meaningless date is worse than no column: it looks like
 * information.
 *
 * Appointment history DID come across, back to July 2024, so for the
 * 1,787 clients who have ever been in, their first booking is a real
 * answer and 1,765 of those are earlier than the import date.
 *
 * ## Why only the first visit, and nothing inferred
 *
 * The obvious next step is "use created_at when it isn't the import
 * date". That needs the app to know each salon's import date, which is
 * a per-tenant fact nobody records, and guessing it from a date that
 * lots of rows share would quietly break for a salon that onboarded a
 * hundred clients in one afternoon.
 *
 * So this says only what the data supports: the first visit, or nothing.
 * A client with no appointments has not visited, and "—" is the honest
 * rendering of that. The date they were added is still shown on hover,
 * where its meaning can be spelled out.
 */

export type ClientSince =
  | { known: true; at: Date }
  | { known: false };

export function clientSince(firstVisit: Date | string | null | undefined): ClientSince {
  if (firstVisit === null || firstVisit === undefined || firstVisit === "") {
    return { known: false };
  }
  const at = firstVisit instanceof Date ? firstVisit : new Date(firstVisit);
  // An unparseable value is absence, not an "Invalid Date" in the column.
  if (!Number.isFinite(at.getTime())) return { known: false };
  return { known: true, at };
}

/**
 * What the hover text says, so the added date is not simply lost.
 *
 * It names BOTH, because "Added 3 Aug 2026" on its own invites the same
 * misreading the column had — the point is that the two are different
 * things and only one of them is about the client.
 */
export function describeClientSince(input: {
  firstVisit: Date | string | null | undefined;
  createdAt: Date | string | null | undefined;
  formatDate: (value: Date) => string;
}): string {
  const since = clientSince(input.firstVisit);
  const created = input.createdAt ? new Date(input.createdAt) : null;
  const addedPart = created && Number.isFinite(created.getTime())
    ? `Added to the system ${input.formatDate(created)}`
    : null;
  if (!since.known) {
    return addedPart
      ? `No visits on record. ${addedPart}.`
      : "No visits on record.";
  }
  const firstPart = `First visit ${input.formatDate(since.at)}`;
  return addedPart ? `${firstPart}. ${addedPart}.` : `${firstPart}.`;
}
