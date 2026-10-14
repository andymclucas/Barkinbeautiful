/**
 * Reading a dog's usual groomer out of who has actually groomed it.
 *
 * `pets.preferred_groomer_id` is empty on all 12,552 dogs, so the booking
 * default that reads it does nothing until somebody fills it in. The salon
 * already knows the answer for most dogs — Minnie has been Stephanie 49
 * times out of 50 — it just lives in grooming history rather than on the
 * dog's file.
 *
 * This is the rule for when history is decisive enough to write down. It is
 * deliberately strict, because the cost is asymmetric: an empty preference
 * costs a groomer one dropdown, and a WRONG one quietly books a dog with
 * the wrong person on every future booking until somebody notices.
 *
 * Four conditions, all required:
 *
 *   1. **Enough history.** One or two grooms is a coincidence, not a habit.
 *   2. **A clear majority.** A dog split evenly between two groomers has no
 *      usual groomer, and picking the one with 51% invents a preference the
 *      salon does not have.
 *   3. **The most recent groom agrees.** This is what catches a dog that
 *      CHANGED groomer: six years with Megs and the last four with
 *      Charlotte still gives Megs the majority, and she is the wrong
 *      answer. Requiring the latest groom to match means a switch suppresses
 *      the preference rather than entrenching the old one.
 *   4. **They still work here.** A preference naming somebody who has left
 *      is worse than none.
 */

export type GroomRecord = {
  staffId: number;
  /** When it happened. Anything Date.parse understands, or a Date. */
  at: Date | string | number;
};

export type HistoryVerdict =
  | { ok: true; staffId: number; grooms: number; total: number; share: number }
  | { ok: false; reason: "too_few"; total: number }
  | { ok: false; reason: "no_majority"; total: number; topShare: number }
  | { ok: false; reason: "recently_changed"; total: number; majorityStaffId: number; latestStaffId: number };

export const DEFAULT_MINIMUM_GROOMS = 3;
export const DEFAULT_MINIMUM_SHARE = 0.6;

function toMillis(at: Date | string | number): number {
  if (at instanceof Date) return at.getTime();
  if (typeof at === "number") return at;
  const parsed = Date.parse(String(at));
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function preferredGroomerFromHistory(input: {
  grooms: ReadonlyArray<GroomRecord>;
  /** Staff still on the roster. Everybody else's grooms are dropped. */
  activeStaffIds: ReadonlyArray<number>;
  minimumGrooms?: number;
  minimumShare?: number;
}): HistoryVerdict {
  const minimumGrooms = input.minimumGrooms ?? DEFAULT_MINIMUM_GROOMS;
  const minimumShare = input.minimumShare ?? DEFAULT_MINIMUM_SHARE;
  const active = new Set(input.activeStaffIds);

  // Condition 4, applied first: somebody who has left cannot be the answer,
  // and their grooms should not count toward anybody else's share either —
  // they are not evidence about who grooms this dog NOW.
  const grooms = input.grooms.filter((groom) => active.has(groom.staffId));
  const total = grooms.length;
  if (total < minimumGrooms) return { ok: false, reason: "too_few", total };

  const counts = new Map<number, number>();
  for (const groom of grooms) counts.set(groom.staffId, (counts.get(groom.staffId) ?? 0) + 1);

  let topStaffId = -1;
  let topCount = 0;
  let tied = false;
  for (const [staffId, count] of Array.from(counts.entries())) {
    if (count > topCount) { topStaffId = staffId; topCount = count; tied = false; }
    else if (count === topCount) { tied = true; }
  }

  const share = topCount / total;
  // A tie is not a majority however the shares fall.
  if (tied || share < minimumShare) {
    return { ok: false, reason: "no_majority", total, topShare: share };
  }

  const latest = grooms.reduce((newest, groom) =>
    toMillis(groom.at) > toMillis(newest.at) ? groom : newest, grooms[0]);
  if (latest.staffId !== topStaffId) {
    return {
      ok: false,
      reason: "recently_changed",
      total,
      majorityStaffId: topStaffId,
      latestStaffId: latest.staffId,
    };
  }

  return { ok: true, staffId: topStaffId, grooms: topCount, total, share };
}

/** A line for the script's report. */
export function describeHistoryVerdict(verdict: HistoryVerdict, nameOf: (id: number) => string): string {
  if (verdict.ok) {
    return `${nameOf(verdict.staffId)} — ${verdict.grooms} of ${verdict.total} (${Math.round(verdict.share * 100)}%)`;
  }
  if (verdict.reason === "too_few") return `only ${verdict.total} groom(s) on file`;
  if (verdict.reason === "no_majority") {
    return `no clear majority (best ${Math.round(verdict.topShare * 100)}% of ${verdict.total})`;
  }
  return `changed groomer — mostly ${nameOf(verdict.majorityStaffId)}, but last was ${nameOf(verdict.latestStaffId)}`;
}
