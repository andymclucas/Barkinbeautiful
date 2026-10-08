/**
 * Close out appointments abandoned part-way through the workflow board.
 *
 * Dogs that were checked in and moved through bathing/drying/grooming, then
 * never marked complete. On 09/10/2026 there were 24, from 3 Aug to 29 Sept.
 * They do not reach the board — getBoard is scoped to the Brisbane day — but
 * they sit forever in a live state and distort anything that counts work in
 * progress.
 *
 *   node --import tsx scripts/close-stale-workflow-states.ts          # dry run
 *   node --import tsx scripts/close-stale-workflow-states.ts --apply  # writes
 *
 * What it does, and deliberately does not do:
 *
 *   - Sets workflow_state = 'complete'. The dogs were served; the board was
 *     simply never updated.
 *   - Writes a workflow_logs row per appointment recording the real
 *     from_state, so the audit trail the Pet Tracker and timing analytics
 *     rely on stays intact and the change is reversible.
 *   - Does NOT set completed_at or actual_end. The app sets those to "now",
 *     which on a September row would produce month-long stage durations and
 *     poison the timing averages. 90% of existing complete rows (6,256 of
 *     6,934) already have a NULL completed_at, so this is the normal shape.
 *   - Does NOT touch status, price, or any stage timestamp. The September
 *     stage timings are real and are left exactly as recorded.
 *   - Only touches rows scheduled BEFORE today, so dogs live on the floor
 *     right now are never affected.
 *
 * Each update is guarded on the exact state read during the dry run, so a dog
 * that moves between the read and the write is skipped rather than clobbered.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");

const BRISBANE_TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());

async function main() {
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new Error("DATABASE_URL is not set");
  const db = await mysql.createConnection({ uri, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true } });

  const [rows] = await db.query<any[]>(
    `SELECT a.id, a.workflow_state, a.status,
            DATE(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00')) d,
            p.name pet
     FROM appointments a LEFT JOIN pets p ON p.id = a.pet_id
     WHERE a.tenant_id = 1
       AND a.workflow_state NOT IN ('scheduled','complete','cancelled','no_show')
       AND DATE(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00')) < ?
     ORDER BY a.scheduled_start`,
    [BRISBANE_TODAY],
  );

  console.log(`Brisbane today: ${BRISBANE_TODAY} — only rows BEFORE this are touched.\n`);
  console.log(`Stale workflow rows: ${rows.length}`);
  const byState: Record<string, number> = {};
  for (const r of rows) {
    byState[r.workflow_state] = (byState[r.workflow_state] ?? 0) + 1;
    console.log(`   #${r.id}  ${String(r.d).slice(0, 10)}  ${String(r.workflow_state).padEnd(18)} ${r.pet ?? ""}`);
  }
  console.log("\n  by state:", JSON.stringify(byState));

  if (rows.length === 0) { console.log("\nNothing to do."); await db.end(); return; }
  if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); await db.end(); return; }

  const note = `Administrative close-out ${BRISBANE_TODAY}: stale board record, dog was served but never marked complete.`;
  let updated = 0, skipped = 0;
  await db.beginTransaction();
  try {
    for (const r of rows) {
      const now = Date.now();
      // Guarded on the state we read, so anything that moved is left alone.
      const [res] = await db.query<any>(
        `UPDATE appointments SET workflow_state = 'complete'
         WHERE id = ? AND workflow_state = ? AND tenant_id = 1`,
        [r.id, r.workflow_state],
      );
      if (res.affectedRows !== 1) { skipped++; console.log(`   SKIPPED #${r.id} — state moved`); continue; }
      await db.query(
        `INSERT INTO workflow_logs (appointment_id, from_state, to_state, changed_at, changed_at_ms, notes)
         VALUES (?, ?, 'complete', NOW(), ?, ?)`,
        [r.id, r.workflow_state, now, note],
      );
      updated++;
    }
    if (updated + skipped !== rows.length) throw new Error(`accounting mismatch: ${updated}+${skipped} != ${rows.length}`);
    await db.commit();
    console.log(`\nCOMMITTED. ${updated} closed, ${skipped} skipped.`);
  } catch (error) {
    await db.rollback();
    console.error("\nROLLED BACK — nothing changed:", (error as Error).message);
    process.exitCode = 1;
  }
  await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
