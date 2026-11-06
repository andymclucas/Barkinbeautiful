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
 * the plan was always this dog's. Running
 * `isEligibleMembershipReplacement` over the four decided pairs that
 * have weights returns false for all four — it would block every
 * correct move.
 *
 * So the bands are PRINTED instead, as evidence for the person reading
 * the output. Raw kilos and the stored `size_band` are printed beside
 * the derived band, because the derivation is lossy: the bands leave a
 * gap between 13 and 14 kg, so Carly Herbert's Lily at 13.2 kg has no
 * band at all. The plan's own named band is printed next to it and is
 * never used to decide — `shared/membershipCoveredPets.ts` is explicit
 * that a plan name is for flagging and never for pricing, and Dusty
 * sits on a plan named "MED" at 20 kg today.
 *
 * ## What it does and does not touch
 *
 * One column, `memberships.pet_id`, plus an audit row per move. It
 * never touches `price_per_cycle`, `status`, `tier`, `service_type`,
 * any appointment, or any invoice.
 *
 * The WEEKLY money does not move: billing resolves a plan by its own id
 * and `stripe_subscription_id`, never by the dog. One derived figure
 * does change — the Accounts Receivable view totals completed grooms
 * for `memberships.pet_id` since `started_at`, so after the move each
 * plan counts the right dog's grooms instead of the wrong dog's. That
 * is the view becoming correct, but it is a visible change and the dry
 * run prints it.
 *
 * ## Run this BEFORE the backfill, not after
 *
 * `scripts/backfill-appointment-memberships.ts` links existing bookings
 * to the plan that covers them. For a dog carrying TWO plans it has no
 * ORDER BY and keeps the first row the database returns, so run it
 * first and the three undecided households get their bookings linked to
 * an arbitrary one of their two plans. The guard below then refuses
 * whichever plan is finally chosen, and the only cure is editing
 * `appointments.membership_id` by hand.
 *
 * So: decide all nine, move all nine, then backfill. If a partial run
 * is unavoidable the dry run says plainly not to backfill yet.
 *
 * ## Re-running is safe
 *
 * Each entry is checked against the live row before anything is
 * written. A plan already sitting on its target is reported as done and
 * skipped — that check runs BEFORE the status check, so a plan that has
 * since gone `pending_payment` cannot block the entries that still have
 * to move. A plan sitting on neither the old nor the new dog aborts the
 * whole run, because somebody has moved it and this table is stale.
 *
 * ## `pnpm run check` does NOT cover this file
 *
 * `tsconfig.json` includes only `client/src`, `shared` and `server`, so
 * the repo's typecheck never reads `scripts/`. Check it directly:
 *
 *   corepack pnpm exec tsc --noEmit --skipLibCheck --target ES2022 \
 *     --module ESNext --moduleResolution bundler --strict \
 *     scripts/repoint-misfiled-memberships.ts
 *
 *   node --import tsx scripts/repoint-misfiled-memberships.ts
 *   node --import tsx scripts/repoint-misfiled-memberships.ts --apply
 */
import "dotenv/config";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { getMembershipWeightBand } from "../shared/membershipPackages";
import { resolveAppointmentMembershipCoverage, type ActivePetMembership }
  from "../shared/appointmentMembershipCoverage";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;

type Correction = {
  /**
   * The plan that moves. NULL on an entry where nobody has decided
   * WHICH of the client's two plans it is — which is a different
   * question from which dog, and is open on three of the nine.
   */
  membershipId: number | null;
  clientId: number;
  /** The dog the plan is on now. Checked before anything is written. */
  fromPetId: number;
  /** The dog it belongs to. NULL until a human decides. */
  toPetId: number | null;
  /**
   * Why this dog and this plan — copied verbatim into the audit row, so
   * it must read as a decision and not as an open question. Required
   * whenever the entry is decided.
   */
  decision: string | null;
  /** For the person reading the output. Never used to decide anything. */
  client: string;
  options: string;
  openQuestion?: string;
};

