import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { readableValidationMessage } from "@shared/clientFacingError";

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

export const router = t.router;
export const publicProcedure = t.procedure;

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
export const protectedProcedure = t.procedure.use(requireNonStaffUser);
export const operationalProcedure = t.procedure.use(requireUser);

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
);
