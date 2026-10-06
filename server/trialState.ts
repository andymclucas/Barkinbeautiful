/**
 * Whether a salon's trial has run out, cached per request-ish.
 *
 * Read on every authenticated call, so it cannot be a database round
 * trip each time — but it also cannot be stale for long, because the
 * moment somebody pays they expect the product back. Thirty seconds is
 * short enough that nobody notices and long enough to matter under load.
 */
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { tenants } from "../drizzle/schema";
import { trialHasEnded, trialDaysLeft } from "../shared/planEntitlements";

export {
  allowedWhileExpired,
  TRIAL_ENDED_MESSAGE,
} from "../shared/planEntitlements";

const TTL_MS = 30_000;
const cache = new Map<number, TrialState & { at: number }>();

export type TrialState = {
  /** Locked out: the trial ran out and nobody paid. */
  ended: boolean;
  /** Whole days remaining, or null when this salon is not on a trial at all. */
  daysLeft: number | null;
  /** Barkin' Beautiful. No date can switch them off. */
  exempt: boolean;
  /** Whether a trial date is set — a paid salon has none. */
  onTrial: boolean;
};

const NOT_ON_TRIAL: TrialState = {
  ended: false,
  daysLeft: null,
  exempt: false,
  onTrial: false,
};

export async function getTrialState(tenantId: number): Promise<TrialState> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) {
    const { at: _at, ...state } = hit;
    return state;
  }

  try {
    const db = await getDb();
    if (!db) return NOT_ON_TRIAL;
    const [row] = await db
      .select({
        subscriptionPlan: tenants.subscriptionPlan,
        subscriptionStatus: tenants.subscriptionStatus,
        billingExempt: tenants.billingExempt,
        trialEndsAt: tenants.trialEndsAt,
      })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    if (!row) return NOT_ON_TRIAL;

    // Exemption first: no date can switch off Barkin' Beautiful.
    const exempt = Boolean(row.billingExempt);
    const state: TrialState = {
      ended: exempt ? false : trialHasEnded(row),
      daysLeft: trialDaysLeft(row),
      exempt,
      onTrial: row.trialEndsAt !== null && row.trialEndsAt !== undefined,
    };
    cache.set(tenantId, { ...state, at: Date.now() });
    return state;
  } catch (error) {
    // A lookup failure must never lock a salon out of its own diary.
    console.error("[trial] state lookup failed for tenant", tenantId, error);
    return NOT_ON_TRIAL;
  }
}

export function forgetTrialState(tenantId?: number) {
  if (tenantId === undefined) cache.clear();
  else cache.delete(tenantId);
}
