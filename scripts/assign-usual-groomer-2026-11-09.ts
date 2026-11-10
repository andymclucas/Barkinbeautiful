/**
 * Give the 107 unassigned upcoming dogs their usual groomer.
 *
 * Found on 09/11/2026 while working through what was left of the MoeGo
 * imports. 107 live upcoming bookings carry no staff_id at all, 104 of
 * them imported from MoeGo. They are not invisible -- the board shows
 * them in the Unassigned column -- but nobody owns them, and the first
 * one arrives tomorrow.
 *
 * It is NOT evenly spread, which is what says this is the import rather
 * than how the salon works:
 *
 *                     completed          upcoming
 *   bath_only     41 of 1009  (4%)    69 of 190  (36%)
 *   classic_groom 584 of 6295 (9%)    20 of 1410 (1%)
 *
 * Baths are nine times worse than their own history. MoeGo names a
 * bather on those bookings and the name did not resolve, so the
 * importer refused to guess -- correctly, per Trap 11.
 *
 * ## The rule, in order
 *
 * Nothing here reads MoeGo. Every answer comes from Groomigo's own
 * completed history, so it needs no session and no export.
 *
 *   1. pets.preferred_groomer_id, when set and that person still works
 *      here. It is a recorded decision by a human and beats any
 *      inference -- Millie's last bath was Charlie, her preferred
 *      groomer is Stephanie, and Stephanie is the right answer.
 *   2. Exactly one groomer in the dog's whole completed history.
 *   3. A clear favourite: one groomer did at least 70% of at least
 *      three completed grooms.
 *   4. Anything else is HELD for a person. A dog groomed by six people
 *      has no usual groomer and inventing one puts it on the wrong
 *      column, which is worse than leaving it on no column.
 *
 * Only `complete` rows count towards history. A scheduled row's groomer
 * is a plan; a completed one is a fact about who can handle that dog.
 * A groomer who has left (is_active = 0) is never suggested.
 *
 * ## What it does not do
 *
 * It does not touch bath_staff_id, the bath queue, capacity or the
 * roster, and it does not move anybody's time. It fills one column on
 * bookings that have nothing in it. A wrong answer is corrected by
 * dragging the dog, which is what staff already do.
 *
 * Nothing is sent: a direct SQL write runs no application code, and no
 * message type here is triggered by a staff change anyway.
 *
 *   corepack pnpm exec tsx scripts/assign-usual-groomer-2026-11-09.ts
 *   corepack pnpm exec tsx scripts/assign-usual-groomer-2026-11-09.ts --apply
 *
 * Baths are skipped by default -- see BATH_SERVICES. Add --include-baths
 * to do them as well, which is a roster decision, not a data one.
 */
import "dotenv/config";
import fs from "node:fs";
import mysql from "mysql2/promise";

const APPLY = process.argv.includes("--apply");
const MIN_SHARE = 0.7;
const MIN_GROOMS = 3;

/**
 * Baths are left alone.
 *
 * Andy, 09/11/2026: "Grooms only, leave the baths."
 *
 * The inference pointed 51 of its 62 answers at Stephanie Baldwin, and 53
 * of them were baths, because she is who did the baths when that history
 * was made. The salon now has four active bathers and three joined
 * afterwards, so filling every bath in with Stephanie would write down a
 * roster that no longer exists.
 *
 * Skipping is the DEFAULT, and the flag turns baths on rather than off. A
 * forgotten flag then leaves 69 baths unassigned, which is the state they
 * are already in, instead of quietly stacking them all on one bather.
 */
const BATH_SERVICES = new Set(["bath_only"]);
const INCLUDE_BATHS = process.argv.includes("--include-baths");

type Candidate = {
  id: number;
  start: string;
  pet: string;
  petId: number;
  client: string;
  service: string;
  staffId: number;
  staffName: string;
  why: string;
};

