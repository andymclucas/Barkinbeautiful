/**
 * Populate invoice_appointments from the invoices already raised.
 *
 * `invoice_appointments` is the authority on which appointments an
 * invoice covers, and the duplicate-bill check reads it. Every invoice
 * raised before it existed carries its appointment in
 * `invoices.appointment_id` instead, so without this backfill those
 * bookings would look unbilled and could be invoiced a second time.
 *
 * Idempotent: it inserts only links that are missing, so re-running
 * after more invoices are raised adds just the new ones.
 *
 *   node --import tsx scripts/backfill-invoice-appointments.ts
 *   node --import tsx scripts/backfill-invoice-appointments.ts --apply
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");

async function main() {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL!,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const [missing] = await c.query(`
    SELECT i.id AS invoiceId, i.tenant_id AS tenantId, i.appointment_id AS appointmentId,
           i.invoice_number AS invoiceNumber
      FROM invoices i
     WHERE i.appointment_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM invoice_appointments ia
          WHERE ia.invoice_id = i.id AND ia.appointment_id = i.appointment_id
       )`);
  const rows = missing as { invoiceId: number; tenantId: number; appointmentId: number; invoiceNumber: string }[];

  const [[total]] = await c.query(`SELECT COUNT(*) n FROM invoices WHERE appointment_id IS NOT NULL`) as any;
  const [[already]] = await c.query(`SELECT COUNT(*) n FROM invoice_appointments`) as any;
  console.log(`invoices with an appointment: ${total.n}`);
  console.log(`links already present:        ${already.n}`);
  console.log(`links to add:                 ${rows.length}`);
  for (const r of rows.slice(0, 5)) {
    console.log(`  ${r.invoiceNumber} -> appointment ${r.appointmentId}`);
  }
  if (rows.length > 5) console.log(`  ... and ${rows.length - 5} more`);

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write.");
    await c.end();
    return;
  }
  if (rows.length === 0) { console.log("\nNothing to do."); await c.end(); return; }

  /**
   * Batched, in one transaction.
   *
   * 13,051 rows is 39,153 placeholders in a single INSERT, which is how
   * the membership backfill hung for 29 minutes on 20/10/2026 — the
   * statement never came back and nothing was written. Five hundred at
   * a time is 1,500 placeholders, well inside anything TiDB minds.
   *
   * Still one transaction: a half-finished backfill is the one state
   * that would let a booking be billed twice, because the appointments
   * it did not reach look unbilled.
   */
  const BATCH = 500;
  await c.beginTransaction();
  try {
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const [res] = await c.query(
        `INSERT INTO invoice_appointments (tenant_id, invoice_id, appointment_id)
         VALUES ${batch.map(() => "(?, ?, ?)").join(", ")}`,
        batch.flatMap((r) => [r.tenantId, r.invoiceId, r.appointmentId]),
      );
      inserted += (res as any).affectedRows;
      process.stdout.write(`\r  ${inserted}/${rows.length}`);
    }
    process.stdout.write("\n");
    if (inserted !== rows.length) throw new Error(`expected ${rows.length} rows, inserted ${inserted}`);
    await c.commit();
    console.log(`inserted ${inserted} links`);
  } catch (e) {
    await c.rollback();
    console.error("ROLLED BACK —", (e as Error).message);
    process.exitCode = 1;
  }
  await c.end();
}

main();
