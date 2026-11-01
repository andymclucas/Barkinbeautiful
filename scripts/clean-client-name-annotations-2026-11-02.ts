/**
 * Move "BANNED" and "DO NOT BOOK" out of client and pet NAMES and into
 * the fields the app actually reads.
 *
 * Andy, 02/11/2026: "clean up the rest."
 *
 *   corepack pnpm exec tsx scripts/clean-client-name-annotations-2026-11-02.ts          # dry run
 *   corepack pnpm exec tsx scripts/clean-client-name-annotations-2026-11-02.ts --apply
 *
 * ## Why this is not just a find-and-replace
 *
 * Twenty-nine clients and thirteen dogs carry an instruction in the
 * name field. The name is the one field that reaches a customer — the
 * board, an invoice, a confirmation, the portal — so "Jane - BANNED
 * Shaw - BANNED" is one emailed invoice away from being seen by Jane
 * Shaw.
 *
 * But that text is load-bearing, and deleting it would be worse than
 * leaving it. What replaces it has to work, and only one of the two
 * candidate homes does:
 *
 * - `clients.status` has a "blocked" value and NOTHING in the app acts
 *   on it. It is read only for counts, campaign audiences and mass-text
 *   recipients, all of which filter on "active". So blocking a client
 *   does not stop a booking — but it DOES take them out of every
 *   marketing audience, which is worth having on its own.
 * - `pets.alertLevel` and `pets.warnings` DO work. `petAlertTone` in
 *   shared/petAlert.ts flags a dog when either field says something,
 *   and the board reads it. A booking is made against a dog, so this
 *   is the field that gets seen at the moment it matters.
 *
 * Hence the shape of this script: the client gets the text as a note
 * and, where it is a genuine ban, the blocked status — and EVERY ONE
 * of that client's dogs gets a real warning, because today most of
 * them carry nothing at all. Rachael Luck is marked BANNED in her own
 * name and all five of her dogs are unflagged; strip her name without
 * flagging them and the ban is simply gone.
 *
 * ## What is NOT treated as a ban
 *
 * Two of the annotations are instructions rather than refusals, and
 * their clients keep their status and get `caution`, not `danger`:
 * "dont book in without paying cancellation fee" is a condition on
 * booking, and "2 GROOMER DOG" is a staffing note about a dog that
 * takes two people.
 *
 * Nothing here decides whether a ban is still wanted. It moves what
 * somebody already wrote into a field that works, and says where it
 * came from.
 *
 * MoeGo still holds every one of these in its own name fields.
 */
import "dotenv/config";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;
const WHEN = "02/11/2026";

type Kind = "ban" | "caution";
type ClientFix = { id: number; f: string; l: string; first: string; last: string; text: string; kind: Kind };
type PetFix = { id: number; from: string; to: string; text: string; kind: Kind };

