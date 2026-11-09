/**
 * Clients MoeGo flagged inactive who are plainly still coming in.
 *
 * Andy, 09/11/2026, shown twenty of them: "Clear the 20."
 *
 * ## Where they came from
 *
 * Not from Groomigo. `clients.status` was written by the 3 August MoeGo
 * import, which carried MoeGo's own client status across — its list
 * filters on Active / Inactive / Lapsed / Block, which is where the
 * four values in the enum came from. Checked in MoeGo the same day: it
 * holds 410 Inactive against Groomigo's 419 non-active rows, and the
 * names line up one for one.
 *
 * So these are the salon's own flags, imported faithfully. Most are
 * right. About twenty are not: Melissa Cornish was flagged inactive and
 * groomed two days before this ran, David Bergman has been in 75 times,
 * Tiana Neville has four bookings ahead of her.
 *
 * ## What counts as "still coming in"
 *
 * The rule Andy set the same day, read the other way round: a visit
 * inside twelve months, OR anything in the diary. Both come from
 * readSweepRows, so this cannot disagree with the nightly job about
 * what a visit is or when the window starts.
 *
 * ## Why this is a script and not a change to decideReactivate
 *
 * The nightly job brings an inactive client back only when they have a
 * FUTURE BOOKING, deliberately: a recent visit is not enough, because
 * staff who know a client has moved away mark them inactive today while
 * their last groom was last month, and reactivating on a visit would
 * undo that overnight.
 *
 * Widening the rule to cover these twenty would trade that protection
 * away for ever, to fix an import artefact that happened once and will
 * not recur — MoeGo is being switched off. So the rule keeps its teeth
 * and this clears the batch.
 *
 * It is also stable afterwards. A cleared client has a visit inside the
 * window, so decideInactive leaves them alone (`visited_inside_window`)
 * and the nightly job will not re-flag them tomorrow.
 *
 *   node --import tsx scripts/clear-stale-inactive-flags.ts            # dry run
 *   node --import tsx scripts/clear-stale-inactive-flags.ts --apply
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { and, eq, inArray } from "drizzle-orm";
import { clients } from "../drizzle/schema";
import { getDb } from "../server/db";
import { readSweepRows, SALON_ZONE } from "../server/clientStatusSweep";
import { inactiveCutoffDay } from "../shared/clientActivity";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is not set, or the database is unreachable");

  console.log(APPLY ? "\nMODE: APPLY — this writes\n" : "\nMODE: dry run — nothing is written\n");

  const cutoffDay = inactiveCutoffDay(new Date(), SALON_ZONE);
  if (!cutoffDay) throw new Error("could not work out the cutoff day");

  const rows = await readSweepRows(db, TENANT);

  /*
   * `status === "inactive"` only. Never blocked: that is the salon
   * saying no, and no script gets to lift it — a client blocked after
   * an incident who happens to have been in last month must stay
   * blocked. `lapsed` is left alone too; it belongs to the report that
   * computes it, not to this column.
   */
  const toClear = rows.filter((r) =>
    r.status === "inactive"
    && (r.hasFutureBooking || (r.lastVisitDay !== null && r.lastVisitDay >= cutoffDay)));

  console.log(`Inactive clients: ${rows.filter((r) => r.status === "inactive").length}`);
  console.log(`Still coming in — visited since ${cutoffDay}, or booked: ${toClear.length}\n`);

  for (const r of toClear) {
    const why = [
      r.lastVisitDay && r.lastVisitDay >= cutoffDay ? `last visit ${r.lastVisitDay}` : null,
      r.hasFutureBooking ? "has a booking" : null,
    ].filter(Boolean).join(", ");
    console.log(`  ${String(r.id).padStart(6)}  ${r.name.padEnd(26)} ${why}`);
  }

  if (toClear.length === 0) { console.log("\nNothing to do."); process.exit(0); }

  /*
   * No blast-radius ceiling here, on purpose. This set is defined by
   * evidence of attendance rather than by its absence, so it cannot run
   * away: the worst case is every inactive client turns out to have
   * been in this year, which would mean the flags were all wrong and
   * clearing them all is the right answer anyway. The count is printed
   * in full above, name by name, which is the check that fits the size.
   */
  if (!APPLY) { console.log("\nDry run. Re-run with --apply to clear these."); process.exit(0); }

  mkdirSync("scripts/out", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reversal = `scripts/out/cleared-inactive-${stamp}.json`;
  writeFileSync(reversal, JSON.stringify({
    ranAt: new Date().toISOString(),
    cutoffDay,
    note: "Clients moved inactive -> active. clients.status keeps no history, so this file is the only way back.",
    clients: toClear.map((r) => ({
      id: r.id, name: r.name, previousStatus: r.status,
      lastVisitDay: r.lastVisitDay, hasFutureBooking: r.hasFutureBooking,
    })),
  }, null, 2));
  console.log(`\nReversal written to ${reversal}`);

  try {
    let written = 0;
    await db.transaction(async (tx: any) => {
      // `status = 'inactive'` restated at the write: anything that
      // changed since it was read is left alone, and a client somebody
      // BLOCKED in the meantime is not quietly set active — which would
      // lift the block.
      const res: any = await tx.update(clients)
        .set({ status: "active" })
        .where(and(
          eq(clients.tenantId, TENANT),
          eq(clients.status, "inactive"),
          inArray(clients.id, toClear.map((r) => r.id)),
        ));
      written = Number(res?.rowsAffected ?? res?.[0]?.affectedRows ?? 0);
      if (written > toClear.length) {
        throw new Error(`wrote ${written} rows for ${toClear.length} clients — rolling back`);
      }
    });
    console.log(`Cleared ${written} client(s) back to active.`);
    if (written < toClear.length) {
      console.log(`${toClear.length - written} were skipped at the write because their`);
      console.log(`status had changed since they were read. That is the guard working.`);
    }
  } catch (error) {
    console.error("Rolled back:", error);
    process.exitCode = 1;
  }
  process.exit(process.exitCode ?? 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
