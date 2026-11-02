/**
 * Sebastian Cutugno is blacklisted, and Groomigo said "caution".
 *
 * Andy, 02/11/2026: "Fix Harry and Simba's dog names."
 *
 * Simba's MoeGo name was "Simba - CHECK NOTES FIRST". Earlier the same
 * day that was filed as an operational instruction and moved to the dog
 * as a `caution` — which is what it looks like, until you read the notes
 * it points at:
 *
 *     VERY RUDE! DO NOT BOOK IN
 *     BLACK LISTED
 *
 * So the name was a pointer to a ban, the client carried no tag in
 * either system, and Groomigo had him `active` with a mild warning on
 * the dog. That is the opposite of what the salon decided. A pointer to
 * notes is worth no more than the notes behind it, and the only way to
 * know is to read them.
 *
 *   corepack pnpm exec tsx scripts/fix-blacklisted-client-2026-11-02.ts          # dry run
 *   corepack pnpm exec tsx scripts/fix-blacklisted-client-2026-11-02.ts --apply
 *
 * MoeGo has been corrected already: Sebastian now carries BANNED and
 * DONT BOOK IN, and the dog is plain "Simba". This brings Groomigo into
 * line — blocked client, danger on the dog, and the real wording rather
 * than a pointer to a note Groomigo does not have.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;
const CLIENT = 10048;
const PET = 12456;
const NOTE =
  "02/11/2026: blacklisted. MoeGo's pet note reads \"VERY RUDE! DO NOT BOOK IN / " +
  "BLACK LISTED\", and the dog's name carried \"CHECK NOTES FIRST\" pointing at it. " +
  "Tagged BANNED and DONT BOOK IN in MoeGo the same day. Status set to blocked, " +
  "which keeps them out of campaigns and mass texts — it does NOT stop a booking, " +
  "so the warning on the dog is what staff will actually see.";
const WARNING =
  "DO NOT BOOK IN — blacklisted. From MoeGo's own pet note (\"VERY RUDE! DO NOT " +
  "BOOK IN / BLACK LISTED\"), moved here 02/11/2026. Check with Lauren before booking.";

(async () => {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const [[client]]: any = await c.query(
    `SELECT id, CONCAT(first_name,' ',last_name) nm, status, notes FROM clients WHERE id=? AND tenant_id=?`,
    [CLIENT, TENANT]);
  const [[pet]]: any = await c.query(
    `SELECT id, name, alert_level alertLevel, warnings FROM pets WHERE id=? AND tenant_id=?`, [PET, TENANT]);
  if (!client || !pet) throw new Error("client or pet not found");
  if (pet.name !== "Simba") throw new Error(`pet ${PET} is "${pet.name}", not Simba`);

  const [upcoming]: any = await c.query(
    `SELECT COUNT(*) n FROM appointments WHERE tenant_id=? AND client_id=?
       AND scheduled_start > NOW() AND workflow_state NOT IN ('cancelled','no_show')`, [TENANT, CLIENT]);

  console.log(`${client.nm}: status ${client.status} -> blocked`);
  console.log(`   ${pet.name}: alert ${pet.alertLevel} -> danger`);
  console.log(`   was: ${pet.warnings ?? "(none)"}`);
  console.log(`   now: ${WARNING}`);
  console.log(`   upcoming bookings: ${upcoming[0].n}${upcoming[0].n ? "  ** one is already on the board **" : ""}`);

  if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); await c.end(); return; }

  await c.beginTransaction();
  try {
    const [a]: any = await c.query(
      `UPDATE clients SET status='blocked', notes=? WHERE id=? AND tenant_id=? AND status='active'`,
      [NOTE, CLIENT, TENANT]);
    if (a.affectedRows !== 1) throw new Error(`client update affected ${a.affectedRows}`);
    const [b]: any = await c.query(
      `UPDATE pets SET alert_level='danger', warnings=? WHERE id=? AND tenant_id=? AND name='Simba'`,
      [WARNING, PET, TENANT]);
    if (b.affectedRows !== 1) throw new Error(`pet update affected ${b.affectedRows}`);
    await c.commit();
    console.log("\ncommitted — client blocked, dog flagged danger");
  } catch (e: any) {
    await c.rollback();
    console.error("\nROLLED BACK —", e?.message ?? e);
    process.exit(1);
  }
  await c.end();
})();