async function main() {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    timezone: "Z",
  });

  // UTC_TIMESTAMP(), never CURDATE(): CURDATE() is UTC here and reads
  // yesterday before 10am Brisbane.
  const [open] = await c.query<any[]>(
    `SELECT a.id, a.pet_id,
            DATE_FORMAT(CONVERT_TZ(a.scheduled_start,"+00:00","+10:00"),"%a %d/%m %H:%i") start,
            p.name pet, p.preferred_groomer_id pref_id, pref.name pref_name,
            pref.is_active pref_active,
            CONCAT(cl.first_name," ",cl.last_name) client, a.service_type
       FROM appointments a
       JOIN pets p ON p.id = a.pet_id
       JOIN clients cl ON cl.id = a.client_id
       LEFT JOIN staff pref ON pref.id = p.preferred_groomer_id
      WHERE a.workflow_state NOT IN ("cancelled","complete","no_show")
        AND a.status <> "cancelled"
        AND a.staff_id IS NULL
        AND a.scheduled_start >= UTC_TIMESTAMP()
      ORDER BY a.scheduled_start`,
  );
  if (!open.length) {
    console.log("Nothing unassigned. Nothing to do.");
    await c.end();
    return;
  }

  const petIds = [...new Set(open.map((r) => r.pet_id))];
  const [hist] = await c.query<any[]>(
    `SELECT h.pet_id, h.staff_id, s.name, s.is_active, COUNT(*) n
       FROM appointments h JOIN staff s ON s.id = h.staff_id
      WHERE h.pet_id IN (?) AND h.workflow_state = "complete" AND h.staff_id IS NOT NULL
      GROUP BY h.pet_id, h.staff_id, s.name, s.is_active`,
    [petIds],
  );
  const byPet = new Map<number, any[]>();
  for (const row of hist) {
    const list = byPet.get(row.pet_id) ?? [];
    list.push(row);
    byPet.set(row.pet_id, list);
  }

  const assign: Candidate[] = [];
  const held: { id: number; start: string; who: string; why: string }[] = [];
  /** Skipped without being looked at -- the bath roster's call, not this. */
  const baths: { id: number; start: string; who: string }[] = [];

  for (const r of open) {
    const base = {
      id: r.id, start: r.start, pet: r.pet, petId: r.pet_id,
      client: r.client, service: r.service_type,
    };
    const who = `${r.pet} (${r.client})`;

    // Baths, before any inference runs on them -- see BATH_SERVICES.
    if (BATH_SERVICES.has(r.service_type) && !INCLUDE_BATHS) {
      baths.push({ id: r.id, start: r.start, who });
      continue;
    }

    // 1. A human already recorded the answer.
    if (r.pref_id && r.pref_active) {
      assign.push({ ...base, staffId: r.pref_id, staffName: r.pref_name, why: "preferred groomer on the dog" });
      continue;
    }

    const rows = (byPet.get(r.pet_id) ?? []).filter((h) => h.is_active);
    if (!rows.length) {
      held.push({ id: r.id, start: r.start, who, why: r.pref_id && !r.pref_active
        ? `preferred groomer ${r.pref_name} no longer works here, and no other history`
        : "never groomed here by anybody still on staff" });
      continue;
    }

    const total = rows.reduce((sum, h) => sum + Number(h.n), 0);
    rows.sort((a, b) => Number(b.n) - Number(a.n));
    const top = rows[0];

    // 2. Only ever one person.
    if (rows.length === 1) {
      assign.push({ ...base, staffId: top.staff_id, staffName: top.name, why: `only groomer in ${total} groom(s)` });
      continue;
    }

    // 3. A clear favourite.
    const share = Number(top.n) / total;
    if (total >= MIN_GROOMS && share >= MIN_SHARE) {
      assign.push({
        ...base, staffId: top.staff_id, staffName: top.name,
        why: `${top.name} did ${top.n} of ${total} (${Math.round(share * 100)}%)`,
      });
      continue;
    }

    // 4. No usual groomer. Never invent one.
    held.push({
      id: r.id, start: r.start, who,
      why: `no clear favourite: ${rows.map((h) => `${h.name} ${h.n}`).join(", ")}`,
    });
  }

  console.log(`\nunassigned upcoming dogs : ${open.length}`);
  console.log(`would assign             : ${assign.length}`);
  console.log(`held for a person        : ${held.length}`);
  console.log(
    `baths left alone         : ${baths.length}` +
      (INCLUDE_BATHS ? "  (--include-baths given)" : "  (--include-baths to do them too)"),
  );
  console.log("");

  console.table(assign.map((a) => ({
    id: a.id, start: a.start, pet: a.pet, client: a.client,
    service: a.service, groomer: a.staffName, why: a.why,
  })));

  if (held.length) {
    console.log("\nHeld -- these need a person:");
    for (const h of held) console.log(`  ${h.start}  ${h.who}\n      ${h.why}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = `scripts/out/assign-groomer-${stamp}.json`;

  if (!APPLY) {
    fs.mkdirSync("scripts/out", { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ assign, held, baths }, null, 2));
    console.log(`\nDRY RUN. Nothing written to the database. Plan saved to ${out}`);
    console.log("Re-run with --apply to fill them in.\n");
    await c.end();
    return;
  }

  await c.beginTransaction();
  try {
    let changed = 0;
    for (const a of assign) {
      // staff_id IS NULL repeated inside the transaction: if somebody
      // assigned this dog by hand while the dry run was being read, their
      // answer wins and this one is skipped, not overwritten.
      const [res] = await c.query<any>(
        `UPDATE appointments SET staff_id = ?
          WHERE id = ? AND staff_id IS NULL
            AND workflow_state NOT IN ("cancelled","complete","no_show")`,
        [a.staffId, a.id],
      );
      changed += Number(res.affectedRows ?? 0);
    }
    if (changed !== assign.length) {
      // A skip is not an error, but it means the plan that was read is
      // not the plan that ran. Roll back and re-read rather than leaving
      // a partial pass nobody has seen.
      throw new Error(
        `planned ${assign.length} but changed ${changed} -- somebody else has been assigning; rolling back, re-run the dry run`,
      );
    }
    await c.commit();
    fs.mkdirSync("scripts/out", { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ applied: assign, held, baths }, null, 2));
    console.log(`\nAssigned ${changed} dogs. Nothing was texted. Log: ${out}`);
  } catch (err) {
    await c.rollback();
    console.error("\nRolled back:", err);
    process.exitCode = 1;
  }

  const [left] = await c.query<any[]>(
    `SELECT COUNT(*) n FROM appointments
      WHERE workflow_state NOT IN ("cancelled","complete","no_show")
        AND status <> "cancelled" AND staff_id IS NULL
        AND scheduled_start >= UTC_TIMESTAMP()`,
  );
  console.log(`Still unassigned: ${left[0].n}\n`);
  await c.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
