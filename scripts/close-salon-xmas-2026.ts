/**
 * Apply the 2026/27 Christmas shutdown and Australia Day closure.
 *
 * Andy, 30/10/2026: "Merge it and apply both."
 *
 * Calls the real `staff.closeSalon` procedure in process rather than
 * writing `staff_blockouts` rows directly, so the booked-dog guard, the
 * roster query, the single groupId and the row shape are all the shipped
 * code path. A hand-written INSERT would apply the same closure while
 * verifying none of it.
 *
 *   corepack pnpm exec tsx scripts/close-salon-xmas-2026.ts           # dry run
 *   corepack pnpm exec tsx scripts/close-salon-xmas-2026.ts --apply   # writes
 *
 * Dates: last trading day before the break is Wed 23/12 (2 dogs), first
 * day back Tue 05/01 (31 dogs). 26/01/2027 is a Tuesday the salon would
 * otherwise trade; nothing is booked on it.
 *
 * Lifting a closure is one action, not 144: delete any blockout in the
 * group with `wholeGroup: true`.
 */
import "dotenv/config";
import { appRouter } from "../server/routers";
import { getDb } from "../server/db";
import { users, staffBlockouts, appointments } from "../drizzle/schema";
import { and, eq, gte, lte, sql, notInArray } from "drizzle-orm";
import { blockoutDateValue } from "../shared/staffBlockouts";

const APPLY = process.argv.includes("--apply");
const ACTOR_EMAIL = "mclucas.andy@gmail.com";

const CLOSURES = [
  { label: "Christmas shutdown", startDate: "2026-12-24", endDate: "2027-01-04", reason: "Salon closed" },
  { label: "Australia Day", startDate: "2027-01-26", endDate: "2027-01-26", reason: "Public holiday" },
] as const;

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [actor] = await db.select().from(users).where(eq(users.email, ACTOR_EMAIL)).limit(1);
  if (!actor) throw new Error(`No user ${ACTOR_EMAIL}`);
  if (actor.role !== "admin") throw new Error(`${ACTOR_EMAIL} is role=${actor.role}, not admin`);
  console.log(`actor: user ${actor.id} ${actor.email} (${actor.role})\n`);

  /* Pre-flight, read-only, printed whether or not we go on to write. The
     procedure refuses on booked dogs by itself; this is so the refusal is
     never a surprise. */
  for (const c of CLOSURES) {
    const booked = await db.select({
      // Aliased, and grouped by the alias — see the note on closeSalon's
      // guard in server/routers.ts.
      day: sql<string>`DATE_FORMAT(CONVERT_TZ(${appointments.scheduledStart}, '+00:00', '+10:00'), '%Y-%m-%d')`.as("day"),
      dogs: sql<number>`COUNT(*)`.as("dogs"),
    }).from(appointments).where(and(
      eq(appointments.tenantId, 1),
      notInArray(appointments.status, ["cancelled", "no_show"]),
      notInArray(appointments.workflowState, ["cancelled", "no_show"]),
      sql`CONVERT_TZ(${appointments.scheduledStart}, '+00:00', '+10:00') >= ${c.startDate + " 00:00:00"}`,
      sql`CONVERT_TZ(${appointments.scheduledStart}, '+00:00', '+10:00') <  DATE_ADD(${c.endDate + " 00:00:00"}, INTERVAL 1 DAY)`,
    )).groupBy(sql`day`);

    const existing = await db.select({ n: sql<number>`COUNT(*)` })
      .from(staffBlockouts).where(and(
        eq(staffBlockouts.tenantId, 1),
        gte(staffBlockouts.blockoutDate, blockoutDateValue(c.startDate)),
        lte(staffBlockouts.blockoutDate, blockoutDateValue(c.endDate)),
      ));

    console.log(`${c.label}  ${c.startDate} -> ${c.endDate}  ("${c.reason}")`);
    console.log(`  dogs booked:        ${booked.length === 0 ? "none" : booked.map(b => `${b.day} (${b.dogs})`).join(", ")}`);
    console.log(`  blockouts already:  ${existing[0]?.n ?? 0}`);
  }

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply.");
    return;
  }

  const caller = appRouter.createCaller({
    req: { headers: {} } as never,
    res: {} as never,
    user: actor,
    tenantId: 1,
  });

  console.log("");
  for (const c of CLOSURES) {
    const result = await caller.staff.closeSalon({
      startDate: c.startDate,
      endDate: c.endDate,
      reason: c.reason,
    });
    console.log(`${c.label}: created ${result.created} rows over ${result.days} day(s) x ${result.staff} staff` +
      `${result.alreadyBlocked ? `, ${result.alreadyBlocked} already blocked` : ""}`);
    console.log(`  groupId ${result.groupId}`);
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