/** `f`/`l` are asserted before anything changes, so this cannot run twice. */
const CLIENTS: ClientFix[] = [
  { id: 1366, f: "Jo", l: "Witt (dont book in without paying cancellation fee", first: "Jo", last: "Witt", text: "dont book in without paying cancellation fee", kind: "caution" },
  { id: 1454, f: "Felicity BANNED", l: "Willmett BANNED", first: "Felicity", last: "Willmett", text: "BANNED", kind: "ban" },
  { id: 1855, f: "Li DO NOT BOOK", l: "Wadrehu DO NOT BOOK", first: "Li", last: "Wadrehu", text: "DO NOT BOOK", kind: "ban" },
  { id: 1962, f: "Andrew - DONT BOOK", l: "Unsworth - DONT BOOK", first: "Andrew", last: "Unsworth", text: "DONT BOOK", kind: "ban" },
  { id: 1986, f: "Samantha BANNED", l: "Tuziak BANNED", first: "Samantha", last: "Tuziak", text: "BANNED", kind: "ban" },
  { id: 2855, f: "Jane - BANNED", l: "Shaw - BANNED", first: "Jane", last: "Shaw", text: "BANNED", kind: "ban" },
  { id: 3450, f: "Lisa", l: "Reiter - banned", first: "Lisa", last: "Reiter", text: "banned", kind: "ban" },
  { id: 3732, f: "Shierly - BANNED", l: "Phillips - BANNED", first: "Shierly", last: "Phillips", text: "BANNED", kind: "ban" },
  { id: 3982, f: "Cathy", l: "Otto - BANNED", first: "Cathy", last: "Otto", text: "BANNED", kind: "ban" },
  { id: 4328, f: "Gayle BANNED", l: "Munroe BANNED", first: "Gayle", last: "Munroe", text: "BANNED", kind: "ban" },
  { id: 4583, f: "Tara -  2 GROOMER DOG", l: "Mico -  2 GROOMER DOG", first: "Tara", last: "Mico", text: "2 GROOMER DOG", kind: "caution" },
  { id: 4617, f: "Sharlene - BANNED", l: "Meneghello - BANNED", first: "Sharlene", last: "Meneghello", text: "BANNED", kind: "ban" },
  { id: 5008, f: "Kylie", l: "Martin DONT BOOK", first: "Kylie", last: "Martin", text: "DONT BOOK", kind: "ban" },
  { id: 5046, f: "Janelle", l: "Marriott (BANNED)", first: "Janelle", last: "Marriott", text: "BANNED", kind: "ban" },
  { id: 5263, f: "Rachael - BANNED", l: "Luck - BANNED", first: "Rachael", last: "Luck", text: "BANNED", kind: "ban" },
  { id: 5666, f: "Sue - BANNED", l: "Koreman - BANNED", first: "Sue", last: "Koreman", text: "BANNED", kind: "ban" },
  { id: 5895, f: "Yvonne DO NOT BOOK", l: "Kane DO NOT BOOK", first: "Yvonne", last: "Kane", text: "DO NOT BOOK", kind: "ban" },
  { id: 5940, f: "Michelle * banned", l: "Jooste *banned", first: "Michelle", last: "Jooste", text: "banned", kind: "ban" },
  { id: 6364, f: "Melissa BANNED", l: "Inglis- BANNED", first: "Melissa", last: "Inglis", text: "BANNED", kind: "ban" },
  { id: 6372, f: "Melissa", l: "Ingam BANNED", first: "Melissa", last: "Ingam", text: "BANNED", kind: "ban" },
  { id: 7002, f: "Debbie: BANNED", l: "Cavalera: BANNED", first: "Debbie", last: "Cavalera", text: "BANNED", kind: "ban" },
  { id: 7453, f: "Jannie BANNED", l: "Burgess BANNED", first: "Jannie", last: "Burgess", text: "BANNED", kind: "ban" },
  { id: 8222, f: "Emma + Mike", l: "Blackmore - BLACK LISTED - READ NOTES", first: "Emma + Mike", last: "Blackmore", text: "BLACK LISTED - READ NOTES", kind: "ban" },
  { id: 8840, f: "Emma", l: "BANNED Pleass", first: "Emma", last: "Pleass", text: "BANNED", kind: "ban" },
  { id: 8868, f: "Marie DONT BOOK IN", l: "Baker DONT BOOK IN", first: "Marie", last: "Baker", text: "DONT BOOK IN", kind: "ban" },
  { id: 9263, f: "Jay BANNED", l: "Fergersan BANNED", first: "Jay", last: "Fergersan", text: "BANNED", kind: "ban" },
  { id: 9397, f: "Roxanna - BANNED", l: "Fakhra -BANNED", first: "Roxanna", last: "Fakhra", text: "BANNED", kind: "ban" },
  { id: 9864, f: "Sharon and Robert", l: "Denby - BANNED", first: "Sharon and Robert", last: "Denby", text: "BANNED", kind: "ban" },
  { id: 9903, f: "Brooke - BANNED", l: "Dean - BANNED", first: "Brooke", last: "Dean", text: "BANNED", kind: "ban" },
];

