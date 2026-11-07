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
import mysql from "mysql2/promise";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  INACTIVE_AFTER_MONTHS,
  INACTIVE_SKIP_LABEL,
  LIVE_MEMBERSHIP_STATUSES,
  decideInactive,
  inactiveCutoffDay,
  type InactiveSkipReason,
} from "../shared/clientActivity";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;
const ZONE = "Australia/Brisbane";

/**
 * Refuse to apply if more than this share of clients have never had a
 * completed appointment. On a real book most clients have been groomed;
 * a figure near 1 means `complete` is not what marks a finished groom
 * here, not that the salon has no customers.
 */
const MAX_NEVER_VISITED_SHARE = 0.6;

/** Written in one statement per chunk, so a failure is partial, not total. */
const WRITE_CHUNK = 200;

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

async function main() {
  const db = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    // Read days as strings and do the date arithmetic in the salon's
    // zone. Letting mysql2 convert with the machine clock is what
    // produced a wrong "timezone bug" diagnosis once already.
    timezone: "Z",
    connectTimeout: 20_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 5_000,
  });

  const now = new Date();
  const cutoffDay = inactiveCutoffDay(now, ZONE);
  if (!cutoffDay) throw new Error("could not work out the cutoff day");

  console.log(`\nMark inactive — no completed visit since ${cutoffDay}`);
  console.log(`(${INACTIVE_AFTER_MONTHS} months back from today, salon time)`);
  console.log(APPLY ? "MODE: APPLY — this writes\n" : "MODE: dry run — nothing is written\n");

  /* ---------- premise check: what does a finished groom look like? ---------- */

  const [states]: any = await db.query(
    `SELECT workflow_state AS state, COUNT(*) AS n
       FROM appointments WHERE tenant_id = ?
      GROUP BY state ORDER BY n DESC`, [TENANT]);
  console.log("Appointments by workflow state:");
  for (const r of states) console.log(`  ${String(r.state).padEnd(18)} ${r.n}`);

  /* ---------- the four facts the rule needs ---------- */

  /*
   * One row per client, with the work done in SQL rather than by pulling
   * every appointment into memory. That matters: lapsedClients does the
   * latter and ran the 512MB instance out of memory three times on
   * 05/11/2026. ~10,000 small rows is nothing by comparison.
   *
   * The correlated subqueries ride idx_appt_tenant_client (tenantId,
   * clientId), which exists for exactly this shape, and the membership
   * check rides idx_membership_client — so none of them is a scan.
   */

  const liveStatusPlaceholders = LIVE_MEMBERSHIP_STATUSES.map(() => "?").join(",");
  const [clients]: any = await db.query(
    `SELECT c.id,
            c.first_name AS firstName,
            c.last_name  AS lastName,
            c.status,
            DATE_FORMAT(CONVERT_TZ(c.created_at, '+00:00', '+10:00'), '%Y-%m-%d') AS createdDay,
            (SELECT DATE_FORMAT(CONVERT_TZ(MAX(a.scheduled_start), '+00:00', '+10:00'), '%Y-%m-%d')
               FROM appointments a
              WHERE a.client_id = c.id AND a.tenant_id = c.tenant_id
                AND a.workflow_state = 'complete')                       AS lastVisitDay,
            EXISTS (SELECT 1 FROM appointments f
                     WHERE f.client_id = c.id AND f.tenant_id = c.tenant_id
                       AND f.scheduled_start >= UTC_TIMESTAMP()
                       AND f.workflow_state NOT IN ('cancelled','no_show')) AS hasFutureBooking,
            EXISTS (SELECT 1 FROM memberships m
                     WHERE m.client_id = c.id AND m.tenant_id = c.tenant_id
                       AND m.status IN (${liveStatusPlaceholders}))     AS hasLiveMembership
       FROM clients c
      WHERE c.tenant_id = ?`,
    [...LIVE_MEMBERSHIP_STATUSES, TENANT]);

  const neverVisited = clients.filter((c: any) => !c.lastVisitDay).length;
  const share = clients.length ? neverVisited / clients.length : 0;
  console.log(`\nClients: ${clients.length}`);
  console.log(`  never had a completed appointment: ${neverVisited}`
    + ` (${(share * 100).toFixed(1)}%)`);

  /* ---------- decide ---------- */

  const toMark: Array<{ id: number; name: string; status: string; lastVisitDay: string | null }> = [];
  const skipped: Record<InactiveSkipReason, number> = {
    not_active_status: 0, has_future_booking: 0, has_live_membership: 0,
    created_inside_window: 0, visited_inside_window: 0,
  };

  for (const c of clients) {
    const decision = decideInactive({
      status: String(c.status),
      lastVisitDay: c.lastVisitDay ?? null,
      // mysql2 returns EXISTS as 1/0.
      hasFutureBooking: Boolean(Number(c.hasFutureBooking)),
      hasLiveMembership: Boolean(Number(c.hasLiveMembership)),
      createdDay: c.createdDay ?? null,
      cutoffDay,
    });
    if (decision.markInactive) {
      toMark.push({
        id: c.id,
        name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || `client ${c.id}`,
        status: String(c.status),
        lastVisitDay: c.lastVisitDay ?? null,
      });
    } else {
      skipped[decision.reason] += 1;
    }
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

  if (toMark.length === 0) {
    console.log("\nNothing to do.");
    await db.end();
    return;
  }

  /* ---------- the premise gate ---------- */

  if (share > MAX_NEVER_VISITED_SHARE) {
    console.log(`\n*** REFUSING TO APPLY ***`);
    console.log(`${(share * 100).toFixed(1)}% of clients have no completed appointment at all.`);
    console.log(`That is above the ${(MAX_NEVER_VISITED_SHARE * 100).toFixed(0)}% ceiling, and`);
    console.log(`almost certainly means a finished groom is not recorded as`);
    console.log(`workflow_state = 'complete' in this database — look at the state`);
    console.log(`spread above. Marking on that basis would restatus the whole book.`);
    await db.end();
    process.exitCode = 1;
    return;
  }

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write these.");
    await db.end();
    return;
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

  await db.beginTransaction();
  try {
    let written = 0;
    for (const group of chunk(toMark, WRITE_CHUNK)) {
      const ids = group.map((r) => r.id);
      // `AND status = 'active'` repeats the rule at the write: anything
      // whose status changed since it was read is left alone rather than
      // overwritten on stale information.
      const [res]: any = await db.query(
        `UPDATE clients SET status = 'inactive', updated_at = UTC_TIMESTAMP()
          WHERE tenant_id = ? AND status = 'active' AND id IN (${ids.map(() => "?").join(",")})`,
        [TENANT, ...ids]);
      written += res.affectedRows;
    }
    if (written > toMark.length) {
      throw new Error(`wrote ${written} rows for ${toMark.length} clients — rolling back`);
    }
    await db.commit();
    console.log(`Marked ${written} clients inactive.`);
    if (written < toMark.length) {
      console.log(`${toMark.length - written} were skipped at the write because their`);
      console.log(`status had changed since they were read. That is the guard working.`);
    }
  } catch (error) {
    await db.rollback();
    console.error("Rolled back:", error);
    process.exitCode = 1;
  }

  await db.end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
