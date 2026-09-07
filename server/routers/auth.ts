import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getDb } from "../db";
import { staff, users } from "../../drizzle/schema";
import { and, eq } from "drizzle-orm";
import { sdk } from "../_core/sdk";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { sendEmail } from "../email";
export const authRouter = router({
  // ── Who am I? ─────────────────────────────────────────────────────────────
  me: publicProcedure.query((opts) => opts.ctx.user ?? null),

  // ── Email / password login ─────────────────────────────────────────────────
  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
        rememberMe: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, input.email.toLowerCase()))
        .limit(1);

      if (!user || !user.passwordHash) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }

      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }

      if (user.role === "staff") {
        const [staffProfile] = await db.select({ portalStatus: staff.portalStatus })
          .from(staff).where(and(eq(staff.userId, user.id), eq(staff.portalStatus, "approved"))).limit(1);
        if (!staffProfile) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Your account is set up and awaiting administrator approval." });
        }
      }

      // Update last signed in
      await db
        .update(users)
        .set({ lastSignedIn: new Date() })
        .where(eq(users.id, user.id));

      // Create session token using the SDK
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || user.email || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(ctx.req);
      // rememberMe = true → 30-day persistent cookie; false → session cookie (expires on browser close)
      const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;
      if (input.rememberMe) {
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: THIRTY_DAYS_MS });
      } else {
        // Session cookie: omit maxAge so browser discards it on close
        const { maxAge: _omit, ...sessionCookieOptions } = cookieOptions as typeof cookieOptions & { maxAge?: number };
        ctx.res.cookie(COOKIE_NAME, sessionToken, sessionCookieOptions);
      }

      return {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      };
    }),

  // ── Logout ─────────────────────────────────────────────────────────────────
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),

  // ── Change password (admin only) ───────────────────────────────────────────
  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, ctx.user.id))
        .limit(1);

      if (!user?.passwordHash) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "No password set for this account" });
      }

      const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Current password is incorrect" });
      }

      const newHash = await bcrypt.hash(input.newPassword, 12);
      await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, user.id));

      return { success: true };
    }),

  // ── Request password reset ─────────────────────────────────────────────────
  requestPasswordReset: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [user] = await db
        .select({ id: users.id, name: users.name, email: users.email, passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.email, input.email.toLowerCase()))
        .limit(1);

      // Always return success to prevent email enumeration
      if (!user || !user.passwordHash) return { success: true };

      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = await bcrypt.hash(token, 10);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Store the reset token in its own dedicated columns \u2014 the user's
      // actual passwordHash is never touched until they successfully complete
      // the reset with a new password. (A previous version of this code
      // overwrote passwordHash directly with the reset token, which
      // permanently destroyed the account's real password the moment a
      // reset was *requested*, with no way to recover it if the reset was
      // never completed \u2014 e.g. because the email didn't arrive.)
      await db.update(users)
        .set({ passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt })
        .where(eq(users.id, user.id));

      const resetLink = `${process.env.VITE_APP_URL ?? "https://groomingsos-mqzfsvzv.manus.space"}/login?reset=${token}&email=${encodeURIComponent(input.email)}`;

      await sendEmail({
        to: input.email,
        subject: "Groomigo — Password Reset Request",
        html: `<p>Hi ${user.name ?? "there"},</p>
<p>A password reset was requested for your Groomigo account.</p>
<p><a href="${resetLink}" style="background:#00c9a7;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin:12px 0">Reset my password</a></p>
<p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email \u2014 your current password will keep working.</p>
<p>— The Groomigo team</p>`,
      });

      return { success: true };
    }),

  // ── Complete password reset ─────────────────────────────────────────────────
  completePasswordReset: publicProcedure
    .input(z.object({
      email: z.string().email(),
      token: z.string().min(1),
      newPassword: z.string().min(8),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const invalidOrExpired = new TRPCError({
        code: "BAD_REQUEST",
        message: "This reset link is invalid or has expired. Please request a new one.",
      });

      const [user] = await db
        .select({
          id: users.id,
          passwordResetTokenHash: users.passwordResetTokenHash,
          passwordResetExpiresAt: users.passwordResetExpiresAt,
        })
        .from(users)
        .where(eq(users.email, input.email.toLowerCase()))
        .limit(1);

      if (!user || !user.passwordResetTokenHash || !user.passwordResetExpiresAt) throw invalidOrExpired;
      if (user.passwordResetExpiresAt.getTime() < Date.now()) throw invalidOrExpired;

      const tokenValid = await bcrypt.compare(input.token, user.passwordResetTokenHash);
      if (!tokenValid) throw invalidOrExpired;

      const newHash = await bcrypt.hash(input.newPassword, 12);
      await db.update(users)
        .set({ passwordHash: newHash, passwordResetTokenHash: null, passwordResetExpiresAt: null })
        .where(eq(users.id, user.id));

      return { success: true };
    }),
});
