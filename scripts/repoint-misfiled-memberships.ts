/**
 * Move a membership onto the dog it was always for.
 *
 * Lauren, 06/11/2026: "effie & dusty aren't showing as membership."
 * Scott Barker holds two Silver VIP Styled plans, $31 and $28 a week,
 * and the MoeGo import gave BOTH of them `pet_id = 89` (Dusty). Effie
 * is on neither, and has no `membership_pets` row either.
 *
 * It is not one household. Ten clients hold more than one active plan
 * and NINE of them have every plan filed under the same dog — always
 * the same shape, two weight bands on dog #1 and nothing on dog #2.
 *
 * ## Why this is a script and not a screen
 *
 * There is no way to do it in the app, and both of the obvious routes
 * are closed on purpose:
 *
 * - `setCoveredPets` refuses. The plan is priced for one dog, so adding
 *   a second makes one fee cover two. Its own error says what to do:
 *   "If the plan is filed under the wrong dog, change that first."
 * - `manageDepartedPet` is the only code that writes
 *   `memberships.pet_id`, and it requires the current dog to be
 *   DEPARTED and the replacement to be in the SAME weight band. Every
 *   dog here is alive, and the bands differ — that is the whole point.
 *
 * That weight-band rule is deliberately NOT applied here. It exists to
 * stop a plan priced for a small dog being carried onto a large one
 * when a dog dies, which is a new decision about money. This is a
 * filing correction: the fee, the tier and the band are unchanged and
 * the plan was always this dog's. So the bands are PRINTED as evidence
 * for the person reading the output, and never used to block.
 *
 * ## What it does and does not touch
 *
 * One column, `memberships.pet_id`, plus an audit row per move. It
 * never touches `price_per_cycle`, `status`, `tier`, `service_type`,
 * any appointment, or any invoice. The weekly money does not move.
 *
 * Linking the existing bookings is a SEPARATE job — run
 * `scripts/backfill-appointment-memberships.ts` afterwards, or the 21
 * upcoming grooms for these dogs keep `membership_id = NULL` and the
 * gold VIP disc stays off.
 *
 * ## Re-running is safe
 *
 * Each entry is checked against the live row before anything is
 * written. A plan already sitting on its target is reported as done and
 * skipped; a plan sitting on neither the old nor the new dog aborts the
 * whole run, because somebody else has moved it and this script's table
 * is then out of date. So the three undecided entries can be filled in
 * later and the script re-run without disturbing the six.
 *
 *   node --import tsx scripts/repoint-misfiled-memberships.ts
 *   node --import tsx scripts/repoint-misfiled-memberships.ts --apply
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { getReplacementWeightBand } from "../shared/departedPetMembership";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;

type Correction = {
  membershipId: number;
  clientId: number;
  /** The dog the plan is on now. Checked before anything is written. */
  fromPetId: number;
  /** The dog it belongs to. NULL until a human decides. */
  toPetId: number | null;
  /** Everything below is for the person reading the output, not for logic. */
  client: string;
  plan: string;
  why: string;
};

/**
 * Six are settled by the weight band: the household's second dog sits
 * in the band the plan names, and the first dog sits in the other
 * plan's band. Three are not, and are left NULL rather than guessed —
 * the dogs' own booking history was checked on 06/11/2026 and does not
 * settle any of them either.
 *
 * Pricing is never decided from a plan name (shared/membershipCoveredPets
 * is explicit about that). The name is being used here to identify WHICH
 * of a client's two plans is which, with the fee unchanged either way —
 * not to decide what anybody pays.
 */
