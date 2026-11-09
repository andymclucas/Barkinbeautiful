/**
 * Teach the MoeGo sync one name.
 *
 * Andy, 09/11/2026: "Add the Charlotte Purcell alias and run the 760
 * importer."
 *
 * MoeGo calls her **Charlotte Purcell**. The salon's roster calls her
 * **Charlie Purcell** (staff 3). Nothing in Groomigo can know those are
 * the same person, and the matcher refuses to guess — exact match on the
 * normalised name, never a substring, never a first-name match
 * (shared/moegoStaffAlias.ts). A loose match is how a dog ends up
 * against the wrong groomer, which is Trap 3 of the Monday sync.
 *
 * So the join is DATA, and this is how a row is added. On the forward
 * import of 1,438 MoeGo rows, this single missing alias held back 445
 * bookings — every one of them reporting `unrecognised staff name
 * "Charlotte Purcell" — add an alias or stop`.
 *
 * ## It is deliberately one row at a time
 *
 * The table has three rows in it after a year — `megan graham` -> 2,
 * `bather 1` -> 7, `bather` -> 7 — because adding one is a decision
 * about a real person. A script that took a list would invite somebody
 * to paste one.
 *
 *   node --import tsx scripts/add-staff-alias.ts "Charlotte Purcell" 3
 *   node --import tsx scripts/add-staff-alias.ts "Charlotte Purcell" 3 --apply
 */
import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { moegoStaffAliases, staff } from "../drizzle/schema";
import { getDb } from "../server/db";
import { normaliseStaffName } from "../shared/moegoStaffAlias";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--apply");
  const moegoName = args[0];
  const staffId = Number(args[1]);

  if (!moegoName || !Number.isInteger(staffId) || staffId <= 0) {
    console.error('Usage: add-staff-alias.ts "<MoeGo name>" <staffId> [--apply]');
    process.exit(1);
  }

  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is not set, or the database is unreachable");

  console.log(APPLY ? "\nMODE: APPLY — this writes\n" : "\nMODE: dry run — nothing is written\n");

  /* Normalised the same way the matcher will read it. An alias stored
     as "Charlotte Purcell" would never match, because every lookup goes
     through normaliseStaffName first. */
  const key = normaliseStaffName(moegoName);

  // The staff member has to exist, be on THIS salon's roster, and be
  // active — an alias pointing at somebody who left sends dogs to a
  // groomer who is not there.
  const [member] = await db.select({
    id: staff.id, name: staff.name, role: staff.role, isActive: staff.isActive,
  }).from(staff).where(and(eq(staff.id, staffId), eq(staff.tenantId, TENANT))).limit(1);

  if (!member) {
    console.error(`No staff member ${staffId} on this salon's roster.`);
    process.exit(1);
  }
  if (!member.isActive) {
    console.error(`${member.name} (${staffId}) is not active. Refusing to alias onto them.`);
    process.exit(1);
  }

  const [existing] = await db.select({
    id: moegoStaffAliases.id, staffId: moegoStaffAliases.staffId,
  }).from(moegoStaffAliases)
    .where(and(eq(moegoStaffAliases.tenantId, TENANT), eq(moegoStaffAliases.moegoName, key)))
    .limit(1);

  console.log(`MoeGo name : "${moegoName}"  ->  stored as "${key}"`);
  console.log(`Groomigo   : ${member.name} (staff ${member.id}, ${member.role})`);

  if (existing) {
    if (existing.staffId === staffId) {
      console.log("\nAlready there, pointing at the same person. Nothing to do.");
      process.exit(0);
    }
    /* Never silently repoint. The unique index is on (tenant, name), so
       an upsert would quietly move every future booking for this MoeGo
       name onto a different groomer. */
    console.error(`\nREFUSING: "${key}" already points at staff ${existing.staffId}.`);
    console.error("Repointing an alias moves every future match onto somebody else.");
    console.error("Delete the row by hand if that is really what you want.");
    process.exit(1);
  }

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to add it.");
    process.exit(0);
  }

  await db.insert(moegoStaffAliases).values({
    tenantId: TENANT, moegoName: key, staffId,
  });
  console.log(`\nAdded. MoeGo's "${moegoName}" now resolves to ${member.name}.`);
  process.exit(0);
}

main().catch((error) => { console.error(error); process.exit(1); });
