/**
 * Put Barkin' Beautiful's three MoeGo staff aliases into the table.
 *
 * They used to be a constant in `shared/moegoStaffAlias.ts`, which made
 * them every tenant's aliases. Migration 0119 moved them to data; this
 * puts the rows in for tenant 1. It is deliberately NOT in the migration,
 * because a migration runs for every salon and these are one salon's staff.
 *
 * Resolved to staff IDs here rather than stored as names, so renaming
 * somebody does not break the alias the way it did on 12/10/2026.
 *
 *   node scripts/seed-moego-staff-aliases-2026-10-14.ts            # dry run
 *   node scripts/seed-moego-staff-aliases-2026-10-14.ts --apply
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { normaliseStaffName } from "../shared/moegoStaffAlias.ts";

const TENANT_ID = 1;

/** MoeGo's name -> the Groomigo staff member it means, by NAME at seed time. */
const ALIASES: Array<{ moegoName: string; staffName: string; why: string }> = [
  { moegoName: "Megan Graham", staffName: "Megs Graham",
    why: "Neither string contains the other, so a substring match misses it" },
  { moegoName: "Bather 1", staffName: "Stephanie Baldwin",
    why: "MoeGo's bathing login; 383 occurrences across the exports" },
  { moegoName: "Bather", staffName: "Stephanie Baldwin",
    why: "Same person, as MoeGo's booking-detail pages write it" },
];

async function main() {
  const apply = process.argv.includes("--apply");
  const db = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const [staff] = await db.query<any[]>(
    "SELECT id, name, is_active FROM staff WHERE tenant_id = ?", [TENANT_ID]);
  const [existing] = await db.query<any[]>(
    "SELECT moego_name, staff_id FROM moego_staff_aliases WHERE tenant_id = ?", [TENANT_ID]);
  const already = new Map(existing.map((r) => [r.moego_name, r.staff_id]));

  const planned: { moegoName: string; staffId: number; staffName: string; why: string }[] = [];
  const problems: string[] = [];

  for (const alias of ALIASES) {
    const member = staff.find((s) => normaliseStaffName(s.name) === normaliseStaffName(alias.staffName));
    if (!member) { problems.push(`"${alias.staffName}" is not on the roster — alias "${alias.moegoName}" skipped`); continue; }
    if (!member.is_active) { problems.push(`"${alias.staffName}" has left — alias "${alias.moegoName}" skipped`); continue; }
    const key = normaliseStaffName(alias.moegoName);
    if (already.has(key)) {
      const at = already.get(key);
      if (at !== member.id) problems.push(`"${alias.moegoName}" already points at staff #${at}, not #${member.id} — left alone`);
      continue;
    }
    planned.push({ moegoName: key, staffId: member.id, staffName: member.name, why: alias.why });
  }

  console.log(`\n${apply ? "APPLYING" : "DRY RUN"}  (tenant ${TENANT_ID})\n`);
  console.log(`  ${existing.length} alias(es) already on file`);
  for (const p of planned) {
    console.log(`  + "${p.moegoName}" -> ${p.staffName} (#${p.staffId})`);
    console.log(`      ${p.why}`);
  }
  if (planned.length === 0) console.log("  nothing to add");
  for (const p of problems) console.log(`  ! ${p}`);

  if (!apply || planned.length === 0) {
    if (!apply) console.log("\nNothing written. Re-run with --apply.\n");
    await db.end();
    return;
  }

  await db.beginTransaction();
  try {
    for (const p of planned) {
      const [res] = await db.query<any>(
        `INSERT INTO moego_staff_aliases (tenant_id, moego_name, staff_id) VALUES (?, ?, ?)`,
        [TENANT_ID, p.moegoName, p.staffId]);
      if (res.affectedRows !== 1) throw new Error(`insert for "${p.moegoName}" touched ${res.affectedRows} rows`);
    }
    await db.commit();
    console.log(`\nDone: ${planned.length} alias(es) added.\n`);
  } catch (error) {
    await db.rollback();
    console.error("\nRolled back, nothing changed:", error);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