const CORRECTIONS: Correction[] = [
  {
    membershipId: 29, clientId: 75, fromPetId: 166, toPetId: 167,
    client: "Carole Adams", plan: "Silver VIP Classic - Small (0-10kg) $17.00",
    why: "Spencer is 7.3kg (small); Charlie is 11.1kg and keeps the SML-MED plan.",
  },
  {
    membershipId: 18, clientId: 39, fromPetId: 89, toPetId: 90,
    client: "Scott Barker", plan: "Silver VIP Styled - SML-MED (11-13kg) $28.00",
    why: "Effie is 13.0kg (small-medium); Dusty is 20.0kg and keeps the MED plan.",
  },
  {
    membershipId: 6, clientId: 21, fromPetId: 48, toPetId: 49,
    client: "Carly Herbert", plan: "Gold VIP Styled - SML-MED (11-13kg) $30.00",
    why: "Lily is 13.2kg; Alfie is 6.7kg and keeps the SML plan.",
  },
  {
    membershipId: 25, clientId: 60, fromPetId: 134, toPetId: 135,
    client: "Lynnette Matuschka", plan: "Gold VIP Classic - SML-MED (11-13kg) $26.00",
    why: "Jackson is 14.2kg; Elle-May is 9.0kg and keeps the Small plan.",
  },
  {
    membershipId: 35, clientId: 85, fromPetId: 182, toPetId: 183,
    client: "Stellina Popplewell", plan: "Silver VIP Classic - SML-MED (11-13kg) $22.00",
    why: "Luna is 12.8kg (small-medium); Freddi is 15.2kg and keeps the MED plan.",
  },
  {
    membershipId: 8, clientId: 25, fromPetId: 57, toPetId: 58,
    client: "Tricia Taylor", plan: "Gold VIP Styled - SML-MED (11-13kg) $30.00",
    why: "Lily is small-medium; Gracie is small and keeps the SML plan.",
  },

  // ── Undecided. Fill in toPetId and re-run. ──────────────────────────
  {
    membershipId: 16, clientId: 38, fromPetId: 87, toPetId: null,
    client: "Sonia Condon", plan: "Bronze VIP Classic - MED (14-16kg) $24.00",
    why: "Harvey is pet 88. Both dogs are LARGE — Ella 17.0kg, Harvey 22.0kg — so"
      + " MED (14-16kg) fits neither and the band cannot choose. Both dogs are"
      + " classic-only, so service type cannot either. Needs MoeGo or Andy.",
  },
  {
    membershipId: 21, clientId: 46, fromPetId: 103, toPetId: null,
    client: "Selina Robson", plan: "Silver VIP Styled - SML (0-10kg) $22.00",
    why: "Rocky is pet 104. Both dogs are small with no weight on file. The split"
      + " should be by service, but Archie has 22 classic grooms to 1 styled and"
      + " Rocky 3 to 1 — neither is a styled dog. Needs MoeGo or Andy.",
  },
  {
    membershipId: 12, clientId: 28, fromPetId: 66, toPetId: null,
    client: "Nicki Waldon", plan: "Gold VIP Styled - SML (0-10kg) $26.00",
    why: "Snickers is pet 67. Chester 4.0kg and Snickers 5.0kg are both small, and"
      + " NEITHER dog has ever had a styled groom, so the Styled plan matches no"
      + " history at all. Needs MoeGo or Andy.",
  },
];

type PetRow = { id: number; name: string; client_id: number; status: string; weight_kg: unknown; weight: unknown };

const bandOf = (pet: PetRow | undefined) =>
  pet ? (getReplacementWeightBand({ id: pet.id, weightKg: pet.weight_kg as never, weight: pet.weight as never })?.label ?? "unrecorded") : "?";

