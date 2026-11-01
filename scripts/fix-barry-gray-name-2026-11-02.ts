/**
 * Client 309 is "Garry Gray" here and Barry in MoeGo. Correct it.
 *
 * Found by the November sync: Pepper and Snow kept reading as dogs
 * MoeGo did not have, because that comparison falls back to matching
 * on the client's name when it is checking a booking the ids already
 * agree on. The booking was never wrong. The name was.
 *
 *   corepack pnpm exec tsx scripts/fix-barry-gray-name-2026-11-02.ts          # dry run
 *   corepack pnpm exec tsx scripts/fix-barry-gray-name-2026-11-02.ts --apply
 *
 * MoeGo is right, and it is one record rather than two. Its client
 * list, searched on 0407229131 on 02/11/2026, returns exactly one
 * person — Barry Gray, with Pepper (Cocker) and Snow (Cocker) — and
 * Groomigo's 309 carries that same phone number and those same two
 * dogs. Groomigo's spelling came in with the 2 August bulk import and
 * has never been touched since; MoeGo is where staff maintain a
 * client's details and is what the client's own confirmations use.
 *
 * Guarded on the MoeGo id and on the spelling being corrected, so it
 * cannot run twice and cannot touch a record somebody has since
 * fixed by hand. Only `first_name` changes: the phone, the email and
 * both dogs are already right.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;
const CLIENT = 309;
const MOEGO_ID = "100323426";
const FROM = "Garry";
const TO = "Barry";

(async () => {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const [[row]]: any = await c.query(
    `SELECT id, first_name, last_name, phone, email, moego_client_id mo FROM clients
      WHERE id=? AND tenant_id=?`, [CLIENT, TENANT]);
  if (!row) throw new Error(`client ${CLIENT} not found`);
  if (row.mo !== MOEGO_ID) throw new Error(`client ${CLIENT} has moego id ${row.mo}, expected ${MOEGO_ID}`);
  if (row.first_name === TO) { console.log(`already "${TO} ${row.last_name}" — nothing to do`); await c.end(); return; }
  if (row.first_name !== FROM) throw new Error(`client ${CLIENT} reads "${row.first_name}", expected "${FROM}"`);

  const [pets]: any = await c.query(
    `SELECT name, breed FROM pets WHERE client_id=? AND tenant_id=?`, [CLIENT, TENANT]);
  console.log(`client ${CLIENT}: "${row.first_name} ${row.last_name}" -> "${TO} ${row.last_name}"`);
  console.log(`   ${row.phone}  ${row.email ?? "(no email)"}  moego ${row.mo}`);
  console.log(`   dogs: ${pets.map((p: any) => `${p.name} (${p.breed ?? "?"})`).join(", ")}`);

  if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); await c.end(); return; }

  const [res]: any = await c.query(
    `UPDATE clients SET first_name=? WHERE id=? AND tenant_id=? AND moego_client_id=? AND first_name=?`,
    [TO, CLIENT, TENANT, MOEGO_ID, FROM]);
  if (res.affectedRows !== 1) throw new Error(`update affected ${res.affectedRows} rows, expected 1`);
  console.log(`\nupdated — client ${CLIENT} is now "${TO} ${row.last_name}"`);
  await c.end();
})();