/** Dogs whose OWN name carries the instruction. Five belong to owners
 *  whose names are clean, so the flag only ever existed on the dog. */
const PETS: PetFix[] = [
  { id: 2036, from: "Charlie - CHECK NOTES. DONT BOOK", to: "Charlie", text: "CHECK NOTES. DONT BOOK", kind: "ban" },
  { id: 3286, from: "Beethoven - BANNED", to: "Beethoven", text: "BANNED", kind: "ban" },
  { id: 3287, from: "Teddy - BANNED", to: "Teddy", text: "BANNED", kind: "ban" },
  { id: 3663, from: "Bella - BANNED", to: "Bella", text: "BANNED", kind: "ban" },
  { id: 3709, from: "Luna- banned!", to: "Luna", text: "banned", kind: "ban" },
  { id: 5754, from: "Harry - 2 GROOMER DOG", to: "Harry", text: "2 GROOMER DOG", kind: "caution" },
  { id: 5790, from: "Pepe - BANNED", to: "Pepe", text: "BANNED", kind: "ban" },
  { id: 7098, from: "Daisy - BANNED", to: "Daisy", text: "BANNED", kind: "ban" },
  { id: 7389, from: "Piper DO NOT BOOK", to: "Piper", text: "DO NOT BOOK", kind: "ban" },
  { id: 10235, from: "Archie - BLACK LISTED READ NOTES", to: "Archie", text: "BLACK LISTED READ NOTES", kind: "ban" },
  { id: 11324, from: "Prescious- BANNED/DIFFICULT", to: "Prescious", text: "BANNED/DIFFICULT", kind: "ban" },
  { id: 12273, from: "Casper - BANNED", to: "Casper", text: "BANNED", kind: "ban" },
  { id: 12456, from: "Simba - CHECK NOTES FIRST", to: "Simba", text: "CHECK NOTES FIRST", kind: "caution" },
];

const clientNote = (c: ClientFix) =>
  `${WHEN}: "${c.text}" was written into this client's name and has been moved here, ` +
  `so it cannot reach an invoice, a confirmation or the board. ` +
  (c.kind === "ban"
    ? `Status set to blocked, which keeps them out of campaigns and mass texts. ` +
      `Note that blocked does NOT stop a booking — their dogs carry the warning for that. `
    : `Status left as it was: this is a condition on booking, not a refusal. `) +
  `MoeGo still has the original. Nobody has re-checked whether this is still wanted.`;

const petWarning = (text: string, owner: string | null) =>
  `${text}. ` + (owner ? `Owner ${owner} is marked this way in MoeGo; ` : `Written into this dog's own name in MoeGo; `) +
  `moved here ${WHEN} so the board can show it. Check with Lauren before booking.`;

