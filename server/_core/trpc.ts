import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { readableValidationMessage } from "@shared/clientFacingError";
import { mayAccessTenant, CROSS_TENANT_MESSAGE } from "@shared/tenantResolution";
import { getTrialState } from "../trialState";
import { allowedWhileExpired, TRIAL_ENDED_MESSAGE } from "@shared/planEntitlements";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  /**
   * Make a validation failure readable before it ever leaves the server.
   *
   * tRPC puts a ZodError's issues into `error.message` as JSON, so a staff
   * member editing a profile with a bad email was shown a toast containing
   * the entire regex for a valid address, with the one useful sentence —
   * "Invalid email address" — at the very end of it.
   *
   * Fixed here rather than at the 117 call sites that do
   * `onError: e => toast.error(e.message)`. Those are all correct; they were
   * handed machine output and had no way to know. Our own TRPCError messages
   * are written for people and pass through untouched.
   */
  errorFormatter({ shape, error }) {
    const readable = readableValidationMessage(error.message);
    if (!readable) return shape;
    return { ...shape, message: readable };
  },
});


/**
 * Which salon this call is about.
 *
 * Prefers the tenant resolved from the authenticated caller. `tenantId`
 * on the input is now only a fallback, kept so the existing clients keep
 * working while they are migrated off it — and because the PUBLIC
 * surface (online booking, the client portal) genuinely has no signed-in
 * user to resolve from and must still name its salon.
 *
 * The two can no longer disagree: enforceTenant refuses a request naming
 * a tenant other than the caller's own before this is ever reached. So on
 * the authenticated surface this returns the caller's salon, and the
 * number the client sent is ignored rather than trusted.
 *
 * The final `?? 1` is the last remnant of the single-salon assumption. It
 * is reached only when a caller has no resolvable tenant AND sent none,
 * which today means nothing real; it stays until the public surface
 * resolves its salon from the hostname, and then it goes.
 */
export function tenantOf(
  ctx: { tenantId?: number | null },
  input?: { tenantId?: number | null } | null,
): number {
  return ctx.tenantId ?? input?.tenantId ?? 1;
}

export const router = t.router;
export const publicProcedure = t.procedure;


/**
 * Refuse a request that names a salon other than the caller's own.
 *
 * This is the whole cross-tenant fix, in one place rather than in the 122
 * procedures that take a `tenantId` input. Every one of them currently
 * trusts that number, and the guard that was supposed to catch it —
 * requireApprovedStaffTenant — returns null for admins, which all eight
 * real users are. With one salon that is harmless; with two it is a data
 * breach performed by editing a number in a request.
 *
 * Deliberately a BLOCK, not a silent override. Quietly rewriting the
 * tenant would hide a client bug that is still worth finding, and would
 * make a genuinely cross-tenant feature (a future group-owner view)
 * impossible to add honestly later.
 *
 * Unauthenticated callers pass through: online booking and the client
 * portal have no signed-in user and are scoped by their own tokens.
 * Refusing those would take the public booking page down.
 */
const enforceTenant = t.middleware(async opts => {
  const { ctx, next, getRawInput } = opts;
  const raw = await getRawInput();
  const requested = (raw && typeof raw === "object" && "tenantId" in raw)
    ? (raw as { tenantId?: unknown }).tenantId
    : undefined;

  if (typeof requested === "number" && !mayAccessTenant(ctx.tenantId, requested)) {
    throw new TRPCError({ code: "FORBIDDEN", message: CROSS_TENANT_MESSAGE });
  }
  return next();
});

/**
 * Stop a salon whose trial has run out.
 *
 * In one place rather than on each procedure, because an expired trial
 * loses EVERYTHING — there is no feature left to check individually.
 *
 * The allowlist is what keeps this decent: they can still sign in, read
 * why, set up paying, and take their records with them. Holding a salon's
 * client list hostage over an unpaid invoice is not a thing we do; the
 * product stops, the data does not.
 *
 * Fails OPEN on any error. A lookup that throws must never be the reason a
 * salon cannot open its diary.
 */
const enforceTrial = t.middleware(async opts => {
  const { ctx, next, path } = opts;
  if (ctx.tenantId === null || allowedWhileExpired(path)) return next();
  try {
    const trial = await getTrialState(ctx.tenantId);
    if (trial.ended) throw new TRPCError({ code: "FORBIDDEN", message: TRIAL_ENDED_MESSAGE });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    console.error("[trial] check failed, allowing through:", error);
  }
  return next();
});

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

const requireNonStaffUser = t.middleware(async opts => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  if (ctx.user.role === "staff") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Staff accounts can access only their appointments and workflow." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

// Restricted staff accounts are deliberately excluded from the general application
// surface. Only narrowly scoped operational procedures opt into `operationalProcedure`.
export const protectedProcedure = t.procedure.use(requireNonStaffUser).use(enforceTenant).use(enforceTrial);
export const operationalProcedure = t.procedure.use(requireUser).use(enforceTenant).use(enforceTrial);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
).use(enforceTenant).use(enforceTrial);
