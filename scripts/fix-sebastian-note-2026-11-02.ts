/**
 * Sebastian's note describes a gap that was closed the same day.
 *
 * Andy, 02/11/2026: "Fix the note on Sebastian."
 *
 * It was written when `blocked` was the only signal, and it ends:
 *
 *     ...it does NOT stop a booking, so the warning on the dog is what
 *     staff will actually see.
 *
 * True of the client page, false of the booking dialog, which showed
 * nothing at all — and that is exactly what was fixed hours later. So
 * the note now understates the guard it is describing, and the clause
 * pointing at the dog sends staff somewhere they no longer need to go.
 *
 * Still worth saying that `blocked` alone stops no booking. That is a
 * property of the column, not of today's fix, and the next person
 * reading this record should not assume the status is doing work it
 * does not do.
 *
 *   corepack pnpm exec tsx scripts/fix-sebastian-note-2026-11-02.ts
 *   corepack pnpm exec tsx scripts/fix-sebastian-note-2026-11-02.ts --apply
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;
const CLIENT = 10048;

/** The exact text being replaced, so a changed note aborts rather than clobbers. */
const EXPECTED =
  "02/11/2026: blacklisted. MoeGo's pet note reads \"VERY RUDE! DO NOT BOOK IN / " +
  "BLACK LISTED\", and the dog's name carried \"CHECK NOTES FIRST\" pointing at it. " +
  "Tagged BANNED and DONT BOOK IN in MoeGo the same day. Status set to blocked, " +
  "which keeps them out of campaigns and mass texts — it does NOT stop a booking, " +
  "so the warning on the dog is what staff will actually see.";

const NOTE =
  "02/11/2026: blacklisted. MoeGo's pet note reads \"VERY RUDE! DO NOT BOOK IN / " +
  "BLACK LISTED\", and the dog's name carried \"CHECK NOTES FIRST\" pointing at it. " +
  "Tagged BANNED and DONT BOOK IN in MoeGo the same day. Status set to blocked, " +
  "which keeps them out of campaigns and mass texts. Note that the status alone " +
  "stops no booking — but since 02/11/2026 both booking dialogs warn before an " +
  "appointment is written, naming this block and Simba's own danger alert, so " +
  "nobody can book him without being told.";

(async () => {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const [[row]]: any = await c.query(
    `SELECT CONCAT(first_name,' ',last_name) nm, status, notes FROM clients WHERE id=? AND tenant_id=?`,
    [CLIENT, TENANT]);
  if (!row) throw new Error("client not found");
  if (row.status !== "blocked") throw new Error(`status is "${row.status}" — expected blocked`);
  if (row.notes !== EXPECTED) {
    throw new Error("the note is not the text this script was written against — somebody edited it; re-read before replacing");
  }

  console.log(`${row.nm} (status ${row.status})`);
  console.log(`\nwas:\n${row.notes}`);
  console.log(`\nnow:\n${NOTE}`);

  if (!APPLY) { console.log("\nDRY RUN — nothing written."); await c.end(); return; }

  const [r]: any = await c.query(
    `UPDATE clients SET notes=? WHERE id=? AND tenant_id=? AND status='blocked' AND notes=?`,
    [NOTE, CLIENT, TENANT, EXPECTED]);
  if (r.affectedRows !== 1) throw new Error(`affected ${r.affectedRows} rows`);
  console.log("\ncommitted — note updated, status and the dog untouched");
  await c.end();
})();
