/**
 * Remove payment rows and ledger entries that book one Stripe invoice twice.
 *
 * Why they exist: Stripe sends `invoice.paid` AND `invoice.payment_succeeded`
 * for one successful charge. The webhook's check-then-insert is not atomic, so
 * when the two arrive in the same second both handlers insert. Seen live on
 * 08/10/2026 — one $1 charge booked twice.
 *
 * Run this BEFORE migration 0094, which adds the unique index that makes it
 * impossible. The migration will fail while duplicates are present.
 *
 *   node --import tsx scripts/dedupe-membership-payments.ts            # dry run
 *   node --import tsx scripts/dedupe-membership-payments.ts --apply    # writes
 *
 * Keeps the LOWEST id of each duplicate group — the first one booked — and
 * deletes the rest. Runs in one transaction and aborts whole if the number of
 * rows deleted is not exactly the number identified, so a row appearing
 * between the read and the write stops it rather than being guessed at.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");

type Group = { key: string; keep: number; drop: number[] };

async function main() {
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new Error("DATABASE_URL is not set");
  const db = await mysql.createConnection({
    uri,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const [paymentRows] = await db.query<any[]>(`
    SELECT stripe_invoice_id AS k, MIN(id) AS keepId, GROUP_CONCAT(id ORDER BY id) AS ids
    FROM membership_payments
    WHERE stripe_invoice_id IS NOT NULL AND status = 'paid'
    GROUP BY stripe_invoice_id HAVING COUNT(*) > 1`);
  const [ledgerRows] = await db.query<any[]>(`
    SELECT external_reference AS k, MIN(id) AS keepId, GROUP_CONCAT(id ORDER BY id) AS ids
    FROM membership_ledger_entries
    WHERE external_reference IS NOT NULL AND entry_type = 'payment'
    GROUP BY external_reference HAVING COUNT(*) > 1`);

  const toGroups = (rows: any[]): Group[] =>
    rows.map((r) => {
      const ids = String(r.ids).split(",").map(Number);
      return { key: String(r.k), keep: Number(r.keepId), drop: ids.filter((id) => id !== Number(r.keepId)) };
    });

  const payments = toGroups(paymentRows);
  const ledger = toGroups(ledgerRows);

  const report = (name: string, groups: Group[]) => {
    console.log(`\n${name}: ${groups.length} invoice(s) booked more than once`);
    for (const g of groups) console.log(`   ${g.key}  keep #${g.keep}  delete ${g.drop.map((d) => "#" + d).join(", ")}`);
  };
  report("membership_payments", payments);
  report("membership_ledger_entries", ledger);

  const paymentIds = payments.flatMap((g) => g.drop);
  const ledgerIds = ledger.flatMap((g) => g.drop);
  console.log(`\nWould delete ${paymentIds.length} payment row(s) and ${ledgerIds.length} ledger row(s).`);

  if (paymentIds.length === 0 && ledgerIds.length === 0) {
    console.log("Nothing to do — migration 0094 can be applied.");
    await db.end();
    return;
  }

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to delete.");
    await db.end();
    return;
  }

  await db.beginTransaction();
  try {
    if (paymentIds.length) {
      const [res] = await db.query<any>(
        `DELETE FROM membership_payments WHERE id IN (${paymentIds.map(() => "?").join(",")}) AND status = 'paid'`,
        paymentIds,
      );
      if (res.affectedRows !== paymentIds.length) {
        throw new Error(`membership_payments: expected ${paymentIds.length} deletions, got ${res.affectedRows}`);
      }
    }
    if (ledgerIds.length) {
      const [res] = await db.query<any>(
        `DELETE FROM membership_ledger_entries WHERE id IN (${ledgerIds.map(() => "?").join(",")}) AND entry_type = 'payment'`,
        ledgerIds,
      );
      if (res.affectedRows !== ledgerIds.length) {
        throw new Error(`membership_ledger_entries: expected ${ledgerIds.length} deletions, got ${res.affectedRows}`);
      }
    }
    await db.commit();
    console.log("\nCOMMITTED. Migration 0094 can now be applied.");
  } catch (error) {
    await db.rollback();
    console.error("\nROLLED BACK — nothing changed:", (error as Error).message);
    process.exitCode = 1;
  }
  await db.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
