/**
 * Whether a client record can be deleted outright.
 *
 * Andy, 04/11/2026: "Add feature to be able to delete clients - just in
 * case there are duplicates etc."
 *
 * The salon has 10,113 client rows and 8,305 of them have never had an
 * appointment, an invoice, a payment or a membership — MoeGo import
 * noise and duplicates. Those are safe to remove. The rest are not, and
 * the difference matters more than the feature does.
 *
 * ## Why this refuses rather than cascades
 *
 * 25 tables carry a `client_id`, most of them `NOT NULL` foreign keys:
 * appointments, invoices, appointment_payments, memberships,
 * store_credit_transactions, sms_logs. A cascading delete would not
 * fail — it would succeed, and take the salon's financial history and
 * the record of what a real person was told by text with it.
 *
 * So anything that is history or money BLOCKS the delete and says so by
 * name. A duplicate that has taken a booking is a MERGE, which is a
 * different and larger job; the honest answer is to refuse and let a
 * person decide, not to guess.
 *
 * What does cascade is only what has no meaning without the client:
 * their contacts, their notes, and pets that have never been booked in.
 * Pets ARE kept separately when they have history — see petsWithHistory
 * — because a dog with grooms belongs to the same category as an
 * invoice.
 */

/** Every count that can stand in the way, named as staff would say it. */
export type ClientDeletionCounts = {
  appointments: number;
  invoices: number;
  payments: number;
  memberships: number;
  storeCreditEntries: number;
  packages: number;
  agreements: number;
  reviews: number;
  smsMessages: number;
  /** Dogs that have been booked in at least once. */
  petsWithHistory: number;
};

export type ClientDeletionCheck = {
  canDelete: boolean;
  /** Plain sentences, worst first, for a confirm dialog. */
  blockers: string[];
};

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * Ordered worst-first. A person reading a refusal should see the
 * expensive reason, not the alphabetically first one.
 */
const RULES: { key: keyof ClientDeletionCounts; describe: (n: number) => string }[] = [
  { key: "payments", describe: (n) => `${plural(n, "payment")} taken` },
  { key: "invoices", describe: (n) => `${plural(n, "invoice")}` },
  { key: "memberships", describe: (n) => `${plural(n, "membership")}` },
  { key: "storeCreditEntries", describe: (n) => `${plural(n, "store credit entry", "store credit entries")}` },
  { key: "appointments", describe: (n) => `${plural(n, "appointment")}` },
  { key: "petsWithHistory", describe: (n) => `${plural(n, "dog")} with grooming history` },
  { key: "packages", describe: (n) => `${plural(n, "package")}` },
  { key: "agreements", describe: (n) => `${plural(n, "signed agreement")}` },
  { key: "reviews", describe: (n) => `${plural(n, "review")}` },
  { key: "smsMessages", describe: (n) => `${plural(n, "text message")} on record` },
];

export function checkClientDeletion(counts: Partial<ClientDeletionCounts>): ClientDeletionCheck {
  const blockers: string[] = [];
  for (const rule of RULES) {
    const n = counts[rule.key] ?? 0;
    if (Number.isFinite(n) && n > 0) blockers.push(rule.describe(n));
  }
  return { canDelete: blockers.length === 0, blockers };
}

/** The sentence shown when a delete is refused. */
export function describeDeletionRefusal(name: string, blockers: readonly string[]): string {
  return `${name || "This client"} cannot be deleted — there is history attached: ${blockers.join(", ")}. `
    + "Deleting would take that with it. Mark them inactive instead, or merge the duplicate into the record you are keeping.";
}
