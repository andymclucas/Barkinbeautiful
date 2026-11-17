/**
 * What the app shows about the trial.
 *
 * `operationalProcedure` and on the expired-trial allowlist, because this
 * is the one call that still has to answer once a salon is locked out —
 * it is how they find out why. Every staff account sees it: a groomer
 * walking into a dead app deserves the reason too, not a wall of
 * forbidden errors.
 */
import { router, operationalProcedure, tenantOf } from "../_core/trpc";
import { getTrialState } from "../trialState";
import { TRIAL_DAYS } from "../../shared/planEntitlements";
import { isPlatformBillingOpen } from "../platformStripe";

export const trialRouter = router({
  get: operationalProcedure.query(async ({ ctx }) => {
    const tenantId = tenantOf(ctx, undefined) ?? 1;
    const state = await getTrialState(tenantId);
    return {
      ...state,
      trialDays: TRIAL_DAYS,
      /**
       * Whether to put anything on screen at all. A salon that is exempt
       * or paying has no trial, and a banner saying so would be noise on
       * every page of the app forever.
       */
      /*
       * Nor while Groomigo cannot take payment yet: a countdown to a
       * deadline that is not enforced, with a "Choose a plan" button
       * leading to no plans, is worse than saying nothing.
       */
      show: !state.exempt && state.onTrial && isPlatformBillingOpen(),
    };
  }),
});
