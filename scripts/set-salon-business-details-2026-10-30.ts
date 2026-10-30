/**
 * Put the salon's real ABN and street address into its settings.
 *
 * Andy, 30/10/2026, approved both. They existed only inside the
 * service-agreement body text (server/seed/agreementBodies.ts), hardcoded,
 * while tenants.address read "Brisbane, QLD, Australia" — which is not an
 * address and cannot appear on a tax invoice.
 *
 *   corepack pnpm exec tsx scripts/set-salon-business-details-2026-10-30.ts          # dry run
 *   corepack pnpm exec tsx scripts/set-salon-business-details-2026-10-30.ts --apply
 *
 * Editable in Settings -> Business details from now on; this is just the
 * first fill so nobody has to retype what the agreement already knew.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb } from "../server/db";
import { tenants } from "../drizzle/schema";

const APPLY = process.argv.includes("--apply");
const TENANT_ID = 1;

/** Verbatim from server/seed/agreementBodies.ts:25. */
const DETAILS = {
  abn: "50 517 623 260",
  address: "Shop 2/11 Dan Street, Capalaba QLD 4157",
};

(async () => {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [before] = await db
    .select({
      id: tenants.id, name: tenants.name, abn: tenants.abn,
      address: tenants.address, phone: tenants.phone, email: tenants.email,
    })
    .from(tenants)
    .where(eq(tenants.id, TENANT_ID))
    .limit(1);
  if (!before) throw new Error(`No tenant ${TENANT_ID}`);

  console.log("before:", JSON.stringify(before, null, 2));
  console.log("\nwould set:");
  console.log("  abn     :", JSON.stringify(before.abn), "->", JSON.stringify(DETAILS.abn));
  console.log("  address :", JSON.stringify(before.address), "->", JSON.stringify(DETAILS.address));

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply.");
    return;
  }

  await db.update(tenants).set(DETAILS).where(eq(tenants.id, TENANT_ID));

  const [after] = await db
    .select({ abn: tenants.abn, address: tenants.address })
    .from(tenants)
    .where(eq(tenants.id, TENANT_ID))
    .limit(1);
  console.log("\nafter:", JSON.stringify(after, null, 2));
})().then(() => process.exit(0)).catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
