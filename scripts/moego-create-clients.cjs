/**
 * Create the two clients a MoeGo pull found that Groomigo did not have.
 *
 * Checked four ways before concluding they are new — MoeGo id, phone,
 * email and name — because a client sitting here with a NULL
 * moego_client_id has been read as missing before, and creating them
 * again produces a duplicate client, a duplicate pet and a duplicate
 * grooming history for a real customer.
 *
 * Names are capitalised the same way the app's own insert paths do it:
 * first character only, never title-case, which would turn McEwan into
 * Mcewan. Direct SQL bypasses properName, so the rule is applied here.
 *
 * Breed is left null. MoeGo's schedules report does not carry one and
 * inventing it would put a guess on a real dog's record.
 *
 * Dry run by default. --apply commits.
 */
require("dotenv").config({ quiet: true });
const mysql = require("mysql2/promise");

const APPLY = process.argv.includes("--apply");
const TENANT = 1;

/**
 * The people to create live OUTSIDE the repository.
 *
 * Each line is a real customer with their phone number and email, and
 * this repo is on GitHub. Pass a TSV:
 *
 *   moegoClientId <TAB> firstName <TAB> lastName <TAB> phone <TAB> email <TAB> petName
 *
 * Email may be empty. Breed is deliberately not a column: MoeGo's
 * schedules report does not carry one, and inventing it would put a
 * guess on a real dog's record.
 */
const TSV = process.argv.find((a) => a.endsWith(".tsv"));
if (!TSV) {
  console.error("Give the path to a .tsv of people to create (keep it outside the repo).");
  process.exit(1);
}
const PEOPLE = require("fs").readFileSync(TSV, "utf8").trim().split("\n").map((line) => {
  const [moegoId, firstName, lastName, phone, email, pet] = line.split("\t");
  return { moegoId, firstName, lastName, phone, email: email || null, pet };
});

const capitaliseFirst = (v) => (/^[a-z]/.test(v) ? v[0].toUpperCase() + v.slice(1) : v);
const phoneKey = (v) => String(v ?? "").replace(/\D/g, "").slice(-9);

(async () => {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    /**
     * Pin the driver to UTC, or it writes a Date using the MACHINE's
     * timezone. This run learned that the hard way: brisbaneInstant
     * correctly produced 01:30Z for a 11:30 Brisbane booking, mysql2
     * converted it to local time on the way out, and the column stored
     * 11:30 as though it were UTC — every one of 24 appointments
     * landed ten hours late, at 9:30 PM on next week's board.
     *
     * The app itself is unaffected: Drizzle pins this already, which
     * is why bookings made in the UI were correct beside these. It is
     * only direct scripts that have to say so, and the project's note
     * about pinning the timezone was about READING timestamps. It
     * applies just as much to writing them.
     */
    timezone: "Z",
  });

  await c.beginTransaction();
  try {
    for (const p of PEOPLE) {
      // Re-asserted inside the transaction, not just in the earlier
      // check: a concurrent import could have created them since.
      const [existing] = await c.query(
        `SELECT id FROM clients WHERE tenant_id=?
           AND (moego_client_id=? OR RIGHT(REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'+',''),9)=?)
         LIMIT 1`,
        [TENANT, p.moegoId, phoneKey(p.phone)],
      );
      if (existing.length) throw new Error(`${p.firstName} ${p.lastName} already exists as client ${existing[0].id}`);

      const [client] = await c.query(
        `INSERT INTO clients (tenant_id, first_name, last_name, phone, email, status, moego_client_id, created_at, updated_at)
         VALUES (?,?,?,?,?,'active',?,NOW(),NOW())`,
        [TENANT, capitaliseFirst(p.firstName), capitaliseFirst(p.lastName), p.phone, p.email, p.moegoId],
      );
      const clientId = client.insertId;

      const [pet] = await c.query(
        `INSERT INTO pets (tenant_id, client_id, name, status, created_at, updated_at)
         VALUES (?,?,?,'active',NOW(),NOW())`,
        [TENANT, clientId, capitaliseFirst(p.pet)],
      );
      console.log(`  ${p.firstName} ${p.lastName} -> client ${clientId}, pet ${p.pet} -> ${pet.insertId}`);
    }

    if (APPLY) { await c.commit(); console.log("\nCommitted."); }
    else { await c.rollback(); console.log("\nDRY RUN — rolled back. Re-run with --apply."); }
  } catch (e) {
    await c.rollback();
    console.error("ROLLED BACK —", e.message);
    process.exitCode = 1;
  }
  await c.end();
})();