/**
 * Six are settled by the weight band: the household's second dog sits
 * in the band the plan names, and the first dog sits in the other
 * plan's band. Three are not, and are left open rather than guessed —
 * the dogs' own booking history was checked on 06/11/2026 and does not
 * settle any of them either.
 *
 * The name is being used here to identify WHICH of a client's two plans
 * is which, with the fee unchanged either way — not to decide what
 * anybody pays.
 */
const CORRECTIONS: Correction[] = [
  {
    membershipId: 29, clientId: 75, fromPetId: 166, toPetId: 167,
    client: "Carole Adams", options: "m29 Silver Classic Small (0-10kg) $17.00",
    decision: "Spencer is 7.3kg (small); Charlie is 11.1kg and keeps the SML-MED plan.",
  },
  {
    membershipId: 18, clientId: 39, fromPetId: 89, toPetId: 90,
    client: "Scott Barker", options: "m18 Silver Styled SML-MED (11-13kg) $28.00",
    decision: "Effie is 13.0kg (small-medium); Dusty is 20.0kg and keeps the MED plan.",
  },
  {
    membershipId: 6, clientId: 21, fromPetId: 48, toPetId: 49,
    client: "Carly Herbert", options: "m6 Gold Styled SML-MED (11-13kg) $30.00",
    decision: "Lily is 13.2kg; Alfie is 6.7kg and keeps the SML plan.",
  },
  {
    membershipId: 25, clientId: 60, fromPetId: 134, toPetId: 135,
    client: "Lynnette Matuschka", options: "m25 Gold Classic SML-MED (11-13kg) $26.00",
    decision: "Jackson is 14.2kg; Elle-May is 9.0kg and keeps the Small plan.",
  },
  {
    membershipId: 35, clientId: 85, fromPetId: 182, toPetId: 183,
    client: "Stellina Popplewell", options: "m35 Silver Classic SML-MED (11-13kg) $22.00",
    decision: "Luna is 12.8kg (small-medium); Freddi is 15.2kg and keeps the MED plan.",
  },
  {
    membershipId: 8, clientId: 25, fromPetId: 57, toPetId: 58,
    client: "Tricia Taylor", options: "m8 Gold Styled SML-MED (11-13kg) $30.00",
    decision: "Lily is small-medium; Gracie is small and keeps the SML plan.",
  },

  /*
   * ── Undecided ──────────────────────────────────────────────────────
   *
   * THREE fields are open on each of these, not one: which of the two
   * plans moves (`membershipId`), which dog it lands on (`toPetId`), and
   * the reason that goes permanently into the audit row (`decision`).
   * All three are null, and the script treats any null as undecided, so
   * a half-filled entry cannot execute.
   */
  {
    membershipId: null, clientId: 38, fromPetId: 87, toPetId: null, decision: null,
    client: "Sonia Condon", options: "m15 Bronze Classic LRG (17-25kg) $27.00 | m16 MED (14-16kg) $24.00",
    openQuestion: "Harvey is pet 88. Both dogs read LARGE — Ella 17.0kg, Harvey 22.0kg — so"
      + " MED (14-16kg) fits neither and the band cannot choose, and both are"
      + " classic-only so service cannot either. On size alone Harvey at 22kg is"
      + " the likelier LRG, which would mean moving m15 and leaving Ella on m16 —"
      + " but that is a guess about $3/wk. Needs MoeGo or Andy.",
  },
  {
    membershipId: null, clientId: 46, fromPetId: 103, toPetId: null, decision: null,
    client: "Selina Robson", options: "m20 Silver Classic Small $17.00 | m21 Styled SML (0-10kg) $22.00",
    openQuestion: "Rocky is pet 104. Both dogs are small with no weight on file, so the split"
      + " has to be by service — and neither dog is a styled dog: Archie has 22"
      + " classic grooms to 1 styled, Rocky 3 to 1. Needs MoeGo or Andy.",
  },
  {
    membershipId: null, clientId: 28, fromPetId: 66, toPetId: null, decision: null,
    client: "Nicki Waldon", options: "m11 Gold Classic Small $22.00 | m12 Styled SML (0-10kg) $26.00",
    openQuestion: "Snickers is pet 67. Chester 4.0kg and Snickers 5.0kg are both small, and"
      + " NEITHER has ever had a styled groom — 29 classic + 3 fft for Chester, 3 +"
      + " 3 for Snickers — so the Styled plan matches no history at all and the"
      + " service split cannot be read off either dog. Needs MoeGo or Andy.",
  },
];

