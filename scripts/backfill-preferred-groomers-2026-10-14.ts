/**
 * Fill in each dog's usual groomer from who has actually groomed it.
 *
 * `pets.preferred_groomer_id` is empty on all 12,552 dogs, so the booking
 * dialog's new default does nothing. The salon already knows the answer for
 * most dogs — Minnie has been Stephanie 49 times out of 50 — it just lives
 * in grooming history rather than on the dog's file.
 *
 * The rule for "decisive enough to write down" is
 * shared/preferredGroomerFromHistory.ts, with its own tests. It is strict on
 * purpose: an empty preference costs a groomer one dropdown, a WRONG one
 * quietly books a dog with the wrong person on every future booking.
 *
 * Only ever fills a gap. A dog whose preference somebody has already set by
 * hand is left alone, whatever the history says.
 *
 *   node scripts/backfill-preferred-groomers-2026-10-14.ts            # dry run
 *   node scripts/backfill-preferred-groomers-2026-10-14.ts --apply
 *   node scripts/backfill-preferred-groomers-2026-10-14.ts --verbose  # list refusals too
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import {
  describeHistoryVerdict,
  preferredGroomerFromHistory,
} from "../shared/preferredGroomerFromHistory.ts";

const TENANT_ID = 1;

async function main() {
  const apply = process.argv.includes("--apply");
  const verbose = process.argv.includes("--verbose");
  const db = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const [staffRows] = await db.query<any[]>(
    "SELECT id, name, is_active FROM staff WHERE tenant_id = ?",
    [TENANT_ID],
  );
  const activeStaffIds = staffRows.filter((s) => s.is_active).map((s) => s.id);
  const nameOf = (id: number) => staffRows.find((s) => s.id === id)?.name ?? `#${id}`;

  // Only dogs with nothing set. The guard is in the WHERE rather than in the
  // loop so a dog that gains a preference while this runs is never touched.
  const [pets] = await db.query<any[]>(
    `SELECT p.id, p.name, c.first_name, c.last_name
       FROM pets p
       LEFT JOIN clients c ON c.id = p.client_id
      WHERE p.tenant_id = ? AND p.preferred_groomer_id IS NULL
        AND (p.status IS NULL OR p.status <> 'departed')
        -- A test dog's fixture grooms are not evidence about anybody. Link
        -- was skipped only because one groom is under the three-groom
        -- floor; a couple more preview tests and this would have written a
        -- confident preference out of fiction.
        AND p.is_test = FALSE`,
    [TENANT_ID],
  );

  // One query for every completed groom, rather than one per dog: 12,000
  // round trips to TiDB is minutes of waiting for a report somebody is
  // reading in one sitting.
  const [grooms] = await db.query<any[]>(
    `SELECT pet_id, staff_id, scheduled_start
       FROM appointments
      WHERE tenant_id = ? AND staff_id IS NOT NULL AND workflow_state = 'complete'
        AND pet_id NOT IN (SELECT id FROM pets WHERE is_test = TRUE)`,
    [TENANT_ID],
  );
  const byPet = new Map<number, { staffId: number; at: Date }[]>();
  for (const row of grooms) {
    const list = byPet.get(row.pet_id) ?? [];
    list.push({ staffId: row.staff_id, at: new Date(row.scheduled_start) });
    byPet.set(row.pet_id, list);
  }

  const decided: { petId: number; label: string; staffId: number; why: string }[] = [];
  const refused: { label: string; why: string }[] = [];

  for (const pet of pets) {
    const verdict = preferredGroomerFromHistory({
      grooms: byPet.get(pet.id) ?? [],
      activeStaffIds,
    });
    const label = `${pet.name} (${[pet.first_name, pet.last_name].filter(Boolean).join(" ")})`;
    if (verdict.ok) {
      decided.push({ petId: pet.id, label, staffId: verdict.staffId, why: describeHistoryVerdict(verdict, nameOf) });
    } else {
      refused.push({ label, why: describeHistoryVerdict(verdict, nameOf) });
    }
  }

  console.log(`\n${apply ? "APPLYING" : "DRY RUN"}\n`);
  console.log(`  ${pets.length} dogs with no usual groomer set`);
  console.log(`  ${decided.length} decided from history`);
  console.log(`  ${refused.length} left alone\n`);

  const perGroomer = new Map<number, number>();
  for (const d of decided) perGroomer.set(d.staffId, (perGroomer.get(d.staffId) ?? 0) + 1);
  console.log("  Would set:");
  for (const [staffId, count] of Array.from(perGroomer.entries()).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(count).padStart(5)}  ${nameOf(staffId)}`);
  }

  console.log("\n  Sample:");
  for (const d of decided.slice(0, 15)) console.log(`    ${d.label.padEnd(42)} ${d.why}`);

  if (verbose) {
    const reasons = new Map<string, number>();
    for (const r of refused) {
      const kind = r.why.split("(")[0].split("—")[0].trim();
      reasons.set(kind, (reasons.get(kind) ?? 0) + 1);
    }
    console.log("\n  Left alone, by reason:");
    for (const [kind, count] of Array.from(reasons.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${String(count).padStart(5)}  ${kind}`);
    }
  }

  if (!apply) {
    console.log("\nNothing written. Re-run with --apply.\n");
    await db.end();
    return;
  }

  await db.beginTransaction();
  try {
    let written = 0;
    for (const d of decided) {
      // The IS NULL guard is repeated here on purpose: between the SELECT
      // above and this UPDATE somebody may have set it on the floor, and
      // their choice beats this script's inference.
      const [res] = await db.query<any>(
        `UPDATE pets SET preferred_groomer_id = ?
          WHERE id = ? AND tenant_id = ? AND preferred_groomer_id IS NULL`,
        [d.staffId, d.petId, TENANT_ID],
      );
      written += res.affectedRows;
    }
    if (written !== decided.length) {
      // Not an error worth rolling back for — a dog gaining a preference
      // mid-run is exactly what the guard is for — but it must be said.
      console.log(`\n  note: ${decided.length - written} dog(s) gained a preference while this ran and were left alone.`);
    }
    await db.commit();
    console.log(`\nDone: ${written} dogs now have a usual groomer.\n`);
  } catch (error) {
    await db.rollback();
    console.error("\nRolled back, nothing changed:", error);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
