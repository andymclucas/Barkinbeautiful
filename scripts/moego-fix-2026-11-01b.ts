/**
 * Two corrections from the Monday sync, both read off MoeGo directly.
 *
 * Andy, 01/11/2026: "Fix Louis's service and cancel Ishkah."
 *
 *   corepack pnpm exec tsx scripts/moego-fix-2026-11-01b.ts          # dry run
 *   corepack pnpm exec tsx scripts/moego-fix-2026-11-01b.ts --apply
 *
 * ## Louis (Varinia Taylor), Tue 03/11
 *
 * His Groomigo row is the remains of a BATH that was cancelled. He was
 * rebooked onto the household's other 08:30 booking as a styled groom,
 * so the row needs the service, the price, the length, the groomer and
 * the booking id — not a cancellation, which is what the sync report
 * first suggested and what would have taken a dog off the board.
 *
 * Every figure is read from MoeGo booking #95442576 itself, not
 * inferred: "Diamond - Gold (up to 6wks) -SML-10kg- Style Full Groom,
 * 08:30 am, $117.00, 90 mins, Megan". Megan is Megs Graham — there is
 * an explicit alias row for that, and guessing from a first name is how
 * the wrong groomer gets a dog.
 *
 * The booking id moves to 95442576, which is the booking he is actually
 * on. Two Groomigo rows then share it, which is correct: the sync key
 * is (booking, pet), never the booking alone.
 *
 * ## Ishkah (Peter Brabant), Fri 20/11
 *
 * Cancelled in MoeGo on 06/10. The client has no other booking in the
 * three-week pull and appears nowhere on MoeGo's calendar. Same guards
 * as the Boo cancellation: one transaction, matched on appointment AND
 * tenant AND pet AND client AND workflow_state='scheduled', rolled back
 * unless exactly one row moves, both state columns set, and a
 * workflow_logs row written.
 *
 * ## NOT changed, deliberately — Torah
 *
 * The same booking prices Torah at $117.00 with BROOKLYN. Groomigo has
 * her at $234.00 — the whole booking total landed on one dog — and with
 * Megs Graham. That is a $117 overcharge and a wrong groomer on
 * Tuesday, but it is a different dog from the one asked about, so it is
 * reported rather than silently corrected.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;

const LOUIS = {
  appointmentId: 1200504,
  petName: "Louis",
  clientName: "Varinia Taylor",
  day: "2026-11-03",
  from: { service: "bath_only", price: "60.00", mid: "124647286" },
  to: { service: "styled_groom", price: "117.00", mid: "95442576", staffId: 2, minutes: 90 },
};

const ISHKAH = {
  appointmentId: 1200373,
  petName: "Ishkah",
  clientName: "Peter Brabant",
  day: "2026-11-20",
  moegoBookingId: "122892113",
};

(async () => {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL!,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const show = async (id: number) => {
    const [r]: any = await c.query(
      `SELECT a.id, p.name pet, CONCAT(cl.first_name,' ',cl.last_name) client,
              a.service_type, a.price, a.moego_appointment_id mid, a.staff_id, s.name groomer,
              a.workflow_state, a.status,
              DATE_FORMAT(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00'),'%Y-%m-%d %H:%i') starts,
              DATE_FORMAT(CONVERT_TZ(a.scheduled_end,'+00:00','+10:00'),'%H:%i') ends,
              TIMESTAMPDIFF(MINUTE, a.scheduled_start, a.scheduled_end) mins
         FROM appointments a
         LEFT JOIN pets p ON p.id=a.pet_id
         LEFT JOIN clients cl ON cl.id=a.client_id
         LEFT JOIN staff s ON s.id=a.staff_id
        WHERE a.id=? AND a.tenant_id=?`, [id, TENANT]);
    return r[0];
  };

  const louis = await show(LOUIS.appointmentId);
  const ishkah = await show(ISHKAH.appointmentId);

  console.log("BEFORE");
  console.table([louis, ishkah]);

  const fail = (m: string) => { console.error("ABORT:", m); process.exit(1); };
  if (!louis) fail("Louis row not found");
  if (louis.pet !== LOUIS.petName || louis.client !== LOUIS.clientName) fail("Louis: pet/client mismatch");
  if (!louis.starts.startsWith(LOUIS.day)) fail(`Louis: slot is ${louis.starts}`);
  if (louis.workflow_state !== "scheduled") fail(`Louis: state is ${louis.workflow_state}`);
  if (String(louis.mid) !== LOUIS.from.mid) fail(`Louis: booking id is ${louis.mid}, expected the cancelled ${LOUIS.from.mid}`);
  if (louis.service_type !== LOUIS.from.service) fail(`Louis: service is already ${louis.service_type}`);

  if (!ishkah) fail("Ishkah row not found");
  if (ishkah.pet !== ISHKAH.petName || ishkah.client !== ISHKAH.clientName) fail("Ishkah: pet/client mismatch");
  if (!ishkah.starts.startsWith(ISHKAH.day)) fail(`Ishkah: slot is ${ishkah.starts}`);
  if (ishkah.workflow_state !== "scheduled") fail(`Ishkah: state is ${ishkah.workflow_state}`);
  if (String(ishkah.mid) !== ISHKAH.moegoBookingId) fail(`Ishkah: booking id is ${ishkah.mid}`);

  console.log("\nchecks passed on both rows");
  console.log(`Louis  : ${LOUIS.from.service} $${LOUIS.from.price} -> ${LOUIS.to.service} $${LOUIS.to.price}, ${LOUIS.to.minutes} mins, groomer ${LOUIS.to.staffId}, booking ${LOUIS.to.mid}`);
  console.log(`Ishkah : scheduled -> cancelled`);

  if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); await c.end(); return; }

  await c.beginTransaction();
  try {
    const [l]: any = await c.query(
      `UPDATE appointments a
          JOIN pets p ON p.id=a.pet_id
          JOIN clients cl ON cl.id=a.client_id
          SET a.service_type=?, a.price=?, a.moego_appointment_id=?, a.staff_id=?,
              a.scheduled_end=DATE_ADD(a.scheduled_start, INTERVAL ? MINUTE)
        WHERE a.id=? AND a.tenant_id=? AND a.workflow_state='scheduled'
          AND p.name=? AND CONCAT(cl.first_name,' ',cl.last_name)=?
          AND a.service_type=?`,
      [LOUIS.to.service, LOUIS.to.price, LOUIS.to.mid, LOUIS.to.staffId, LOUIS.to.minutes,
       LOUIS.appointmentId, TENANT, LOUIS.petName, LOUIS.clientName, LOUIS.from.service]);
    if (l.affectedRows !== 1) throw new Error(`Louis: affected ${l.affectedRows} rows, expected 1`);

    const [i]: any = await c.query(
      `UPDATE appointments a
          JOIN pets p ON p.id=a.pet_id
          JOIN clients cl ON cl.id=a.client_id
          SET a.workflow_state='cancelled', a.status='cancelled'
        WHERE a.id=? AND a.tenant_id=? AND a.workflow_state='scheduled'
          AND p.name=? AND CONCAT(cl.first_name,' ',cl.last_name)=?`,
      [ISHKAH.appointmentId, TENANT, ISHKAH.petName, ISHKAH.clientName]);
    if (i.affectedRows !== 1) throw new Error(`Ishkah: affected ${i.affectedRows} rows, expected 1`);

    await c.query(
      `INSERT INTO workflow_logs (appointment_id, from_state, to_state, notes)
       VALUES (?, 'scheduled', 'cancelled', ?)`,
      [ISHKAH.appointmentId,
       `Cancelled by the MoeGo sync on 01/11/2026. MoeGo booking ${ISHKAH.moegoBookingId} was cancelled on 06/10/2026.`]);

    await c.commit();
    console.log("\ncommitted");
  } catch (e: any) {
    await c.rollback();
    console.error("\nROLLED BACK —", e?.message ?? e);
    process.exit(1);
  }

  console.log("\nAFTER");
  console.table([await show(LOUIS.appointmentId), await show(ISHKAH.appointmentId)]);
  await c.end();
})();
