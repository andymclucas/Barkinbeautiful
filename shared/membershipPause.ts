/**
 * Pausing a membership, and deciding when it starts paying again.
 *
 * A client goes away for a month, or their dog is recovering from
 * surgery, and the salon wants the weekly debit to stop without
 * tearing down a membership they intend to keep. Cancelling loses the
 * price they were grandfathered on and their place in the book.
 *
 * Three ways to say when it restarts, which is the whole feature:
 * after a number of billing cycles, on a chosen date, or not until
 * somebody says so.
 *
 * **The trap this module exists to avoid.** `memberships.status` uses
 * "paused" for TWO different things: a deliberate pause, and the
 * suspension the failed-payment escalation applies at strike two. They
 * are already told apart by hand in places (`Memberships.tsx` checks
 * `status === "paused" && !failing`), which is fine for colouring a
 * badge and dangerous for a scheduled job: a sweep that resumed every
 * paused membership whose date had passed would quietly put a client
 * who had never paid back onto automatic billing. `pauseMode` is the
 * discriminator — only a deliberate pause sets it, so only a
 * deliberate pause can auto-resume. See `isDeliberatePause`.
 *
 * Dates are computed in UTC. Brisbane has no DST, so a fixed +10
 * offset means UTC arithmetic preserves the Brisbane day-of-month,
 * which is the thing a client actually reads off their statement.
 */

export type PauseMode = "cycles" | "date" | "manual";

export type PausePlan =
  | { mode: "cycles"; cycles: number }
  | { mode: "date"; resumeOn: Date }
  | { mode: "manual" };

export type BillingCycle = "weekly" | "monthly";

/** The most cycles a pause may be set for in one go. */
export const MAX_PAUSE_CYCLES = 52;

/**
 * How far ahead a pause may be scheduled to end.
 *
 * Two years. Not a technical limit — a guard against a typo in a date
 * field parking a paying client's billing until 2126, which nothing
 * else in the system would ever surface.
 */
export const MAX_PAUSE_YEARS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `from` plus n weeks. */
export function addWeeks(from: Date, weeks: number): Date {
  return new Date(from.getTime() + weeks * 7 * DAY_MS);
}

/**
 * `from` plus n calendar months, clamped to the end of the month.
 *
 * 31 January plus one month is 28 February, not 3 March. Letting it
 * roll over moves a client's billing day permanently later every time
 * it lands on a long month, which is how a 31st-of-the-month client
 * ends up being charged on the 3rd.
 */
export function addMonths(from: Date, months: number): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + months;
  const day = from.getUTCDate();

  const lastDayOfTarget = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(
    year,
    month,
    Math.min(day, lastDayOfTarget),
    from.getUTCHours(),
    from.getUTCMinutes(),
    from.getUTCSeconds(),
    from.getUTCMilliseconds(),
  ));
}

/** `from` advanced by whole billing cycles of this membership's cadence. */
export function addBillingCycles(
  from: Date,
  cycles: number,
  billingCycle: BillingCycle,
  billingCycleWeeks = 1,
): Date {
  if (billingCycle === "monthly") return addMonths(from, cycles);
  // A weekly membership may still bill every N weeks; skipping "a
  // cycle" has to mean skipping that whole period, not seven days.
  return addWeeks(from, cycles * Math.max(1, billingCycleWeeks));
}

export type PauseContext = {
  /** When the next charge would have gone out. */
  nextBillingDate: Date | null;
  billingCycle: BillingCycle;
  billingCycleWeeks?: number;
  now: Date;
};

/**
 * The moment billing should start again, or null for a manual pause.
 *
 * Cycles count forward from the NEXT billing date rather than today,
 * because that is what a client means by "skip two payments" — a pause
 * set the day before a charge should skip that charge, and one set the
 * day after should not skip two. With no next billing date on file,
 * today is the only honest anchor.
 */
