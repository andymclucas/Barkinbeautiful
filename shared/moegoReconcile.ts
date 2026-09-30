/**
 * Deciding what a MoeGo cancellation actually means for the Groomigo board.
 *
 * This exists because getting it wrong is silent and expensive. On 30/09/2026
 * an apply run cancelled 12 dogs that were genuinely coming: the client had
 * cancelled and REBOOKED the same dog on the same day, MoeGo kept both rows,
 * and the script read only the cancelled one. A cancelled row is not evidence
 * that a dog is not coming - it is evidence about one booking.
 *
 * The rules, each paid for:
 *
 *  1. A dog with ANY live MoeGo booking that day is coming. Never cancel it,
 *     however many cancelled rows sit beside the live one.
 *  2. Match on pet AND client AND date. Two Louis on the same day belong to
 *     two different owners, and pet+date alone cancels the wrong one.
 *  3. A dog past `scheduled` is at the salon. MoeGo's cancellation is stale
 *     and applying it would take a dog off the board mid-groom.
 */

export interface MoegoAppointment {
  bookingId: string;
  date: string;
  client: string;
  pet: string;
  status: string;
}

export interface GroomigoAppointment {
  id: number;
  date: string;
  client: string;
  pet: string;
  workflowState: string;
  status: string;
}

export const isDeadStatus = (status: string | null | undefined): boolean =>
  /cancel|no.?show/i.test(status ?? "");

export const isDeadAppointment = (a: GroomigoAppointment): boolean =>
  isDeadStatus(a.workflowState) || isDeadStatus(a.status);

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
export const matchKey = (pet: string, client: string, date: string) =>
  `${norm(pet)}|${norm(client)}|${date}`;

export interface CancelDecision {
  appointment: GroomigoAppointment;
  moego: MoegoAppointment;
  /** Set when the row must NOT be written; the text explains why. */
  hold?: string;
}

export interface ReconcilePlan {
  cancel: CancelDecision[];
  held: CancelDecision[];
  /** A cancellation whose dog is not in Groomigo under that owner at all. */
  unmatched: MoegoAppointment[];
}

export function planCancellations(
  moego: readonly MoegoAppointment[],
  groomigo: readonly GroomigoAppointment[],
): ReconcilePlan {
  // Every live MoeGo booking, so a cancelled row beside one can be recognised
  // as a reschedule rather than a cancellation.
  const liveMoego = new Set(
    moego.filter((m) => !isDeadStatus(m.status)).map((m) => matchKey(m.pet, m.client, m.date)),
  );
  const byKey = new Map<string, GroomigoAppointment[]>();
  for (const g of groomigo) {
    const k = matchKey(g.pet, g.client, g.date);
    byKey.set(k, [...(byKey.get(k) ?? []), g]);
  }

  const cancel: CancelDecision[] = [];
  const held: CancelDecision[] = [];
  const unmatched: MoegoAppointment[] = [];
  const seen = new Set<number>();

  for (const m of moego) {
    if (!isDeadStatus(m.status)) continue;
    const k = matchKey(m.pet, m.client, m.date);
    const all = byKey.get(k) ?? [];
    if (all.length === 0) {
      unmatched.push(m);
      continue;
    }
    for (const g of all) {
      if (isDeadAppointment(g)) continue;
      if (seen.has(g.id)) continue;
      seen.add(g.id);
      const decision: CancelDecision = { appointment: g, moego: m };
      if (liveMoego.has(k)) {
        // Rule 1. The dog was rebooked; the cancelled row is the old booking.
        decision.hold = "MoeGo also holds a LIVE booking for this dog that day - cancelled and rebooked, so the dog is still coming";
      } else if (g.workflowState !== "scheduled") {
        // Rule 3.
        decision.hold = `already ${g.workflowState} - the dog is at the salon, MoeGo's cancellation is stale`;
      }
      (decision.hold ? held : cancel).push(decision);
    }
  }
  return { cancel, held, unmatched };
}
