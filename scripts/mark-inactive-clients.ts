/**
 * Mark clients inactive when they have not visited in twelve months.
 *
 * Andy, 07/11/2026: "Zero visits in 12 months is inactive."
 *
 *   node --import tsx scripts/mark-inactive-clients.ts            # dry run
 *   node --import tsx scripts/mark-inactive-clients.ts --apply    # writes
 *
 * The rule lives in shared/clientActivity.ts with its tests. This file is
 * the plumbing: read the four facts the rule needs, print what it decided,
 * and only write when asked.
 *
 * ## Why the dry run checks its own premise
 *
 * The whole pass rests on one assumption: that a completed groom in this
 * database is `workflow_state = "complete"`. If the August 2025 import of
 * the salon's MoeGo history left those 14,000-odd rows in some other
 * state, then almost every client would read as "never visited" and this
 * script would mark the entire client book inactive in one transaction,
 * with no record of what any of them used to be.
 *
 * That is not a risk worth reasoning about from the code — the answer is
 * in the data. So the dry run prints the workflow-state spread and the
 * share of clients with no completed visit EVER, and `--apply` refuses
 * outright if that share looks like a broken premise rather than a
 * genuine answer. Read the numbers before you pass --apply.
 *
 * ## It writes a reversal file
 *
 * `clients.status` keeps no history and there is no audit table for it,
 * so once this runs there is nothing in the database that says what a row
 * used to be. Every applied run therefore writes
 * scripts/out/mark-inactive-<timestamp>.json listing each client id and
 * its previous status, which is the only way back.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { and, eq, inArray } from "drizzle-orm";
import { clients } from "../drizzle/schema";
import { getDb } from "../server/db";
import {
  INACTIVE_AFTER_MONTHS,
  INACTIVE_SKIP_LABEL,
  type InactiveSkipReason,
} from "../shared/clientActivity";
import { readSweepRows, planSweep } from "../server/clientStatusSweep";

const APPLY = process.argv.includes("--apply");

/**
 * The exact number of clients this run is authorised to mark inactive.
 *
 * The ceiling below refuses anything over half the active book, and on
 * 09/11/2026 the catch-up was 8,683 of 9,695 — 89.6%. Andy, told that
 * figure and what it costs (every one of them leaves the mass-text and
 * campaign audiences): "Raise the ceiling and run the catch-up."
 *
 * Raising MAX_SHARE_OF_ACTIVE in the source would have done it, which is
 * what this script's own refusal message used to tell you to do. That
 * was wrong: the same constant guards the NIGHTLY job, so loosening it
 * for one catch-up leaves the job with no safety net for ever.
 *
 * A number you have to type is better than both a flag and a constant.
 * You cannot produce 8683 without having run the dry run and read it,
 * the shell history records exactly what was authorised, and it goes
 * stale by itself — next week, when the figure has moved, the same
 * command refuses instead of sweeping again.
 *
 *   node --import tsx scripts/mark-inactive-clients.ts
 *   node --import tsx scripts/mark-inactive-clients.ts --apply --expect 8683
 */
const EXPECT = (() => {
  const i = process.argv.indexOf("--expect");
  if (i === -1) return undefined;
  const n = Number(process.argv[i + 1]);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
})();
const TENANT = 1;

/** Written in one statement per chunk, so a failure is partial, not total. */
const WRITE_CHUNK = 200;

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

