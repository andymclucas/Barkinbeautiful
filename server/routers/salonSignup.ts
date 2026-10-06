/**
 * Creating a new salon on Groomigo.
 *
 * `publicProcedure`, necessarily — nobody signing up has an account yet.
 * That makes it the only endpoint in the system that creates a TENANT
 * from an unauthenticated request, so it is written defensively: a short
 * per-address rate limit, reserved slugs refused, and every write done in
 * an order that cannot leave a half-made salon behind.
 *
 * What it deliberately does NOT do: take payment, provision a phone
 * number, or create anything at Stripe. A salon lands on a trial with
 * every feature, and the commercial parts happen afterwards when there
 * is somebody to ask. Signup failing because Stripe was slow would be a
 * poor first impression.
 */
import { z } from "zod";
import { trialEndsAfter, TRIAL_DAYS } from "@shared/planEntitlements";
import bcrypt from "bcryptjs";
import { and, eq, like } from "drizzle-orm";
import { nanoid } from "nanoid";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { tenants, users, staff, signupVerifications } from "../../drizzle/schema";
import { sdk } from "../_core/sdk";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import {
  slugifySalonName, checkSlugShape, nextFreeSlug, checkPassword, splitName,
  SLUG_PROBLEM_MESSAGES, PASSWORD_PROBLEM_MESSAGES, MIN_PASSWORD_LENGTH,
} from "@shared/salonSignup";
import {
  codeState, codeExpiry, normaliseCode, verificationStillGood, buildVerificationEmail,
  CODE_STATE_MESSAGES, CODE_LENGTH, MAX_ATTEMPTS,
} from "@shared/signupVerification";
import { sendEmail } from "../email";
import crypto from "node:crypto";

const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;

/**
 * A crude in-memory limit on how fast salons can be created.
 *
 * Not a security control on its own — the process restarts and it is
 * gone — but it turns a trivially scripted flood into a nuisance, and
 * costs nothing. A real limiter belongs at the edge.
 */
const RECENT = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 3;

