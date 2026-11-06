/**
 * Creating a salon for somebody who already has an account.
 *
 * The Pet Pad opens 23/11/2026, and Lauren owns it as well as Barkin'
 * Beautiful. She has a login already, so this deliberately does NOT make a
 * second one: it creates the salon, puts her in it, and grants her access
 * so the switcher has somewhere to switch to.
 *
 * The public signup at routers/salonSignup.ts still handles a brand-new
 * owner with a verified email and a password of their own. Duplicating
 * that here would mean a second copy of the email-verification and
 * password rules, which is the kind of duplication that drifts into a
 * security difference.
 *
 * ## The catalogue is the real work
 *
 * Creating the tenant row is trivial. What a new salon has none of is
 * anything it cannot open without — measured against Barkin' Beautiful,
 * 60 pricing services, 111 pet codes, 71 retail products, 51 membership
 * plans. A salon with an empty price list cannot bill a groom.
 *
 * So catalogues can be copied from an existing salon as a starting point.
 * Which ones is named explicitly every time and defaults to none, because
 * The Pet Pad is a different business and will not charge Barkin'
 * Beautiful's prices — a copy is somewhere to start editing, not an
 * answer.
 *
 * ## It cannot copy anything about a person
 *
 * The tables it may read are a closed set, keyed by a union type, so
 * there is no string a caller could pass that would reach another table.
 * Clients, pets, bookings, invoices and messages are another salon's
 * records, and one row of any of them crossing tenants is the one mistake
 * here that could not be undone by editing a price afterwards. See
 * shared/salonProvisioning.ts and its tests.
 *
 * All four catalogue tables reference only tenants.id — checked, not
 * assumed — so a copied row is self-contained and cannot point back at
 * the salon it came from.
 */
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import {
  membershipPlans, petCodes, pricingServices, retailProducts,
  salonAccess, staff, tenants,
} from "../drizzle/schema";
import { slugifySalonName, nextFreeSlug } from "@shared/salonSignup";
import {
  cataloguesToCopy, type CopyableCatalogue, type ProvisionChoice,
} from "@shared/salonProvisioning";

/**
 * The only tables this file may read from another salon.
 *
 * A Record keyed by the union, so TypeScript requires every catalogue to
 * have one and refuses any key that is not a catalogue. That is stronger
 * than a lookup by name: there is no string a caller could pass that
 * reaches `clients`.
 */
const TABLE_FOR = {
  pricing: pricingServices,
  petCodes: petCodes,
  retail: retailProducts,
  membershipPlans: membershipPlans,
} as const satisfies Record<CopyableCatalogue, unknown>;

export type ProvisionResult = {
  tenantId: number;
  slug: string;
  copied: Record<string, number>;
};

/**
 * Copy one catalogue, stripping everything that belongs to the salon it
 * came from.
 *
 * `id` goes so the rows get their own, `tenantId` is replaced, and the
 * timestamps go so the new rows date from today rather than from whenever
 * the other salon set its prices.
 */
async function copyCatalogue(
  db: any,
  catalogue: CopyableCatalogue,
  fromTenantId: number,
  toTenantId: number,
): Promise<number> {
  const table = TABLE_FOR[catalogue] as any;
  const rows = await db.select().from(table).where(eq(table.tenantId, fromTenantId));
  if (rows.length === 0) return 0;

  const values = rows.map((row: Record<string, unknown>) => {
    const { id: _id, tenantId: _tenantId, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = row;
    return { ...rest, tenantId: toTenantId };
  });
  await db.insert(table).values(values);
  return values.length;
}

/**
 * Create a salon for an existing user and put them in it.
 *
 * Not wrapped in one transaction, because MySQL DDL is not transactional
 * here and these are separate inserts — the same reason salonSignup
 * removes its tenant by hand when the owner fails. A half-made salon with
 * no owner can never be signed into, so that is the failure worth undoing.
 */
export async function provisionSalon(input: {
  name: string;
  email?: string | null;
  phone?: string | null;
  timezone: string;
  /** Who owns it. Must already have an account. */
  ownerUserId: number;
  ownerName: string;
  choice: ProvisionChoice;
  grantedByUserId: number;
}): Promise<ProvisionResult> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const name = input.name.trim();
  if (!name) throw new Error("The salon needs a name");

  const base = slugifySalonName(name);
  const nearby = await db.select({ slug: tenants.slug }).from(tenants);
  const slug = nextFreeSlug(base, nearby.map((t: { slug: string }) => t.slug));

  const [created] = await db.insert(tenants).values({
    name,
    slug,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    timezone: input.timezone,
    /*
     * Starts on a trial like any other salon, NOT active. Billing is a
     * separate decision made on the billing page, and a salon marked
     * active with no Stripe subscription behind it would read as paying
     * while collecting nothing.
     */
    subscriptionPlan: "trial",
    subscriptionStatus: "trialing",
    onlineBookingEnabled: false,
  });
  const tenantId = Number((created as { insertId?: number } | undefined)?.insertId ?? 0);
  if (!tenantId) throw new Error("Could not create the salon");

  try {
    /*
     * A staff record in the new salon.
     *
     * Without it the owner has no presence on its calendar or workflow
     * board, and the tenant resolution that falls back to a staff row has
     * nothing to fall back to — the same reason salonSignup creates one.
     */
    await db.insert(staff).values({
      tenantId,
      userId: input.ownerUserId,
      name: input.ownerName.trim(),
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      role: "owner",
      portalStatus: "approved",
      colourHex: "#6D45D6",
    });

    /*
     * And the grant that makes the switcher work. users.tenant_id still
     * names their original salon; this is what says they may act in a
     * second one.
     */
    await db.insert(salonAccess).values({
      userId: input.ownerUserId,
      tenantId,
      grantedByUserId: input.grantedByUserId,
    });

    const copied: Record<string, number> = {};
    const toCopy = cataloguesToCopy(input.choice);
    for (const catalogue of toCopy) {
      copied[catalogue] = await copyCatalogue(
        db, catalogue, input.choice.copyFromTenantId!, tenantId,
      );
    }

    console.log(
      `[provision] salon ${tenantId} "${name}" at ${slug}, owner user ${input.ownerUserId}`
      + (toCopy.length ? `, copied ${toCopy.map((c) => `${c}=${copied[c]}`).join(" ")}` : ", empty catalogue"),
    );
    return { tenantId, slug, copied };
  } catch (error) {
    // A salon nobody can reach would sit there holding its slug.
    await db.delete(salonAccess).where(eq(salonAccess.tenantId, tenantId)).catch(() => {});
    await db.delete(staff).where(eq(staff.tenantId, tenantId)).catch(() => {});
    await db.delete(tenants).where(eq(tenants.id, tenantId)).catch(() => {});
    throw error;
  }
}