async function main() {
  /*
   * The same connection the app uses, not a hand-rolled mysql2 one.
   *
   * That is what makes readSweepRows genuinely shared with the nightly
   * job rather than nearly shared: the first version of this passed a
   * raw mysql2 connection with an `as any`, and the cast hid that
   * db.execute means something different on each driver. It failed on
   * the first call.
   *
   * The date arithmetic is done in SQL in the salon's zone either way
   * (CONVERT_TZ ... '+10:00'), so nothing here depends on the driver's
   * timezone handling — which is the thing that produced a wrong
   * "timezone bug" diagnosis once already.
   */
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is not set, or the database is unreachable");

  console.log(APPLY ? "\nMODE: APPLY — this writes\n" : "\nMODE: dry run — nothing is written\n");

  /*
   * The read and the rule come from server/clientStatusSweep.ts, which
   * is what the nightly job uses, so this cannot decide something the
   * job would not. Only the WRITE below is this script's own: a
   * transaction and a reversal file, because this run moves thousands
   * of rows and clients.status keeps no history.
   */
  const rows = await readSweepRows(db, TENANT);
  const plan = planSweep(rows, new Date(), { acknowledgedDeactivations: EXPECT });
  const cutoffDay = plan.cutoffDay;
  const toMark = plan.toDeactivate;
  const activeCount = plan.activeCount;
  const skipped = plan.deactivateSkips;

  console.log(`Mark inactive — nothing in the diary and no visit since ${cutoffDay}`);
  console.log(`(${INACTIVE_AFTER_MONTHS} months back from today, salon time)\n`);
  console.log(`Clients: ${rows.length}  (active: ${activeCount})`);
  console.log(`  no past visit on record at all: ${rows.filter((r) => !r.lastVisitDay).length}`);
  console.log(`  counted as gone — the imported history starts 2024-07-21, so an`);
  console.log(`  empty record is at least 28 months old either way.`);
  if (plan.toReactivate.length > 0) {
    console.log(`\nNOTE: ${plan.toReactivate.length} inactive client(s) have a booking and`);
    console.log(`would be brought BACK by the nightly job. This script does not do that half.`);
  }

  console.log("\nLeft alone:");
  for (const [reason, n] of Object.entries(skipped)) {
    console.log(`  ${String(n).padStart(6)}  ${INACTIVE_SKIP_LABEL[reason as InactiveSkipReason]}`);
  }
  console.log(`\nWould mark inactive: ${toMark.length}`);

  // A sample rather than ten thousand lines, oldest first so the most
  // clearly-gone are what you read.
  const sample = [...toMark].sort((a, b) =>
    (a.lastVisitDay ?? "0000-00-00").localeCompare(b.lastVisitDay ?? "0000-00-00")).slice(0, 15);
  if (sample.length) {
    console.log("\nOldest 15 of them:");
    for (const r of sample) {
      console.log(`  ${String(r.id).padStart(6)}  ${r.name.padEnd(28)}`
        + `  last visit ${r.lastVisitDay ?? "never"}`);
    }
  }

  /* ---------- the blast-radius gate, checked before anything else ---------- */

  const shareOfActive = activeCount ? toMark.length / activeCount : 0;
  console.log(`That is ${(shareOfActive * 100).toFixed(1)}% of the active book.`);
  console.log(`${activeCount - toMark.length} would be left active.`);

  if (plan.refusedReason) {
    console.log(`\n*** REFUSING TO APPLY ***`);
    console.log(plan.refusedReason + ".");
    console.log(`Restatusing half the client book is a migration, not a tidy-up.`);
    console.log(`If that is genuinely what you want, re-run with:`);
    console.log(`  --apply --expect ${toMark.length}`);
    console.log(`The number has to match this plan exactly, so it cannot be`);
    console.log(`typed without reading it and it goes stale on its own.`);
    process.exit(1);
  }
  if (EXPECT !== undefined) {
    console.log(`\nCeiling lifted: ${EXPECT} acknowledged on the command line.`);
  }

  if (toMark.length === 0) {
    console.log("\nNothing to do.");
    process.exit(0);
  }

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write these.");
    process.exit(0);
  }

  /* ---------- write, after saving the way back ---------- */

  mkdirSync("scripts/out", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reversal = `scripts/out/mark-inactive-${stamp}.json`;
  writeFileSync(reversal, JSON.stringify({
    ranAt: new Date().toISOString(),
    cutoffDay,
    note: "Previous status per client. clients.status keeps no history, so this file is the only way back.",
    clients: toMark.map((r) => ({ id: r.id, previousStatus: r.status, lastVisitDay: r.lastVisitDay })),
  }, null, 2));
  console.log(`\nReversal written to ${reversal}`);

  try {
    let written = 0;
    await db.transaction(async (tx: any) => {
      for (const group of chunk(toMark, WRITE_CHUNK)) {
        // `status = 'active'` repeats the rule at the write: anything
        // whose status changed since it was read is left alone rather
        // than overwritten on stale information. It also means a client
        // somebody BLOCKED in the meantime is not quietly demoted to
        // inactive, which would lift the block.
        const res: any = await tx.update(clients)
          .set({ status: "inactive" })
          .where(and(
            eq(clients.tenantId, TENANT),
            eq(clients.status, "active"),
            inArray(clients.id, group.map((r) => r.id)),
          ));
        written += Number(res?.rowsAffected ?? res?.[0]?.affectedRows ?? 0);
      }
      if (written > toMark.length) {
        throw new Error(`wrote ${written} rows for ${toMark.length} clients — rolling back`);
      }
    });
    console.log(`Marked ${written} clients inactive.`);
    if (written < toMark.length) {
      console.log(`${toMark.length - written} were skipped at the write because their`);
      console.log(`status had changed since they were read. That is the guard working.`);
    }
  } catch (error) {
    console.error("Rolled back:", error);
    process.exitCode = 1;
  }
  process.exit(process.exitCode ?? 0);

}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