type PetRow = RowDataPacket & {
  id: number; name: string; client_id: number; status: string;
  weight_kg: string | null; weight: string | null; size_band: string | null;
};
type MembershipRow = RowDataPacket & {
  id: number; tenant_id: number; client_id: number; pet_id: number; name: string;
  tier: string; service_type: "classic" | "styled"; status: string;
  price_per_cycle: string; booking_suspended: number;
};

/**
 * Everything known about a dog's size, raw first.
 *
 * The derived band is last because it is the lossiest: the bands skip
 * 13 to 14 kg, so a real 13.2 kg dog reads "no band". Printing the
 * kilos and the stored size_band beside it means a reader is never
 * shown only the lossy answer.
 */
function describeSize(pet: PetRow | undefined): string {
  if (!pet) return "?";
  const kg = pet.weight_kg ?? pet.weight;
  const band = getMembershipWeightBand(kg)?.label ?? "no band";
  return `${kg ? `${kg}kg` : "no weight"} · ${pet.size_band ?? "no size_band"} · ${band}`;
}

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

  const clientIds = [...new Set(CORRECTIONS.map((c) => c.clientId))];

  /*
   * Every plan of every household, not just the ones being moved. The
   * post-condition cannot be stated without the sibling: "this dog is
   * now covered" depends on a plan this table never names.
   */
  const [membershipRows] = await db.query<MembershipRow[]>(
    `SELECT id, tenant_id, client_id, pet_id, name, tier, service_type, status,
            price_per_cycle, booking_suspended
       FROM memberships
      WHERE tenant_id=? AND client_id IN (${clientIds.map(() => "?").join(",")})`,
    [TENANT, ...clientIds]);
  const membershipById = new Map<number, MembershipRow>(membershipRows.map((m) => [m.id, m]));

  const [petRows] = await db.query<PetRow[]>(
    `SELECT id, name, client_id, status, weight_kg, weight, size_band
       FROM pets WHERE tenant_id=? AND client_id IN (${clientIds.map(() => "?").join(",")})`,
    [TENANT, ...clientIds]);
  const petById = new Map<number, PetRow>(petRows.map((p) => [p.id, p]));

  /**
   * Any assignment row on a plan being moved changes the arithmetic:
   * after the move the plan would cover the new dog AND still cover the
   * old one through the join table, so one fee would buy two grooms.
   *
   * Queried across the whole HOUSEHOLD rather than just the moved plan,
   * because a row on the SIBLING plan naming the target dog puts that
   * dog on two plans just as surely. None of the nine had any row on
   * 06/11/2026.
   */
  const [assignedRows] = await db.query<RowDataPacket[]>(
    `SELECT mp.membership_id, mp.pet_id, p.name
       FROM membership_pets mp
       JOIN memberships m ON m.id = mp.membership_id
       LEFT JOIN pets p ON p.id = mp.pet_id
      WHERE mp.tenant_id=? AND m.client_id IN (${clientIds.map(() => "?").join(",")})`,
    [TENANT, ...clientIds]);

  /**
   * Bookings already pointing at a plan that is about to move.
   *
   * `showsMembershipMark` reads the booking's OWN `membership_id` and
   * nothing else, so a groom left linked to a plan that has moved to a
   * different dog wears the gold VIP disc while being uncovered — the
   * "lie that costs money at the counter" that shared/membershipMark.ts
   * warns about, and it would survive a re-run of the backfill because
   * that only ever fills a NULL.
   */
  const [linkedRows] = await db.query<RowDataPacket[]>(
    `SELECT a.id, a.membership_id, a.pet_id, a.price, a.scheduled_start, p.name
       FROM appointments a LEFT JOIN pets p ON p.id = a.pet_id
      WHERE a.tenant_id=? AND a.client_id IN (${clientIds.map(() => "?").join(",")})
        AND a.membership_id IS NOT NULL`,
    [TENANT, ...clientIds]);

  /**
   * Upcoming grooms for a target dog that still carry a price.
   *
   * Linking a booking does not reprice it — the backfill says so
   * explicitly — so a priced groom for a now-covered dog still bills at
   * the counter and still draws down store credit, which ignores
   * `membership_id` entirely. None of the six target dogs had one on
   * 06/11/2026. Reported, never changed: zeroing a booking is a
   * decision for staff.
   */
  const [pricedRows] = await db.query<RowDataPacket[]>(
    `SELECT id, pet_id, scheduled_start, service_type, price
       FROM appointments
      WHERE tenant_id=? AND client_id IN (${clientIds.map(() => "?").join(",")})
        AND scheduled_start >= NOW() AND membership_id IS NULL
        AND price IS NOT NULL AND price > 0
        AND workflow_state NOT IN ('cancelled','no_show')`,
    [TENANT, ...clientIds]);

  const moves: { correction: Correction; membership: MembershipRow; from: PetRow; to: PetRow }[] = [];
  const problems: string[] = [];
  const warnings: string[] = [];
  let alreadyDone = 0;
  let undecided = 0;

  console.log(`${APPLY ? "APPLY" : "DRY RUN"} — ${CORRECTIONS.length} households in the correction table\n`);

  for (const c of CORRECTIONS) {
    const label = `  ${c.client.padEnd(21)}`;

    // Any null means a human has not finished deciding. All three
    // fields are part of the same decision and none stands alone.
    if (c.membershipId === null || c.toPetId === null || !c.decision) {
      undecided++;
      console.log(`${label} NEEDS A DECISION — ${c.options}`);
      console.log(`${" ".repeat(23)}${c.openQuestion ?? ""}`);
      continue;
    }

    const membership = membershipById.get(c.membershipId);
    if (!membership) { problems.push(`${c.client}: membership ${c.membershipId} not found for client ${c.clientId} in tenant ${TENANT}`); continue; }
    if (membership.client_id !== c.clientId) { problems.push(`${c.client}: membership ${c.membershipId} belongs to client ${membership.client_id}, not ${c.clientId}`); continue; }

    /*
     * Idempotence BEFORE the status check, deliberately. A plan moved on
     * an earlier run that has since gone pending_payment — which any
     * single failed payment does — needs nothing, and failing it would
     * block the entries that still have to move.
     */
    if (membership.pet_id === c.toPetId) { alreadyDone++; console.log(`${label} already done — ${membership.name}`); continue; }

    if (membership.status !== "active") { problems.push(`${c.client}: membership ${c.membershipId} is ${membership.status}, not active`); continue; }
    if (membership.pet_id !== c.fromPetId) {
      problems.push(`${c.client}: membership ${c.membershipId} is on pet ${membership.pet_id}, expected ${c.fromPetId} — somebody has moved it, this table is stale`);
      continue;
    }

    const from = petById.get(c.fromPetId);
    const to = petById.get(c.toPetId);
    if (!from || !to) { problems.push(`${c.client}: pet ${!from ? c.fromPetId : c.toPetId} not found on client ${c.clientId}`); continue; }
    // The same guard setCoveredPets applies: a plan can only ever cover a
    // dog on its own client's record.
    if (to.client_id !== membership.client_id) { problems.push(`${c.client}: pet ${to.id} (${to.name}) belongs to client ${to.client_id}, not ${membership.client_id}`); continue; }
    if (to.status !== "active") { problems.push(`${c.client}: pet ${to.id} (${to.name}) is ${to.status}`); continue; }

    const assigned = assignedRows.filter((a) => a.membership_id === c.membershipId || a.pet_id === c.toPetId);
    if (assigned.length > 0) {
      problems.push(`${c.client}: membership_pets rows touch this move (${assigned.map((a) => `m${a.membership_id}->${a.name ?? a.pet_id}`).join(", ")})`
        + ` — it would put a dog on two plans. setCoveredPets cannot clear these (it always re-inserts the primary); delete them by SQL first.`);
      continue;
    }

    // Only bookings for a dog the plan is LEAVING are a problem; one
    // already on the target dog is simply right and stays right.
    const stranded = linkedRows.filter((a) => a.membership_id === c.membershipId && a.pet_id !== c.toPetId);
    if (stranded.length > 0) {
      problems.push(`${c.client}: ${stranded.length} booking(s) already link to membership ${c.membershipId} for ${[...new Set(stranded.map((a) => a.name ?? a.pet_id))].join(", ")}`
        + ` — moving the plan would leave them marked as covered when they are not.`
        + ` The backfill was run too early; clear appointments ${stranded.map((a) => a.id).join(", ")} first.`);
      continue;
    }

    /*
     * Not fatal, but it means the move will not achieve the thing it was
     * run for: a held plan covers nobody, so the second dog stays
     * uncovered and Lauren's complaint simply changes dogs.
     */
    if (membership.booking_suspended) {
      warnings.push(`${c.client}: membership ${c.membershipId} is booking_suspended, so ${to.name} will still not be covered until the hold is lifted`);
    }

    moves.push({ correction: c, membership, from, to });
    /*
     * The plan is named from the DATABASE row, never from the table
     * above, so a hand-written label left un-updated beside an edited
     * membershipId cannot describe a move that is not the one about to
     * happen.
     */
    console.log(`${label} ${from.name} -> ${to.name}   ${membership.name} $${membership.price_per_cycle}/cycle`);
    console.log(`${" ".repeat(23)}${from.name}: ${describeSize(from)}`);
    console.log(`${" ".repeat(23)}${to.name}: ${describeSize(to)}`);
    console.log(`${" ".repeat(23)}${c.decision}`);

    const priced = pricedRows.filter((a) => a.pet_id === c.toPetId);
    if (priced.length > 0) {
      warnings.push(`${c.client}: ${to.name} has ${priced.length} priced upcoming booking(s) (${priced.map((a) => `#${a.id} $${a.price}`).join(", ")})`
        + ` — linking does not reprice, so these still bill at the counter. Zero them by hand if they should be covered.`);
    }
  }

  console.log(`\n  ${moves.length} to move · ${alreadyDone} already done · ${undecided} undecided · ${problems.length} problems`);

  for (const w of warnings) console.log(`  WARNING  ${w}`);

  if (problems.length > 0) {
    console.error("\nSTOPPING — nothing written:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exitCode = 1;
    await db.end();
    return;
  }

  /**
   * The post-condition, computed up front so the dry run shows it too.
   *
   * Asserting "no dog holds two plans" is one-sided — it cannot see the
   * outcome this script exists for, which is that the SECOND dog ends
   * up covered. So the real resolver is run over each household's plans
   * as they will be after the move, for a classic groom, which every
   * plan covers whatever its service type.
   */
  function projectedProblems(): string[] {
    const found: string[] = [];
    for (const clientId of [...new Set(moves.map((m) => m.membership.client_id))]) {
      const movedHere = moves.filter((m) => m.membership.client_id === clientId);
      const plans: ActivePetMembership[] = membershipRows
        .filter((m) => m.client_id === clientId && m.status === "active")
        .map((m) => ({
          id: m.id,
          petId: movedHere.find((mv) => mv.membership.id === m.id)?.to.id ?? m.pet_id,
          name: m.name, tier: m.tier, serviceType: m.service_type,
          status: m.status, bookingSuspended: Boolean(m.booking_suspended),
          coveredPetIds: [],
        }));
      const dogs = [...new Set(movedHere.flatMap((m) => [m.from.id, m.to.id]))];
      const coverage = resolveAppointmentMembershipCoverage(dogs, "classic_groom", plans);
      const uncovered = coverage.uncoveredPetIds
        .map((id) => petById.get(id)?.name ?? String(id));
      if (uncovered.length > 0) {
        found.push(`client ${clientId}: ${uncovered.join(", ")} would STILL be uncovered after the move`);
      }
      // Two dogs landing on one plan would mean one fee covering both.
      const claimed = dogs.map((id) => coverage.membershipByPetId[id]?.id).filter(Boolean);
      if (new Set(claimed).size !== claimed.length) {
        found.push(`client ${clientId}: two dogs would be covered by the same plan`);
      }
    }
    return found;
  }

  const projected = projectedProblems();
  if (projected.length > 0) {
    console.error("\nSTOPPING — the move would not achieve what it is for:");
    for (const p of projected) console.error(`  - ${p}`);
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
    console.log(undecided > 0
      ? `\nDO NOT run the backfill yet — ${undecided} household(s) still hold two plans on one dog,\n`
        + "and the backfill would link their bookings to an arbitrary one of the two."
      : "\nAfterwards run scripts/backfill-appointment-memberships.ts to link the bookings.");
    await db.end();
    return;
  }

  // Brisbane, not the host clock. Stamping a December move as 06/11 is
  // exactly the kind of quiet wrongness an audit row exists to prevent.
  const today = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(new Date());

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
      const [res] = await db.query<mysql.ResultSetHeader>(
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
       * what actually happened. The note carries the DECISION, never the
       * open question that preceded it.
       */
      await db.query(
        `INSERT INTO pet_membership_events
           (tenant_id, client_id, pet_id, membership_id, replacement_pet_id, event_type, note, changed_by_user_id)
         VALUES (?,?,?,?,?,'membership_transferred',?,NULL)`,
        [TENANT, move.membership.client_id, move.from.id, move.membership.id, move.to.id,
         `Filed under the wrong dog by the MoeGo import. Moved to ${move.to.name} by `
         + `scripts/repoint-misfiled-memberships.ts on ${today}. ${move.correction.decision} `
         + `Fee unchanged at $${move.membership.price_per_cycle}/cycle.`]);
    }

    if (written !== moves.length) {
      throw new Error(`expected to write ${moves.length}, wrote ${written} — rolling back`);
    }

    /**
     * Re-asserted against the database inside the transaction, rather
     * than trusting the projection computed from the earlier read.
     */
    const touched = [...new Set(moves.map((m) => m.membership.client_id))];
    const [dupes] = await db.query<RowDataPacket[]>(
      `SELECT client_id, pet_id, COUNT(*) n FROM memberships
        WHERE tenant_id=? AND status='active' AND client_id IN (${touched.map(() => "?").join(",")})
        GROUP BY client_id, pet_id HAVING n > 1`, [TENANT, ...touched]);
    if (dupes.length > 0) {
      throw new Error(`still ${dupes.length} client/dog pairs holding more than one active plan: `
        + dupes.map((d) => `client ${d.client_id} pet ${d.pet_id} x${d.n}`).join("; "));
    }

    await db.commit();
    console.log(`\nCOMMITTED — ${written} plans repointed, ${written} audit rows written.`);
    console.log(undecided > 0
      ? `\nDO NOT run the backfill yet — ${undecided} household(s) are still undecided.`
      : "\nNow run scripts/backfill-appointment-memberships.ts to link the bookings,\n"
        + "or the dogs stay unmarked on the calendar.");
  } catch (err) {
    try {
      await db.rollback();
      console.error("\nROLLED BACK:", (err as Error).message);
    } catch (rollbackErr) {
      // A rollback that itself fails leaves the operator unable to tell
      // whether the commit landed. Say so rather than crashing.
      console.error("\nFAILED:", (err as Error).message);
      console.error("ROLLBACK ALSO FAILED:", (rollbackErr as Error).message);
      console.error("State is UNKNOWN — re-run the dry run before doing anything else.");
    }
    process.exitCode = 1;
  }
  await db.end();
}

main().catch((err) => {
  console.error("FAILED:", (err as Error).message);
  process.exitCode = 1;
});
