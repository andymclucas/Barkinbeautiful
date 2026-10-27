/**
 * Link upcoming grooms to the membership that already covers them.
 *
 * 128 of 713 upcoming bookings belong to a client with an active
 * membership without carrying the link — almost all MoeGo imports,
 * which never had one. The day panel therefore counts those dogs as
 * paying and leaves their subscription revenue out of the membership
 * figure, understating membership work by roughly half.
 *
 * This links only the ones where the answer is not a judgement call:
 *
 *   - the client holds EXACTLY ONE active membership, and
 *   - that membership names THIS dog, and
 *   - the groom is priced at zero.
 *
 * The last condition is what keeps it money-neutral. With a
 * membershipId set, appointmentInvoicing bills extras only; without
 * one it bills everything. For a groom already priced at zero those
 * are the same invoice, so linking changes the label and the counts
 * and not a cent.
 *
 * `--include-priced` drops that condition and links the ones carrying
 * a MoeGo price too. That is NOT money-neutral: it writes off whatever
 * those grooms were priced at, because a covered groom is not charged
 * for. It is a separate flag rather than the default so the money
 * decision has to be made on purpose — Andy made it on 28/10/2026 for
 * seven bookings worth $275, having been shown the list.
 *
 * The price is left ON the row rather than zeroed. The invoice path
 * ignores it, the day panel no longer counts it, and leaving it there
 * means unsetting the link is enough to undo this.
 *
 * Multi-dog plans are not excluded, and should not be. A plan that
 * names this dog covers this dog whatever else it covers; the
 * ambiguity in a household plan is about its OTHER dogs, which this
 * never touches.
 *
 * Dry run by default. --apply commits.
 */
require("dotenv").config({ quiet: true });
const mysql = require("mysql2/promise");

const APPLY = process.argv.includes("--apply");
const INCLUDE_PRICED = process.argv.includes("--include-priced");

const SELECT_CANDIDATES = `
  SELECT a.id, a.pet_id, mm.id AS membership_id, p.name AS pet, a.price,
         CONCAT(cl.first_name, ' ', cl.last_name) AS client,
         DATE_FORMAT(CONVERT_TZ(a.scheduled_start, '+00:00', '+10:00'), '%a %e %b') AS whenn
  FROM appointments a
  JOIN memberships mm ON mm.pet_id = a.pet_id AND mm.status = 'active'
  LEFT JOIN pets p ON p.id = a.pet_id
  LEFT JOIN clients cl ON cl.id = a.client_id
  WHERE a.tenant_id = 1
    AND a.membership_id IS NULL
    AND a.scheduled_start >= NOW()
    AND a.workflow_state NOT IN ('cancelled', 'no_show')
    AND (? = 1 OR COALESCE(a.price, 0) = 0)
    AND (SELECT COUNT(*) FROM memberships m2
         WHERE m2.client_id = a.client_id AND m2.status = 'active') = 1
  ORDER BY a.scheduled_start`;

(async () => {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const [rows] = await c.query(SELECT_CANDIDATES, [INCLUDE_PRICED ? 1 : 0]);
  const writeOff = rows.reduce((sum, r) => sum + Math.round(Number(r.price ?? 0) * 100), 0) / 100;
  console.log(`candidates: ${rows.length}${INCLUDE_PRICED ? "  (--include-priced)" : ""}`);
  if (writeOff > 0) console.log(`WRITES OFF $${writeOff.toFixed(2)} of priced grooms — they become covered.`);
  console.table(rows.slice(0, 10).map((r) => ({ id: r.id, pet: r.pet, client: r.client, when: r.whenn, plan: r.membership_id })));
  if (rows.length > 10) console.log(`… and ${rows.length - 10} more`);

  await c.beginTransaction();
  try {
    let written = 0;
    for (const row of rows) {
      // Re-asserts every condition the row was chosen under, so a
      // booking edited since the select is skipped rather than
      // overwritten — including the price, which is what makes this
      // safe.
      // Re-asserts the price it was chosen under, not merely "some
      // price": a booking repriced between the select and the write is
      // skipped rather than written off at a figure nobody approved.
      const [res] = await c.query(
        `UPDATE appointments SET membership_id = ?
         WHERE id = ? AND tenant_id = 1 AND membership_id IS NULL
           AND COALESCE(price, 0) = ?
           AND workflow_state NOT IN ('cancelled','no_show')`,
        [row.membership_id, row.id, row.price ?? 0],
      );
      written += res.affectedRows;
    }
    console.log(`rows written: ${written} of ${rows.length}`);
    if (written !== rows.length) throw new Error("some bookings changed underneath this run");

    if (APPLY) { await c.commit(); console.log("Committed."); }
    else { await c.rollback(); console.log("DRY RUN — rolled back. Re-run with --apply."); }
  } catch (e) {
    await c.rollback();
    console.error("ROLLED BACK —", e.message);
    process.exitCode = 1;
  }
  await c.end();
})();