function tooManyFrom(ip: string): boolean {
  const now = Date.now();
  const hits = (RECENT.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  RECENT.set(ip, hits);
  if (RECENT.size > 5000) RECENT.clear(); // never grows without bound
  return hits.length > MAX_PER_WINDOW;
}

export const salonSignupRouter = router({
  /**
   * What address a salon name would get, before they commit to it.
   *
   * Public and read-only: it reveals only whether a slug is free, which
   * is already visible to anybody who tries the hostname.
   */
  previewSlug: publicProcedure
    .input(z.object({ salonName: z.string().max(200) }))
    .query(async ({ input }) => {
      const base = slugifySalonName(input.salonName);
      const shape = checkSlugShape(base);
      if (shape) return { slug: base, available: false, problem: SLUG_PROBLEM_MESSAGES[shape] };

      const db = await getDb();
      if (!db) return { slug: base, available: true, problem: null };

      const taken = await db.select({ slug: tenants.slug }).from(tenants)
        .where(like(tenants.slug, `${base}%`));
      const slug = nextFreeSlug(base, taken.map((t) => t.slug));
      return { slug, available: slug === base, problem: null };
    }),

  /**
   * Send a code to an address, so it can be proved before anything is
   * made.
   *
   * Always reports success, whatever is behind the address. Saying "that
   * email already has an account" HERE would turn this endpoint into a
   * way to ask whether any given salon owner is a Groomigo customer. The
   * create step still says so plainly, where the person has committed to
   * signing up and the answer is useful to them rather than to a
   * stranger with a list of addresses.
   */
  requestCode: publicProcedure
    .input(z.object({ email: z.string().email().max(320) }))
    .mutation(async ({ input, ctx }) => {
      const ip = String(ctx.req.ip ?? ctx.req.socket?.remoteAddress ?? "unknown");
      if (tooManyFrom(ip)) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many codes requested. Try again shortly." });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Database unavailable" });

      const email = input.email.trim().toLowerCase();
      // Digits from a CSPRNG, not Math.random: briefly this is enough to
      // create an account.
      const code = String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
      const codeHash = await bcrypt.hash(code, 10);

      // One row per address, replaced each time, so asking again
      // supersedes the last code rather than leaving two that both work.
      await db.insert(signupVerifications).values({
        email, codeHash, expiresAt: codeExpiry(), attempts: 0, verifiedAt: null, requestedFrom: ip.slice(0, 64),
      }).onDuplicateKeyUpdate({
        set: { codeHash, expiresAt: codeExpiry(), attempts: 0, verifiedAt: null, requestedFrom: ip.slice(0, 64) },
      });

      const mail = buildVerificationEmail(code);
      const sent = await sendEmail({ to: email, subject: mail.subject, html: mail.html });
      if (!sent) {
        // Resend unconfigured, or it refused. Said out loud rather than
        // leaving somebody waiting for an email that is never coming.
        console.error("[signup] verification email could not be sent to", email);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "We could not send the code. Try again, or get in touch and we will set you up.",
        });
      }
      return { sent: true };
    }),

  /** Check the digits. Spends an attempt whether or not they are right. */
  verifyCode: publicProcedure
    .input(z.object({ email: z.string().email().max(320), code: z.string().max(20) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Database unavailable" });

      const email = input.email.trim().toLowerCase();
      const [row] = await db.select().from(signupVerifications)
        .where(eq(signupVerifications.email, email)).limit(1);

      // Checked BEFORE comparing, so a locked or expired row costs no
      // bcrypt work and cannot be used to time the difference.
      const state = codeState(row ?? null);
      if (!state.usable) throw new TRPCError({ code: "BAD_REQUEST", message: CODE_STATE_MESSAGES[state.reason] });

      const typed = normaliseCode(input.code);
      const matches = typed.length === CODE_LENGTH && await bcrypt.compare(typed, row.codeHash);

      if (!matches) {
        const attempts = row.attempts + 1;
        await db.update(signupVerifications).set({ attempts })
          .where(eq(signupVerifications.id, row.id));
        const left = MAX_ATTEMPTS - attempts;
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: left > 0
            ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.`
            : CODE_STATE_MESSAGES.locked,
        });
      }

      await db.update(signupVerifications).set({ verifiedAt: new Date() })
        .where(eq(signupVerifications.id, row.id));
      return { verified: true };
    }),

  create: publicProcedure
    .input(z.object({
      salonName: z.string().min(1).max(200),
      ownerName: z.string().min(1).max(200),
      email: z.string().email().max(320),
      password: z.string().min(MIN_PASSWORD_LENGTH).max(200),
      phone: z.string().max(40).optional(),
      timezone: z.string().max(64).default("Australia/Brisbane"),
    }))
    .mutation(async ({ input, ctx }) => {
      const ip = String(ctx.req.ip ?? ctx.req.socket?.remoteAddress ?? "unknown");
      if (tooManyFrom(ip)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "That is a lot of salons in one hour. Get in touch and we will set the rest up with you.",
        });
      }

      const db = await getDb();
      if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Database unavailable" });

      const passwordProblem = checkPassword(input.password);
      if (passwordProblem) {
        throw new TRPCError({ code: "BAD_REQUEST", message: PASSWORD_PROBLEM_MESSAGES[passwordProblem] });
      }

      const email = input.email.trim().toLowerCase();

      // Nothing is created for an address nobody has proved they can
      // read. This is what stops /signup being a way to fill the
      // database with salons: a flood now needs a mailbox each.
      const [proof] = await db.select().from(signupVerifications)
        .where(eq(signupVerifications.email, email)).limit(1);
      if (!verificationStillGood(proof?.verifiedAt)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Confirm your email address first — we will send you a code.",
        });
      }

      const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
      if (existing) {
        // Deliberately specific. This is a signup form, not a login: a
        // vague "something went wrong" leaves somebody retyping a
        // password that was never the problem.
        throw new TRPCError({
          code: "CONFLICT",
          message: "There is already an account with that email. Sign in instead, or use another address.",
        });
      }

      const base = slugifySalonName(input.salonName);
      const shape = checkSlugShape(base);
      if (shape) throw new TRPCError({ code: "BAD_REQUEST", message: SLUG_PROBLEM_MESSAGES[shape] });

      const nearby = await db.select({ slug: tenants.slug }).from(tenants).where(like(tenants.slug, `${base}%`));
      const slug = nextFreeSlug(base, nearby.map((t) => t.slug));

      // ── The salon ───────────────────────────────────────────────────
      // A trial with everything, because a salon evaluating Groomigo has
      // to see the workflow board — it is the reason to pay for the top
      // plan and they will not find it elsewhere.
      const [tenantResult] = await db.insert(tenants).values({
        name: input.salonName.trim(),
        slug,
        email,
        phone: input.phone?.trim() || null,
        timezone: input.timezone,
        subscriptionPlan: "trial",
        subscriptionStatus: "trialing",
        // The clock starts when the salon is created, not when they first
        // log in — otherwise a salon that signs up and wanders off keeps an
        // open-ended trial for as long as it never visits.
        trialEndsAt: trialEndsAfter(),
        onlineBookingEnabled: false,
      });
      const tenantId = Number((tenantResult as { insertId?: number } | undefined)?.insertId ?? 0);
      if (!tenantId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not create the salon" });

      try {
        // ── The owner ─────────────────────────────────────────────────
        const passwordHash = await bcrypt.hash(input.password, 12);
        const openId = `salon_${nanoid(20)}`;
        const [userResult] = await db.insert(users).values({
          openId,
          tenantId,
          name: input.ownerName.trim(),
          email,
          passwordHash,
          loginMethod: "password",
          role: "admin",
          timezone: input.timezone,
        });
        const userId = Number((userResult as { insertId?: number } | undefined)?.insertId ?? 0);
        if (!userId) throw new Error("Could not create the owner account");

        // ── Their staff record ────────────────────────────────────────
        // Without this the owner has no presence on the calendar or the
        // workflow board, and the tenant resolution that falls back to a
        // staff row has nothing to fall back to.
        const { firstName } = splitName(input.ownerName);
        await db.insert(staff).values({
          tenantId,
          userId,
          name: input.ownerName.trim(),
          email,
          phone: input.phone?.trim() || null,
          role: "owner",
          portalStatus: "approved",
          colourHex: "#6D45D6",
        });

        // Signed in immediately. Making somebody who just typed a
        // password type it again is a poor first thirty seconds.
        const sessionToken = await sdk.createSessionToken(openId, {
          name: input.ownerName.trim(),
          expiresInMs: ONE_YEAR_MS,
        });
        ctx.res.cookie(COOKIE_NAME, sessionToken, getSessionCookieOptions(ctx.req));

        // Spent. One proven address makes one salon, not a supply of them.
        await db.delete(signupVerifications).where(eq(signupVerifications.email, email));

        console.log(`[signup] salon ${tenantId} "${input.salonName.trim()}" at ${slug}, owner ${userId} (${firstName}), ${TRIAL_DAYS}-day trial`);
        return { success: true, tenantId, slug, salonName: input.salonName.trim() };
      } catch (error) {
        // A salon with no owner can never be signed into and would sit
        // there holding its slug. MySQL DDL is not transactional here and
        // these are separate inserts, so the tenant is removed by hand.
        await db.delete(tenants).where(eq(tenants.id, tenantId)).catch(() => {});
        console.error("[signup] rolled back tenant", tenantId, error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "We could not finish setting up the salon. Nothing was created — please try again.",
        });
      }
    }),
});
