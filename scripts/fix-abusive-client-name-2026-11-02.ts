/**
 * Client 7952's name carries an abusive annotation. Take it out of the
 * name and keep what it was probably there to say.
 *
 * Andy, 02/11/2026: "fix that name too."
 *
 *   corepack pnpm exec tsx scripts/fix-abusive-client-name-2026-11-02.ts          # dry run
 *   corepack pnpm exec tsx scripts/fix-abusive-client-name-2026-11-02.ts --apply
 *
 * Somebody typed a slur into this person's first name AND last name in
 * MoeGo, and the 2 August import carried both across faithfully. The
 * name underneath is plainly Steven Grey. It has sat in the name field
 * since, which is the one field that reaches a client: the board, an
 * invoice, a confirmation, a portal page.
 *
 * The annotation is NOT simply deleted, because it was probably doing
 * a job. This client has no dog, no booking and no money against them,
 * which is consistent with somebody marking a person they did not want
 * dealt with — and there is no note, no tag and no warning anywhere
 * else in either system saying so. Deleting the only copy of that
 * would lose it.
 *
 * So the name is corrected and a note records that a warning existed,
 * without repeating what it said. `status` is deliberately left
 * `active`: "blocked" is one of the four values that column takes and
 * it would be the right answer if the intent was to refuse this
 * person, but that is a decision for the salon, not an inference from
 * a slur.
 *
 * MoeGo still holds the original. Nothing syncs names back out of
 * Groomigo, so fixing it there is a separate, manual job.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;
const CLIENT = 7952;
const MOEGO_ID = "21097600";
const FROM_FIRST = "Steven - CUNT";
const FROM_LAST = "Grey - CUNT";
const TO_FIRST = "Steven";
const TO_LAST = "Grey";
const NOTE =
  "02/11/2026: this client's first and last name both carried an abusive " +
  "annotation, which has been removed so it cannot reach an invoice, a " +
  "confirmation or the board. It is still in MoeGo. Whoever added it may " +
  "have meant it as a warning — there is no other note, tag or flag on " +
  "this client, and they have never booked. If they should not be booked, " +
  "set the client's status to blocked and say why here.";

(async () => {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const [[row]]: any = await c.query(
    `SELECT id, first_name, last_name, phone, notes, status, moego_client_id mo
       FROM clients WHERE id=? AND tenant_id=?`, [CLIENT, TENANT]);
  if (!row) throw new Error(`client ${CLIENT} not found`);
  if (row.mo !== MOEGO_ID) throw new Error(`client ${CLIENT} has moego id ${row.mo}, expected ${MOEGO_ID}`);
  if (row.first_name === TO_FIRST && row.last_name === TO_LAST) {
    console.log("already corrected — nothing to do"); await c.end(); return;
  }
  if (row.first_name !== FROM_FIRST || row.last_name !== FROM_LAST) {
    throw new Error(`client ${CLIENT} reads "${row.first_name} ${row.last_name}", not the name this expects`);
  }
  if (row.notes) throw new Error(`client ${CLIENT} already has a note; read it before overwriting:\n${row.notes}`);

  // Changing a person's name is only safe when it is the same person.
  const [pets]: any = await c.query(`SELECT COUNT(*) n FROM pets WHERE client_id=? AND tenant_id=?`, [CLIENT, TENANT]);
  const [appts]: any = await c.query(`SELECT COUNT(*) n FROM appointments WHERE client_id=? AND tenant_id=?`, [CLIENT, TENANT]);
  console.log(`client ${CLIENT}  ${row.phone}  moego ${row.mo}  status ${row.status}`);
  console.log(`   name  "${row.first_name} ${row.last_name}"  ->  "${TO_FIRST} ${TO_LAST}"`);
  console.log(`   dogs ${pets[0].n}, appointments ${appts[0].n}`);
  console.log(`   note to be written:\n     ${NOTE.replace(/(.{72}\s)/g, "$1\n     ")}`);
  console.log(`   status left as "${row.status}" — blocking a client is the salon's call`);

  if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); await c.end(); return; }

  const [res]: any = await c.query(
    `UPDATE clients SET first_name=?, last_name=?, notes=?
      WHERE id=? AND tenant_id=? AND moego_client_id=? AND first_name=? AND last_name=? AND notes IS NULL`,
    [TO_FIRST, TO_LAST, NOTE, CLIENT, TENANT, MOEGO_ID, FROM_FIRST, FROM_LAST]);
  if (res.affectedRows !== 1) throw new Error(`update affected ${res.affectedRows} rows, expected 1`);
  console.log(`\nupdated — client ${CLIENT} is now "${TO_FIRST} ${TO_LAST}", with the warning kept as a note`);
  await c.end();
})();
