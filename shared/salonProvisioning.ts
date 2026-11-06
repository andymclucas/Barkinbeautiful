/**
 * Setting up a new salon.
 *
 * The Pet Pad opens 23/11/2026 as Groomigo's first paying salon. Creating
 * the tenant is the easy half — salonSignup already does it, and gives the
 * new salon a row, an owner, a staff record and a trial.
 *
 * What it does NOT give is anything a salon cannot open without. Measured
 * against Barkin' Beautiful: 60 pricing services, 111 pet codes, 71 retail
 * products, 51 membership plans. A brand-new salon has none of them, so it
 * opens with no prices, no service list and no way to bill a groom.
 *
 * ## Copying is a choice, stated out loud
 *
 * Pet Pad is a different business and will not charge Barkin' Beautiful's
 * prices. But typing sixty services by hand on the morning you open is how
 * a salon gives up on the software, so a copy is a reasonable STARTING
 * POINT that somebody then edits.
 *
 * Which catalogues to copy is a business decision, not an engineering one,
 * so nothing is copied by default and each one is named explicitly.
 *
 * ## What may never be copied, and why that is the point of this file
 *
 * Everything here is a CATALOGUE: a list the salon maintains about its own
 * services and vocabulary. None of it is about a person.
 *
 * Clients, pets, appointments, invoices, messages, memberships and
 * payments are another salon's records, and copying one row of any of them
 * between tenants is a data breach — the one failure in this feature that
 * could not be undone by editing a price afterwards. The allow-list is
 * closed, the server reads only from it, and a test asserts that every
 * table naming a person stays out.
 */

/** The catalogues a new salon may be seeded from an existing one. */
export const COPYABLE_CATALOGUES = [
  "pricing",
  "petCodes",
  "retail",
  "membershipPlans",
] as const;

export type CopyableCatalogue = (typeof COPYABLE_CATALOGUES)[number];

/** What each one is, for the person choosing. */
export const CATALOGUE_LABELS: Readonly<Record<CopyableCatalogue, string>> = {
  pricing: "Services and prices",
  petCodes: "Grooming codes and shorthand",
  retail: "Retail products",
  membershipPlans: "Membership plans",
};

/**
 * The database table behind each, and the ONLY tables this feature reads.
 *
 * Kept as data rather than written into the copier, so the allow-list can
 * be asserted whole. A copier that took a table name as an argument would
 * be one typo away from copying clients.
 */
export const CATALOGUE_TABLES: Readonly<Record<CopyableCatalogue, string>> = {
  pricing: "pricing_services",
  petCodes: "pet_codes",
  retail: "retail_products",
  membershipPlans: "membership_plans",
};

/**
 * Tables that must never be copied between salons.
 *
 * Not used by the copier — it reads only CATALOGUE_TABLES. This list
 * exists so the test can state the rule in the terms somebody would
 * actually get wrong, rather than only asserting the positive.
 */
export const NEVER_COPY_TABLES: readonly string[] = [
  // People, and everything about them.
  "clients", "pets", "client_contacts", "client_notes", "pet_photos",
  "pet_paperwork", "pet_weights", "client_portal_access", "portal_threads",
  "portal_messages",
  // What happened, and what was said.
  "appointments", "workflow_logs", "grooming_reports", "groom_style_notes",
  "sms_logs", "missed_calls", "missed_call_auto_texts",
  // Money.
  "invoices", "invoice_lines", "appointment_payments", "memberships",
  "membership_payments", "membership_ledger_entries", "store_credit_transactions",
  "stripe_events", "groom_quotes", "groom_quote_lines",
  // Staff are people too, and a salon hires its own.
  "staff", "users", "staff_invitations", "salon_access",
];

export type ProvisionChoice = {
  /** Which existing salon to copy from. Null copies nothing. */
  copyFromTenantId: number | null;
  catalogues: readonly CopyableCatalogue[];
};

export function isCopyableCatalogue(value: unknown): value is CopyableCatalogue {
  return typeof value === "string"
    && (COPYABLE_CATALOGUES as readonly string[]).includes(value);
}

/**
 * The catalogues actually to be copied, given a choice.
 *
 * Returns [] when there is no source, so "copy these four" with nobody to
 * copy from is a no-op rather than an error — the salon is still created,
 * which is the part that matters.
 */
export function cataloguesToCopy(choice: ProvisionChoice): CopyableCatalogue[] {
  if (choice.copyFromTenantId === null) return [];
  return [...new Set(choice.catalogues.filter(isCopyableCatalogue))];
}

/** One line for the confirmation, before anything is written. */
export function describeProvisionPlan(input: {
  salonName: string;
  copyFromName: string | null;
  catalogues: readonly CopyableCatalogue[];
}): string {
  const copying = input.catalogues.filter(isCopyableCatalogue);
  if (!input.copyFromName || copying.length === 0) {
    return `Create ${input.salonName} with an empty catalogue.`;
  }
  const names = copying.map((c) => CATALOGUE_LABELS[c].toLowerCase());
  const list = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Create ${input.salonName}, copying ${list} from ${input.copyFromName}. No clients, pets or bookings are copied.`;
}
