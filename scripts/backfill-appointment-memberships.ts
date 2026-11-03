/**
 * Link existing bookings to the membership that covers them.
 *
 * `appointments.membership_id` is set by the create paths, but bookings
 * that came across from MoeGo never got one — its importer did not set
 * it, and all 151 active plans were created on the import day itself.
 *
 * That link is not cosmetic. It is how the system knows a groom is
 * already paid for by the weekly fee, so without it a membership groom
 * looks like an unpaid appointment — and it is why 21 "X2" memberships
 * read as dormant.
 *
 * ## State on 04/11/2026
 *
 * Still 527 live bookings for member dogs with no link, of which 232
 * are for a service a plan actually covers and are what this will set:
 * 184 upcoming, 48 past (41 of those already priced $0, 7 carrying a
 * price). The other 295 are baths, tidies, desheds and nail trims,
 * which no plan covers, and are correctly left alone.
 *
 * Andy asked for this after the VIP disc showed the gap from the other
 * side: the workflow board marks a dog on a plan, the calendar marks a
 * booking linked to one, and the two disagreed on 188 upcoming
 * bookings. The board was right and the calendar was under-marking —
 * the dogs are members, the link is simply missing. Filling it is what
 * makes the two agree without either rule being bent.
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
    // Without these a dropped socket is not an error, it is a wait that
    // never ends. The first run of this script sat for 29 minutes having
    // used 1.5 seconds of CPU, its connection idle, holding a
    // transaction open against production. Fail fast instead.
    connectTimeout: 20_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 5_000,
  });

  const [appointments] = await db.query<any[]>(
    `SELECT id, client_id, pet_id, service_type, scheduled_start
       FROM appointments
      WHERE tenant_id=? AND membership_id IS NULL AND pet_id IS NOT NULL
        AND status <> 'cancelled' AND workflow_state <> 'cancelled'`, [TENANT]);

  const [memberships] = await db.query<any[]>(
    `SELECT id, pet_id, client_id, name, tier, service_type, status, booking_suspended
       FROM memberships WHERE tenant_id=? AND status='active'`, [TENANT]);

  /**
   * The OTHER dogs each plan covers.
   *
   * This script used to read `memberships.pet_id` alone and index only
   * that dog, which meant the second and third dogs on an "x2"/"x3"
   * plan were never candidates and so were never linked. That is
   * exactly the bug Lauren reported on 28/10/2026 about the VIP badge,
   * living on in the backfill.
   *
   * It was harmless when this was written, and is not now:
   * `membership_pets` held 0 rows across 151 active plans then and
   * holds 56 across 26 today, because the x2/x3 dogs have since been
   * assigned. 107 of the 527 unlinked bookings for member dogs belong
   * to a dog that is on its plan ONLY through this table.
   */
  const [coveredRows] = await db.query<any[]>(
    `SELECT mp.membership_id, mp.pet_id
       FROM membership_pets mp
       JOIN memberships m ON m.id = mp.membership_id
      WHERE mp.tenant_id=? AND m.status='active'`, [TENANT]);
  const coveredByMembership = new Map<number, number[]>();
  for (const r of coveredRows) {
    coveredByMembership.set(r.membership_id, [...(coveredByMembership.get(r.membership_id) ?? []), r.pet_id]);
  }

  const clientByMembership = new Map<number, number>();
  const byPet = new Map<number, ActivePetMembership[]>();
  for (const m of memberships) {
    const row: ActivePetMembership = {
      id: m.id, petId: m.pet_id, name: m.name, tier: m.tier,
      serviceType: m.service_type, status: m.status,
      bookingSuspended: Boolean(m.booking_suspended),
      coveredPetIds: coveredByMembership.get(m.id) ?? [],
    };
    clientByMembership.set(m.id, m.client_id);
    // Indexed under EVERY dog the plan touches, primary and assigned,
    // so a covered dog can find its plan at all.
    for (const petId of new Set<number>([m.pet_id, ...(row.coveredPetIds ?? [])])) {
      if (typeof petId !== "number" || !Number.isFinite(petId)) continue;
      byPet.set(petId, [...(byPet.get(petId) ?? []), row]);
    }
  }

  const plan: { id: number; membershipId: number }[] = [];
  const byService = new Map<string, number>();
  for (const appt of appointments) {
    const candidates = byPet.get(appt.pet_id);
    if (!candidates) continue;
    /*
     * Only memberships belonging to the same client, exactly as the
     * booking screen's lookup does.
     *
     * No longer also requires the dog to be the plan's PRIMARY: the
     * index above already guarantees the plan touches this dog, and
     * requiring it was what excluded every assigned dog.
     * resolveAppointmentMembershipCoverage then settles which plan
     * wins, primary before assigned, which is its own documented rule.
     */
    const mine = candidates.filter((m) => clientByMembership.get(m.id) === appt.client_id);
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

  /**
   * One statement per membership, not one per appointment.
   *
   * The first version issued 2,465 separate UPDATEs. Each is a round
   * trip to TiDB at roughly 200ms, so the transaction stayed open for
   * half an hour and the connection died under it — nothing was written,
   * which is the transaction working, but nothing was achieved either.
   *
   * Grouping by the membership being written collapses that to about
   * 140 statements. The per-row guard survives intact: the WHERE still
   * carries `membership_id IS NULL`, so a link added between the read
   * and the write is never overwritten, and the affected-row count is
   * still asserted against the plan.
   */
  const idsByMembership = new Map<number, number[]>();
  for (const row of plan) {
    idsByMembership.set(row.membershipId, [...(idsByMembership.get(row.membershipId) ?? []), row.id]);
  }

  await db.beginTransaction();
  try {
    let written = 0;
    for (const [membershipId, ids] of idsByMembership) {
      // Chunked so one membership with a long history cannot build a
      // statement too large to send.
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const [res] = await db.query<any>(
          `UPDATE appointments SET membership_id=?
            WHERE id IN (${chunk.map(() => "?").join(",")})
              AND membership_id IS NULL AND tenant_id=?`,
          [membershipId, ...chunk, TENANT]);
        written += res.affectedRows;
      }
    }
    if (written !== plan.length) {
      throw new Error(`expected to write ${plan.length}, wrote ${written} — rolling back`);
    }
    await db.commit();
    console.log(`\nCOMMITTED — ${written} appointments linked in ${idsByMembership.size} statements.`);
  } catch (err) {
    await db.rollback();
    console.error("\nROLLED BACK:", (err as Error).message);
    process.exitCode = 1;
  }
  await db.end();
}

main();