(async () => {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const plan: { sql: string; args: any[]; show: string }[] = [];
  const skipped: string[] = [];
  const petsSeen = new Set<number>();

  for (const fix of CLIENTS) {
    const [[row]]: any = await c.query(
      `SELECT first_name f, last_name l, status, notes FROM clients WHERE id=? AND tenant_id=?`, [fix.id, TENANT]);
    if (!row) { skipped.push(`client ${fix.id}: not found`); continue; }
    if (row.f === fix.first && row.l === fix.last) { skipped.push(`client ${fix.id}: already clean`); continue; }
    if (row.f !== fix.f || row.l !== fix.l) { skipped.push(`client ${fix.id}: reads "${row.f} ${row.l}", not what this expects`); continue; }
    if (row.notes) { skipped.push(`client ${fix.id}: already has a note, left alone`); continue; }

    const status = fix.kind === "ban" ? "blocked" : row.status;
    plan.push({
      sql: `UPDATE clients SET first_name=?, last_name=?, notes=?, status=?
             WHERE id=? AND tenant_id=? AND first_name=? AND last_name=? AND notes IS NULL`,
      args: [fix.first, fix.last, clientNote(fix), status, fix.id, TENANT, fix.f, fix.l],
      show: `client ${String(fix.id).padStart(5)}  "${fix.f} ${fix.l}"\n` +
            `             -> "${fix.first} ${fix.last}"  status ${row.status} -> ${status}  [${fix.text}]`,
    });

    // Every dog of this client gets the warning, because the dog is where
    // the app will actually show it.
    const [dogs]: any = await c.query(
      `SELECT id, name, warnings, alert_level FROM pets WHERE client_id=? AND tenant_id=? AND status='active'`,
      [fix.id, TENANT]);
    for (const d of dogs) {
      if (d.warnings) { skipped.push(`pet ${d.id} (${d.name}): already has a warning, left alone`); continue; }
      const own = PETS.find((p) => p.id === d.id);
      const name = own ? own.to : d.name;
      const text = own ? own.text : fix.text;
      const kind: Kind = own ? own.kind : fix.kind;
      petsSeen.add(d.id);
      plan.push({
        sql: `UPDATE pets SET name=?, warnings=?, alert_level=?
               WHERE id=? AND tenant_id=? AND name=? AND warnings IS NULL`,
        args: [name, petWarning(text, `${fix.first} ${fix.last}`), kind === "ban" ? "danger" : "caution",
               d.id, TENANT, d.name],
        show: `   pet ${String(d.id).padStart(5)}  "${d.name}"${own ? ` -> "${name}"` : ""}  alert ok -> ${kind === "ban" ? "danger" : "caution"}`,
      });
    }
  }

  // Dogs flagged in their own name whose owner's name was clean.
  for (const fix of PETS) {
    if (petsSeen.has(fix.id)) continue;
    const [[row]]: any = await c.query(
      `SELECT p.name, p.warnings, p.alert_level, CONCAT(cl.first_name,' ',cl.last_name) owner
         FROM pets p JOIN clients cl ON cl.id=p.client_id WHERE p.id=? AND p.tenant_id=?`, [fix.id, TENANT]);
    if (!row) { skipped.push(`pet ${fix.id}: not found`); continue; }
    if (row.name === fix.to) { skipped.push(`pet ${fix.id}: already clean`); continue; }
    if (row.name !== fix.from) { skipped.push(`pet ${fix.id}: reads "${row.name}", not what this expects`); continue; }
    if (row.warnings) { skipped.push(`pet ${fix.id}: already has a warning, left alone`); continue; }
    plan.push({
      sql: `UPDATE pets SET name=?, warnings=?, alert_level=?
             WHERE id=? AND tenant_id=? AND name=? AND warnings IS NULL`,
      args: [fix.to, petWarning(fix.text, null), fix.kind === "ban" ? "danger" : "caution", fix.id, TENANT, fix.from],
      show: `pet (owner's name was clean) ${fix.id}  "${fix.from}" -> "${fix.to}"  owner ${row.owner}  alert -> ${fix.kind === "ban" ? "danger" : "caution"}`,
    });
  }

  plan.forEach((p) => console.log(p.show));
  const clientRows = plan.filter((p) => p.sql.startsWith("UPDATE clients")).length;
  console.log(`\n${clientRows} clients, ${plan.length - clientRows} dogs`);
  console.log(`\n=== SKIPPED: ${skipped.length} ===`);
  skipped.forEach((s) => console.log("  " + s));

  if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); await c.end(); return; }

  await c.beginTransaction();
  try {
    for (const p of plan) {
      const [res]: any = await c.query(p.sql, p.args);
      if (res.affectedRows !== 1) throw new Error(`affected ${res.affectedRows}, expected 1 — ${p.show.split("\n")[0]}`);
    }
    await c.commit();
    console.log(`\ncommitted — ${clientRows} clients, ${plan.length - clientRows} dogs`);
  } catch (e: any) {
    await c.rollback();
    console.error("\nROLLED BACK —", e?.message ?? e);
    process.exit(1);
  }
  await c.end();
})();