export function resolvePauseResumesAt(plan: PausePlan, context: PauseContext): Date | null {
  if (plan.mode === "manual") return null;
  if (plan.mode === "date") return plan.resumeOn;

  const anchor = context.nextBillingDate ?? context.now;
  return addBillingCycles(anchor, plan.cycles, context.billingCycle, context.billingCycleWeeks);
}

export type PauseValidation = { ok: true } | { ok: false; reason: string };

/** Whether this is a pause the salon can actually act on. */
export function validatePausePlan(plan: PausePlan, now: Date): PauseValidation {
  if (plan.mode === "manual") return { ok: true };

  if (plan.mode === "cycles") {
    if (!Number.isInteger(plan.cycles) || plan.cycles < 1) {
      return { ok: false, reason: "Pause for at least one billing cycle." };
    }
    if (plan.cycles > MAX_PAUSE_CYCLES) {
      return { ok: false, reason: `Pause for at most ${MAX_PAUSE_CYCLES} billing cycles.` };
    }
    return { ok: true };
  }

  if (!(plan.resumeOn instanceof Date) || Number.isNaN(plan.resumeOn.getTime())) {
    return { ok: false, reason: "Choose a date for billing to restart." };
  }
  if (plan.resumeOn.getTime() <= now.getTime()) {
    return { ok: false, reason: "The restart date has to be in the future." };
  }
  const limit = addMonths(now, MAX_PAUSE_YEARS * 12);
  if (plan.resumeOn.getTime() > limit.getTime()) {
    return { ok: false, reason: `Billing cannot be paused more than ${MAX_PAUSE_YEARS} years ahead.` };
  }
  return { ok: true };
}

/** The shape this module needs to reason about a membership row. */
export type PausableMembership = {
  status: string;
  pauseMode?: PauseMode | null;
  pauseResumesAt?: Date | null;
  failedPaymentCount?: number | null;
  bookingSuspended?: boolean | null;
};

/**
 * Whether this row was paused on purpose, as opposed to suspended for
 * not paying.
 *
 * `pauseMode` is the discriminator and is the only one that is safe:
 * it is set exclusively by the pause action, while the failed-payment
 * escalation sets status, `failedPaymentCount` and `bookingSuspended`
 * and never touches it. The counters are checked too, so a membership
 * that was paused deliberately and THEN failed a payment — possible,
 * because a pause can be lifted and a charge fail the same week — is
 * treated as a payment problem rather than silently resumed.
 */
export function isDeliberatePause(membership: PausableMembership): boolean {
  if (membership.status !== "paused") return false;
  if (!membership.pauseMode) return false;
  if ((membership.failedPaymentCount ?? 0) > 0) return false;
  if (membership.bookingSuspended) return false;
  return true;
}

/**
 * Whether billing should restart now.
 *
 * A manual pause never becomes due, however long it has been — that is
 * what the client asked for, and a pause that quietly restarted after
 * some timeout would charge somebody who had been told it would not.
 */
export function isDueToResume(membership: PausableMembership, now: Date): boolean {
  if (!isDeliberatePause(membership)) return false;
  if (membership.pauseMode === "manual") return false;
  if (!membership.pauseResumesAt) return false;
  return membership.pauseResumesAt.getTime() <= now.getTime();
}

/** Those of a set of memberships whose pause has run out. */
export function membershipsDueToResume<T extends PausableMembership>(rows: readonly T[], now: Date): T[] {
  return rows.filter((row) => isDueToResume(row, now));
}

/** A sentence for the membership card, in the salon's own words. */
export function describePause(
  membership: PausableMembership,
  formatDate: (date: Date) => string,
): string {
  if (!isDeliberatePause(membership)) {
    return membership.status === "paused" ? "Suspended after a failed payment" : "Not paused";
  }
  if (membership.pauseMode === "manual" || !membership.pauseResumesAt) {
    return "Paused until someone restarts it";
  }
  return `Paused — billing restarts ${formatDate(membership.pauseResumesAt)}`;
}