async function main() {
  const db = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    timezone: "Z",
    // Same reasoning as backfill-appointment-memberships: without these a
    // dropped socket is a wait that never ends, with a transaction open
    // against production.
    connectTimeout: 20_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 5_000,
  });

  const membershipIds = CORRECTIONS.map((c) => c.membershipId);
  const [membershipRows] = await db.query<any[]>(
    `SELECT id, tenant_id, client_id, pet_id, name, tier, service_type, status,
            price_per_cycle, booking_suspended
       FROM memberships
      WHERE tenant_id=? AND id IN (${membershipIds.map(() => "?").join(",")})`,
    [TENANT, ...membershipIds]);
  const membershipById = new Map<number, any>(membershipRows.map((m) => [m.id, m]));

  const petIds = [...new Set(CORRECTIONS.flatMap((c) => [c.fromPetId, ...(c.toPetId ? [c.toPetId] : [])]))];
  const [petRows] = await db.query<PetRow[]>(
    `SELECT id, name, client_id, status, weight_kg, weight
       FROM pets WHERE tenant_id=? AND id IN (${petIds.map(() => "?").join(",")})`,
    [TENANT, ...petIds]);
  const petById = new Map<number, PetRow>(petRows.map((p) => [p.id, p]));

  /**
   * Any assignment row on a plan being moved changes the arithmetic:
   * after the move the plan would cover the new dog AND still cover the
   * old one through the join table, so one fee would buy two grooms.
   * None of these nine had a row on 06/11/2026. If one has appeared
   * since, stop and let a person decide — this script must not silently
   * widen a plan.
   */
  const [assignedRows] = await db.query<any[]>(
    `SELECT mp.membership_id, mp.pet_id, p.name
       FROM membership_pets mp LEFT JOIN pets p ON p.id = mp.pet_id
      WHERE mp.tenant_id=? AND mp.membership_id IN (${membershipIds.map(() => "?").join(",")})`,
    [TENANT, ...membershipIds]);

  const moves: { correction: Correction; membership: any; from: PetRow; to: PetRow }[] = [];
  const problems: string[] = [];
  let alreadyDone = 0;
  let undecided = 0;

  console.log(`${APPLY ? "APPLY" : "DRY RUN"} — ${CORRECTIONS.length} plans in the correction table\n`);

  for (const c of CORRECTIONS) {
    const label = `  ${c.client.padEnd(21)} m${String(c.membershipId).padEnd(4)}`;
    const membership = membershipById.get(c.membershipId);

    if (!membership) { problems.push(`${c.client}: membership ${c.membershipId} not found in tenant ${TENANT}`); continue; }
    if (membership.client_id !== c.clientId) { problems.push(`${c.client}: membership ${c.membershipId} belongs to client ${membership.client_id}, not ${c.clientId}`); continue; }
    if (membership.status !== "active") { problems.push(`${c.client}: membership ${c.membershipId} is ${membership.status}, not active`); continue; }

    if (c.toPetId === null) {
      undecided++;
      console.log(`${label} NEEDS A DECISION — ${c.plan}`);
      console.log(`${" ".repeat(30)}${c.why}`);
      continue;
    }

    // Idempotence: a plan already on its target is finished, not a fault.
    if (membership.pet_id === c.toPetId) { alreadyDone++; console.log(`${label} already done`); continue; }
    if (membership.pet_id !== c.fromPetId) {
      problems.push(`${c.client}: membership ${c.membershipId} is on pet ${membership.pet_id}, expected ${c.fromPetId} — somebody has moved it, this table is stale`);
      continue;
    }

    const from = petById.get(c.fromPetId);
    const to = petById.get(c.toPetId);
    if (!from || !to) { problems.push(`${c.client}: pet ${!from ? c.fromPetId : c.toPetId} not found in tenant ${TENANT}`); continue; }
    // The same guard setCoveredPets applies: a plan can only ever cover a
    // dog on its own client's record.
    if (to.client_id !== membership.client_id) { problems.push(`${c.client}: pet ${to.id} (${to.name}) belongs to client ${to.client_id}, not ${membership.client_id}`); continue; }
    if (to.status !== "active") { problems.push(`${c.client}: pet ${to.id} (${to.name}) is ${to.status}`); continue; }

    const assigned = assignedRows.filter((a) => a.membership_id === c.membershipId);
    if (assigned.length > 0) {
      problems.push(`${c.client}: membership ${c.membershipId} has membership_pets rows (${assigned.map((a) => `${a.name ?? a.pet_id}`).join(", ")}) — moving it would widen the cover. Clear them first.`);
      continue;
    }

    moves.push({ correction: c, membership, from, to });
    console.log(`${label} ${from.name} -> ${to.name}   ${c.plan}`);
    console.log(`${" ".repeat(30)}bands: ${from.name} ${bandOf(from)} | ${to.name} ${bandOf(to)}`);
    console.log(`${" ".repeat(30)}${c.why}`);
  }

  console.log(`\n  ${moves.length} to move · ${alreadyDone} already done · ${undecided} undecided · ${problems.length} problems`);

  if (problems.length > 0) {
    console.error("\nSTOPPING — nothing written:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 1;
    await db.end();
    return;
  }

  if (moves.length === 0) {
    console.log("\nNothing to do.");
    await db.end();
    return;
  }

  if (!APPLY) {
    console.log("\nnothing written. Re-run with --apply to write.");
    console.log("Afterwards run scripts/backfill-appointment-memberships.ts to link the bookings.");
    await db.end();
    return;
  }

  await db.beginTransaction();
  try {
    let written = 0;
    for (const move of moves) {
      /*
       * The WHERE repeats the expected current dog, so a move made
       * between the read above and this write is never overwritten —
       * the affected-row count then comes back 0 and the whole run
       * rolls back rather than landing half of it.
       */
      const [res] = await db.query<any>(
        `UPDATE memberships SET pet_id=? WHERE id=? AND tenant_id=? AND pet_id=? AND status='active'`,
        [move.to.id, move.membership.id, TENANT, move.from.id]);
      if (res.affectedRows !== 1) {
        throw new Error(`membership ${move.membership.id}: expected 1 row, got ${res.affectedRows}`);
      }
      written += res.affectedRows;

      /*
       * petId is the dog the plan is LEAVING and replacementPetId the one
       * it lands on, matching manageDepartedPet so the client's History
       * tab reads the same whichever route made the change.
       *
       * changedByUserId is NULL because nobody pressed a button; the
       * History tab renders that as "Administrator" and the note says
       * what actually happened.
       */
      await db.query(
        `INSERT INTO pet_membership_events
           (tenant_id, client_id, pet_id, membership_id, replacement_pet_id, event_type, note, changed_by_user_id)
         VALUES (?,?,?,?,?,'membership_transferred',?,NULL)`,
        [TENANT, move.membership.client_id, move.from.id, move.membership.id, move.to.id,
         `Filed under the wrong dog by the MoeGo import. Moved to ${move.to.name} by `
         + `scripts/repoint-misfiled-memberships.ts on 06/11/2026. ${move.correction.why} `
         + `Fee unchanged at $${move.membership.price_per_cycle}/cycle.`]);
    }

    if (written !== moves.length) {
      throw new Error(`expected to write ${moves.length}, wrote ${written} — rolling back`);
    }

    /**
     * The post-condition, asserted inside the transaction: no client may
     * be left with two active plans on one dog. That is the fault this
     * whole script exists to clear, so finishing without checking it
     * would be taking the correction on trust.
     *
     * The three undecided clients still fail it, so they are excluded by
     * name — their entry in CORRECTIONS carries toPetId: null and they
     * are expected to be wrong until somebody fills it in.
     */
    const stillUndecided = CORRECTIONS.filter((c) => c.toPetId === null).map((c) => c.clientId);
    const touched = [...new Set(moves.map((m) => m.membership.client_id))].filter((id) => !stillUndecided.includes(id));
    if (touched.length > 0) {
      const [dupes] = await db.query<any[]>(
        `SELECT client_id, pet_id, COUNT(*) n FROM memberships
          WHERE tenant_id=? AND status='active' AND client_id IN (${touched.map(() => "?").join(",")})
          GROUP BY client_id, pet_id HAVING n > 1`, [TENANT, ...touched]);
      if (dupes.length > 0) {
        throw new Error(`still ${dupes.length} client/dog pairs holding more than one active plan: `
          + dupes.map((d) => `client ${d.client_id} pet ${d.pet_id} x${d.n}`).join("; "));
      }
    }

    await db.commit();
    console.log(`\nCOMMITTED — ${written} plans repointed, ${written} audit rows written.`);
    console.log("Now run scripts/backfill-appointment-memberships.ts to link the bookings,");
    console.log("or the dogs stay unmarked on the calendar.");
  } catch (err) {
    await db.rollback();
    console.error("\nROLLED BACK:", (err as Error).message);
    process.exitCode = 1;
  }
  await db.end();
}

main();
