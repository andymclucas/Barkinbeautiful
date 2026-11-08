/**
 * Zero the price on grooms a membership already pays for.
 *
 * Andy, 09/11/2026: "Zero Harvey's $35."
 *
 * Harvey turned out to be one of eighteen. The repoint's own run warned
 * about him by name — "Harvey has 1 priced upcoming booking (#1200464
 * $35.00) — linking does not reprice, so these still bill at the
 * counter" — and the same is true of every other booking the backfill
 * has ever linked.
 *
 * ## Why the backfill leaves them priced, and why that is right
 *
 * scripts/backfill-appointment-memberships.ts says it plainly: "It
 * deliberately does NOT change price. Zeroing a historical groom would
 * rewrite what the salon billed, and several of these have invoices
 * against them." Linking records which plan covers a groom; it does not
 * restate the money. That is the correct call for history.
 *
 * It leaves a gap for bookings that have NOT happened yet. Those have no
 * invoice to rewrite, and a member arriving to be charged $35 for a
 * groom their weekly fee already covers is the failure
 * priceForCoveredAppointment exists to prevent at the booking screen.
 * This is that same rule applied to the ones the backfill linked after
 * the fact.
 *
 *   node --import tsx scripts/zero-covered-grooms.ts            # dry run
 *   node --import tsx scripts/zero-covered-grooms.ts --apply
 *
 * ## It asks the shared rule, never its own
 *
 * A classic plan covers a classic groom; a styled plan covers classic
 * and styled; nothing else is covered. That is three lines of SQL and it
 * would be a fourth copy of a rule that already exists, so coverage is
 * decided by resolveAppointmentMembershipCoverage — the same function
 * the booking screen, the rebook path and the backfill all use.
 *
 * On the salon's book that leaves six bookings alone: four daycare and
 * two FFT, sitting on plans that do not cover them. Their $241 is
 * correct, and zeroing it would hand out daycare free.
 *
 * ## Only ahead of us, only unpaid
 *
 * A past groom has been billed and may carry an invoice; rewriting it is
 * the history-rewriting the backfill refuses to do. A booking already
 * marked paid or partly paid is money that has moved.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  resolveAppointmentMembershipCoverage, type AppointmentService,
} from "../shared/appointmentMembershipCoverage";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;

async function main() {
  const db = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    timezone: "Z",
    connectTimeout: 20_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 5_000,
  });

  console.log(APPLY ? "\nMODE: APPLY — this writes\n" : "\nMODE: dry run — nothing is written\n");

  const [rows]: any = await db.query(
    `SELECT a.id, a.pet_id AS petId, a.service_type AS service, a.price,
            a.payment_status AS paymentStatus,
            DATE_FORMAT(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00'), '%a %d %b') AS whenIs,
            p.name AS dog, CONCAT(c.first_name, ' ', c.last_name) AS client,
            m.id AS planId, m.service_type AS planService, m.status AS planStatus,
            m.booking_suspended AS bookingSuspended
       FROM appointments a
       JOIN pets p ON p.id = a.pet_id
       JOIN clients c ON c.id = a.client_id
       JOIN memberships m ON m.id = a.membership_id
      WHERE a.tenant_id = ?
        AND a.scheduled_start >= UTC_TIMESTAMP()
        AND a.workflow_state NOT IN ('cancelled','no_show')
        AND a.membership_id IS NOT NULL
        AND a.price IS NOT NULL AND a.price > 0
      ORDER BY a.scheduled_start`, [TENANT]);

  console.log(`Upcoming bookings linked to a plan and still priced: ${rows.length}`);

  const toZero: any[] = [];
  const left: Record<string, { n: number; value: number }> = {};
  const note = (why: string, price: number) => {
    left[why] = { n: (left[why]?.n ?? 0) + 1, value: (left[why]?.value ?? 0) + price };
  };

  for (const r of rows) {
    const price = Number(r.price);

    // Money that has already moved is not ours to rewrite.
    if (r.paymentStatus === "paid" || r.paymentStatus === "partial") {
      note("already paid or part paid", price);
      continue;
    }

    const coverage = resolveAppointmentMembershipCoverage(
      [r.petId],
      String(r.service) as AppointmentService,
      [{
        id: r.planId,
        petId: r.petId,
        serviceType: r.planService,
        status: String(r.planStatus),
        bookingSuspended: Boolean(Number(r.bookingSuspended)),
        coveredPetIds: [r.petId],
      } as any],
    );

    if (coverage.membershipByPetId[r.petId]) toZero.push({ ...r, price, paymentStatus: r.paymentStatus ?? null });
    else note(`${r.service} — this plan does not cover it`, price);
  }

  const total = toZero.reduce((sum, r) => sum + r.price, 0);
  console.log(`\nWould zero: ${toZero.length} booking(s), $${total.toFixed(2)}`);
  for (const r of toZero) {
    console.log(`  ${String(r.id).padStart(8)}  ${r.whenIs}  ${String(r.client).padEnd(22)}`
      + ` ${String(r.dog).padEnd(12)} ${r.service.padEnd(14)} $${r.price.toFixed(2)}`);
  }

  if (Object.keys(left).length > 0) {
    console.log("\nLeft alone:");
    for (const [why, v] of Object.entries(left)) {
      console.log(`  ${String(v.n).padStart(4)}  $${v.value.toFixed(2).padStart(9)}  ${why}`);
    }
  }

  if (toZero.length === 0) { console.log("\nNothing to do."); await db.end(); return; }
  if (!APPLY) { console.log("\nDry run. Re-run with --apply to zero these."); await db.end(); return; }

  mkdirSync("scripts/out", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reversal = `scripts/out/zeroed-covered-${stamp}.json`;
  writeFileSync(reversal, JSON.stringify({
    ranAt: new Date().toISOString(),
    note: "Price before zeroing, per appointment. Nothing else records it.",
    zeroed: toZero.map((r) => ({ appointmentId: r.id, previousPrice: r.price.toFixed(2), dog: r.dog })),
  }, null, 2));
  console.log(`\nReversal written to ${reversal}`);

  await db.beginTransaction();
  try {
    let done = 0;
    const skipped: typeof toZero = [];
    for (const r of toZero) {
      /*
       * The WHERE re-checks only that NOTHING CHANGED since the read.
       * It does not restate the rule.
       *
       * It used to carry `payment_status NOT IN ('paid','partial')` as
       * well — a second copy of a decision the loop above has already
       * made in JS. The two then disagreed, because in SQL
       * `NULL NOT IN (...)` is NULL rather than true: on 09/11/2026 the
       * 16 rows reading 'unpaid' were zeroed and the 2 whose
       * payment_status was NULL were silently passed over, while the dry
       * run — doing the same test in JS, where null is simply not "paid"
       * — had promised all 18.
       *
       * `<=>` is NULL-safe equality, so this now asks the only question
       * that belongs here: is the row still as I read it.
       */
      const [res]: any = await db.query(
        `UPDATE appointments SET price = '0.00', updated_at = UTC_TIMESTAMP()
          WHERE id = ? AND tenant_id = ? AND price = ? AND payment_status <=> ?`,
        [r.id, TENANT, r.price.toFixed(2), r.paymentStatus]);
      if (res.affectedRows === 1) done += 1;
      else skipped.push(r);
    }
    if (done > toZero.length) throw new Error(`zeroed ${done} for ${toZero.length} — rolling back`);
    await db.commit();
    console.log(`\nZeroed ${done} booking(s).`);
    /* Named, not counted. A bare number is how a partial run reads as a
       success, which is exactly what it did on 09/11/2026. */
    for (const r of skipped) {
      console.log(`  SKIPPED ${r.id}  ${r.client} / ${r.dog}  $${r.price.toFixed(2)}`
        + ` — changed since it was read; re-run to pick it up`);
    }
  } catch (error) {
    await db.rollback();
    console.error("Rolled back:", (error as Error).message);
    process.exitCode = 1;
  }
  await db.end();
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
