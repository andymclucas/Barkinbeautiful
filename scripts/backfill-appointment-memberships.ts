/**
 * Link existing bookings to the membership that covers them.
 *
 * `appointments.membership_id` is set by the create paths, but only 4 of
 * 15,544 live appointments carry it: 3,005 bookings for member dogs came
 * across from MoeGo, whose importer never set it, and the rest predate or
 * missed the coverage lookup.
 *
 * That link is not cosmetic. It is how the system knows a groom is
 * already paid for by the weekly fee, so without it a membership groom
 * looks like an unpaid appointment — and it is why 21 "X2" memberships
 * read as dormant.
 *
 * ## What it will and will not touch
 *
 * It applies exactly the rule the booking screen applies
 * (`resolveAppointmentMembershipCoverage`): a classic groom is covered by
 * a classic or styled plan, a styled groom only by a styled plan, and
 * nothing else is covered. Baths, tidies, desheds and nail trims are left
 * alone, because a membership does not cover them.
 *
 * It only ever fills a NULL. An appointment already pointing at a
 * membership is never repointed — if one is wrong, that is a decision for
 * a person, not a bulk update.
 *
 * It deliberately does NOT change price. Zeroing a historical groom would
 * rewrite what the salon billed, and several of these have invoices
 * against them. Linking says which membership covers it; it does not
 * restate the money.
 *
 *   node --import tsx scripts/backfill-appointment-memberships.ts
 *   node --import tsx scripts/backfill-appointment-memberships.ts --apply
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { resolveAppointmentMembershipCoverage, type AppointmentService, type ActivePetMembership }
  from "../shared/appointmentMembershipCoverage";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;

async function main() {
  const db = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    timezone: "Z",
  });

  const [appointments] = await db.query<any[]>(
    `SELECT id, client_id, pet_id, service_type, scheduled_start
       FROM appointments
      WHERE tenant_id=? AND membership_id IS NULL AND pet_id IS NOT NULL
        AND status <> 'cancelled' AND workflow_state <> 'cancelled'`, [TENANT]);

  const [memberships] = await db.query<any[]>(
    `SELECT id, pet_id, client_id, name, tier, service_type, status, booking_suspended
       FROM memberships WHERE tenant_id=? AND status='active'`, [TENANT]);

  const byPet = new Map<number, ActivePetMembership[]>();
  for (const m of memberships) {
    const row: ActivePetMembership = {
      id: m.id, petId: m.pet_id, name: m.name, tier: m.tier,
      serviceType: m.service_type, status: m.status,
      bookingSuspended: Boolean(m.booking_suspended),
    };
    byPet.set(m.pet_id, [...(byPet.get(m.pet_id) ?? []), row]);
  }

  const plan: { id: number; membershipId: number }[] = [];
  const byService = new Map<string, number>();
  for (const appt of appointments) {
    const candidates = byPet.get(appt.pet_id);
    if (!candidates) continue;
    // Only memberships belonging to the same client, exactly as the
    // booking screen's lookup does.
    const mine = candidates.filter((m) => m.petId === appt.pet_id
      && memberships.find((raw) => raw.id === m.id)?.client_id === appt.client_id);
    if (mine.length === 0) continue;
    const coverage = resolveAppointmentMembershipCoverage(
      [appt.pet_id], appt.service_type as AppointmentService, mine);
    const covering = coverage.membershipByPetId[appt.pet_id];
    if (!covering) continue;
    plan.push({ id: appt.id, membershipId: covering.id });
    byService.set(appt.service_type, (byService.get(appt.service_type) ?? 0) + 1);
  }

  console.log(`${APPLY ? "APPLY" : "DRY RUN"} — ${appointments.length} unlinked live appointments considered`);
  console.log(`  ${memberships.length} active memberships across ${byPet.size} dogs`);
  console.log(`  ${plan.length} would be linked:`);
  for (const [service, n] of [...byService].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${service.padEnd(16)} ${n}`);
  }

  if (!APPLY) {
    console.log("\nnothing written. Re-run with --apply to write.");
    await db.end();
    return;
  }

  await db.beginTransaction();
  try {
    let written = 0;
    for (const row of plan) {
      // Guarded on still-NULL, so a link added between the read and the
      // write is never overwritten.
      const [res] = await db.query<any>(
        "UPDATE appointments SET membership_id=? WHERE id=? AND membership_id IS NULL AND tenant_id=?",
        [row.membershipId, row.id, TENANT]);
      written += res.affectedRows;
    }
    if (written !== plan.length) {
      throw new Error(`expected to write ${plan.length}, wrote ${written} — rolling back`);
    }
    await db.commit();
    console.log(`\nCOMMITTED — ${written} appointments linked.`);
  } catch (err) {
    await db.rollback();
    console.error("\nROLLED BACK:", (err as Error).message);
    process.exitCode = 1;
  }
  await db.end();
}

main();
