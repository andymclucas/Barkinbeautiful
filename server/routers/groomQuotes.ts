/**
 * Quoting extra work while the dog is on the table.
 *
 * The rules are in shared/groomQuote.ts and the reasoning for the feature
 * is there too. This file is the surface: who may do what, and what gets
 * written down.
 *
 * ## Procedure types
 *
 * `operationalProcedure` for everything the salon floor touches. Raising a
 * quote is the groomer's job, mid-groom, and most groomers here are
 * restricted `staff` accounts — `protectedProcedure` rejects those outright
 * (CLAUDE.md §5), which would make the feature unusable by the only people
 * who need it. Each of them then calls requireApprovedStaffAppointmentAccess,
 * so a groomer still only reaches appointments at their own salon.
 *
 * `publicProcedure` for the two the owner touches. They are not signed in
 * and must not be asked to be: the dog is on the table and an answer is
 * wanted in minutes, not after a password reset. The token is the whole
 * authorisation — see server/quoteToken.ts for why that is an acceptable
 * trade here and what bounds it.
 *
 * ## Every state change is guarded in the WHERE clause
 *
 * Not read-then-write. The owner tapping Approve twice, or tapping Approve
 * on their phone while the groomer records "he said yes" from the desk, is
 * an ordinary Tuesday — two writers, seconds apart, on the row that decides
 * whether somebody is charged. So each transition names the status it
 * expects in the WHERE and asserts exactly one row changed. The loser is
 * told what actually happened rather than silently overwriting the winner.
 *
 * `completeSetup` in routers.ts is the precedent for reading affectedRows
 * off `result[0]` — reading it off the array itself gives undefined, which
 * made a guard fire on every single call for weeks.
 */
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, operationalProcedure, tenantOf } from "../_core/trpc";
import { getDb } from "../db";
import {
  appointments, clients, groomQuoteLines, groomQuotes, pets, smsLogs, tenants,
} from "../../drizzle/schema";
import { requireApprovedStaffAppointmentAccess, requireApprovedStaffTenant } from "../staffAccess";
import { sendSms } from "../sms";
import { getPortalBaseUrl } from "../appUrl";
import { createQuoteToken, hashQuoteToken, QUOTE_TOKEN_PATTERN } from "../quoteToken";
import {
  canQuoteInWorkflowState, canTransitionQuote, isQuoteExpired, quoteExpiresAt,
  quoteRequestSms, quoteTotal, quoteUrl, validateQuoteLines,
  type QuoteStatus,
} from "@shared/groomQuote";

const LINE = z.object({
  description: z.string().trim().min(1).max(255),
  /** Dollars. Coerced from the form's string, never cents. */
  amount: z.coerce.number().finite(),
});

/** Rows a tenant-scoped read may return, so a stray id cannot cross salons. */
async function assertTenant(db: any, ctx: any, tenantId: number) {
  const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
  if (portalStaff && portalStaff.tenantId !== tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This salon is not available to your staff profile" });
  }
  return portalStaff;
}

/**
 * The status a quote really has right now, as opposed to the one stored.
 *
 * A quote sent at 9am and never answered is still `sent` in the database
 * until something looks at it. Rather than add a sweeper and a cron secret
 * for one column, every read passes through here and anything that finds an
 * overdue quote writes the expiry back as it goes. The write is guarded on
 * `status = 'sent'`, so an owner approving in the same second wins and the
 * expiry is simply not applied.
 *
 * Billing never depends on this running: loadApprovedQuoteExtras asks for
 * `approved` and an expired quote was never approved.
 */
async function settleExpiry(
  db: any,
  row: { id: number; tenantId: number; status: QuoteStatus; sentAt: Date | null },
  now = new Date(),
): Promise<QuoteStatus> {
  if (!isQuoteExpired(row.status, row.sentAt, now)) return row.status;
  await db.update(groomQuotes)
    .set({ status: "expired", updatedAt: now })
    .where(and(
      eq(groomQuotes.id, row.id),
      eq(groomQuotes.tenantId, row.tenantId),
      eq(groomQuotes.status, "sent"),
    ));
  return "expired";
}

/** One row changed, or say what actually happened. */
function assertOneRow(result: any, whatHappened: string) {
  if (Number(result?.[0]?.affectedRows ?? 0) !== 1) {
    throw new TRPCError({ code: "CONFLICT", message: whatHappened });
  }
}

async function loadQuoteForStaff(db: any, tenantId: number, quoteId: number) {
  const [row] = await db.select().from(groomQuotes)
    .where(and(eq(groomQuotes.id, quoteId), eq(groomQuotes.tenantId, tenantId)))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "That quote no longer exists" });
  return row;
}

export const groomQuotesRouter = router({
  /** Every quote on one appointment, for the groomer's panel. */
  listForAppointment: operationalProcedure
    .input(z.object({ tenantId: z.number().default(1), appointmentId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      await requireApprovedStaffAppointmentAccess(db, ctx.user, input.appointmentId);

      const rows = await db.select().from(groomQuotes)
        .where(and(
          eq(groomQuotes.tenantId, tenantId),
          eq(groomQuotes.appointmentId, input.appointmentId),
        ))
        .orderBy(desc(groomQuotes.createdAt));
      if (rows.length === 0) return { quotes: [] };

      const lines = await db.select().from(groomQuoteLines)
        .where(and(
          eq(groomQuoteLines.tenantId, tenantId),
          inArray(groomQuoteLines.quoteId, rows.map((r: any) => r.id)),
        ));

      const quotes = [];
      for (const row of rows) {
        const status = await settleExpiry(db, row);
        quotes.push({
          id: row.id,
          status,
          total: String(row.total),
          reason: row.reason,
          sentAt: row.sentAt,
          expiresAt: row.expiresAt,
          decidedAt: row.decidedAt,
          approvalSource: row.approvalSource,
          approvalNote: row.approvalNote,
          lines: lines
            .filter((l: any) => l.quoteId === row.id)
            .map((l: any) => ({ id: l.id, description: l.description, amount: String(l.amount) })),
        });
      }
      return { quotes };
    }),

  /** Build a quote. Draft only — nothing reaches the owner until `send`. */
  raise: operationalProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      appointmentId: z.number(),
      reason: z.string().trim().max(500).optional(),
      lines: z.array(LINE).min(1).max(10),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      const portalStaff = await requireApprovedStaffAppointmentAccess(db, ctx.user, input.appointmentId);

      const [appt] = await db.select({
        id: appointments.id,
        tenantId: appointments.tenantId,
        petId: appointments.petId,
        clientId: appointments.clientId,
        workflowState: appointments.workflowState,
      }).from(appointments)
        .where(and(eq(appointments.id, input.appointmentId), eq(appointments.tenantId, tenantId)))
        .limit(1);
      if (!appt) throw new TRPCError({ code: "NOT_FOUND", message: "That booking no longer exists" });

      // The dog has to be here and not yet gone home. Quoting after pickup
      // is a surprise charge, which is the thing this feature prevents.
      if (!canQuoteInWorkflowState(appt.workflowState)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: appt.workflowState === "complete"
            ? "This dog has already gone home — extra work has to be agreed while they are here"
            : "Extra work can only be quoted once the dog has been checked in",
        });
      }

      const validation = validateQuoteLines(input.lines);
      if (!validation.ok) throw new TRPCError({ code: "BAD_REQUEST", message: validation.reason });

      const total = quoteTotal(input.lines);
      let quoteId = 0;
      await db.transaction(async (tx: any) => {
        const inserted = await tx.insert(groomQuotes).values({
          tenantId,
          appointmentId: appt.id,
          petId: appt.petId,
          clientId: appt.clientId,
          status: "draft",
          total,
          reason: input.reason || null,
          raisedByUserId: ctx.user.id,
          raisedByStaffId: portalStaff?.id ?? null,
        });
        quoteId = Number((inserted as any)?.[0]?.insertId ?? 0);
        if (!quoteId) throw new Error("Could not create the quote");
        await tx.insert(groomQuoteLines).values(input.lines.map((l) => ({
          tenantId,
          quoteId,
          description: l.description,
          amount: l.amount.toFixed(2),
        })));
      });

      return { quoteId, total, status: "draft" as const };
    }),

  /**
   * Ask the owner.
   *
   * This is the point the price freezes and a real person gets a real text,
   * so it is a deliberate press rather than a side effect of raising.
   */
  send: operationalProcedure
    .input(z.object({ tenantId: z.number().default(1), quoteId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      await assertTenant(db, ctx, tenantId);

      const quote = await loadQuoteForStaff(db, tenantId, input.quoteId);
      await requireApprovedStaffAppointmentAccess(db, ctx.user, quote.appointmentId);
      if (!canTransitionQuote(quote.status as QuoteStatus, "sent")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only a draft quote can be sent" });
      }

      const [client] = await db.select({
        id: clients.id,
        firstName: clients.firstName,
        phone: clients.phone,
        smsOptedOutAt: clients.smsOptedOutAt,
      }).from(clients)
        .where(and(eq(clients.id, quote.clientId), eq(clients.tenantId, tenantId)))
        .limit(1);
      if (!client?.phone?.trim()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "There is no mobile number on this client — ring them and use Record their answer",
        });
      }
      /*
       * A client who asked to stop being texted does not get this one
       * either. It is tempting to argue a charge approval is different and
       * urgent, but that argument is available for every message and is how
       * an opt-out stops meaning anything. The fallback costs the salon
       * nothing: ring them, then Record their answer, which produces a
       * record that stands up just as well because it says who took it.
       */
      if (client.smsOptedOutAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${client.firstName} has asked not to be texted — ring them and use Record their answer`,
        });
      }

      const [petRow] = await db.select({ name: pets.name }).from(pets)
        .where(eq(pets.id, quote.petId)).limit(1);
      const [salon] = await db.select({ name: tenants.name }).from(tenants)
        .where(eq(tenants.id, tenantId)).limit(1);

      const { token, tokenHash } = createQuoteToken();
      const sentAt = new Date();
      const expiresAt = quoteExpiresAt(sentAt);

      // Claim the transition BEFORE texting. A send that writes after the
      // SMS can text the owner and then fail to record it, which leaves a
      // live link against a draft quote the owner can answer and nobody
      // can see. Claiming first means the worst case is a quote marked
      // sent whose text failed, which the groomer can see and retry.
      const claimed = await db.update(groomQuotes)
        .set({ status: "sent", tokenHash, sentAt, expiresAt, updatedAt: sentAt })
        .where(and(
          eq(groomQuotes.id, quote.id),
          eq(groomQuotes.tenantId, tenantId),
          eq(groomQuotes.status, "draft"),
        ));
      assertOneRow(claimed, "That quote has already been sent or withdrawn");

      const body = quoteRequestSms({
        salonName: salon?.name ?? "Your groomer",
        petName: petRow?.name ?? "your dog",
        total: String(quote.total),
        url: quoteUrl(getPortalBaseUrl(), token),
      });
      // trigger: "staff" — a person pressed Send. The allow-list in
      // shared/automatedSms.ts governs automated sends and does not apply
      // here, and this must never become automated without Andy saying so.
      const result = await sendSms(client.phone, body, { tenantId, trigger: "staff" });
      await db.insert(smsLogs).values({
        tenantId, clientId: client.id, toNumber: client.phone, body,
        twilioSid: result.sid, status: result.success ? "sent" : "failed",
        type: "custom", direction: "outbound", errorMessage: result.error,
      });

      return { sent: result.success, error: result.error ?? null, expiresAt };
    }),

  /** Take it back, usually because the figure was wrong. */
  withdraw: operationalProcedure
    .input(z.object({ tenantId: z.number().default(1), quoteId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      await assertTenant(db, ctx, tenantId);

      const quote = await loadQuoteForStaff(db, tenantId, input.quoteId);
      await requireApprovedStaffAppointmentAccess(db, ctx.user, quote.appointmentId);
      if (!canTransitionQuote(quote.status as QuoteStatus, "withdrawn")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This quote has already been answered" });
      }

      const updated = await db.update(groomQuotes)
        .set({ status: "withdrawn", tokenHash: null, updatedAt: new Date() })
        .where(and(
          eq(groomQuotes.id, quote.id),
          eq(groomQuotes.tenantId, tenantId),
          // Both, not just the current one: withdrawing has to lose the
          // race against an owner who is answering right now.
          inArray(groomQuotes.status, ["draft", "sent"]),
        ));
      assertOneRow(updated, "The owner answered that quote just now — reload to see what they said");
      return { success: true };
    }),

  /**
   * The owner answered a person rather than the link.
   *
   * A different fact from them tapping Approve, and a dispute turns on
   * which happened, so it is recorded as `staff` with a note saying how
   * they were reached. The note is required, not encouraged: "staff ticked
   * the box" is worth nothing six weeks later.
   */
  recordAnswer: operationalProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      quoteId: z.number(),
      decision: z.enum(["approved", "declined"]),
      note: z.string().trim().min(3).max(255),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      await assertTenant(db, ctx, tenantId);

      const quote = await loadQuoteForStaff(db, tenantId, input.quoteId);
      await requireApprovedStaffAppointmentAccess(db, ctx.user, quote.appointmentId);

      // A quote nobody sent has no agreed figure behind it, so it cannot be
      // answered — the groomer has to send it or withdraw it first.
      const status = await settleExpiry(db, quote);
      if (!canTransitionQuote(status as QuoteStatus, input.decision)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: status === "draft"
            ? "Send this quote before recording an answer to it"
            : "This quote has already been answered",
        });
      }

      const now = new Date();
      const updated = await db.update(groomQuotes)
        .set({
          status: input.decision,
          decidedAt: now,
          approvalSource: "staff",
          approvalNote: input.note,
          decidedByUserId: ctx.user.id,
          // The link stops working once there is an answer.
          tokenHash: null,
          updatedAt: now,
        })
        .where(and(
          eq(groomQuotes.id, quote.id),
          eq(groomQuotes.tenantId, tenantId),
          eq(groomQuotes.status, "sent"),
        ));
      assertOneRow(updated, "That quote was answered a moment ago — reload to see what it says");
      return { success: true, status: input.decision };
    }),

  /** The owner's page, reached by the token in their text. */
  getByToken: publicProcedure
    .input(z.object({ token: z.string().regex(QUOTE_TOKEN_PATTERN) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [row] = await db.select({
        id: groomQuotes.id,
        tenantId: groomQuotes.tenantId,
        status: groomQuotes.status,
        total: groomQuotes.total,
        reason: groomQuotes.reason,
        sentAt: groomQuotes.sentAt,
        expiresAt: groomQuotes.expiresAt,
        petName: pets.name,
        salonName: tenants.name,
      }).from(groomQuotes)
        .leftJoin(pets, eq(pets.id, groomQuotes.petId))
        .leftJoin(tenants, eq(tenants.id, groomQuotes.tenantId))
        .where(eq(groomQuotes.tokenHash, hashQuoteToken(input.token)))
        .limit(1);
      // Deliberately the same message whether the token never existed, was
      // answered, or was withdrawn: the page is public and should not help
      // anyone work out which.
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "This link is no longer active." });

      const status = await settleExpiry(db, row as any);
      const lines = await db.select({
        description: groomQuoteLines.description,
        amount: groomQuoteLines.amount,
      }).from(groomQuoteLines)
        .where(and(
          eq(groomQuoteLines.tenantId, row.tenantId),
          eq(groomQuoteLines.quoteId, row.id),
        ));

      return {
        status: status as QuoteStatus,
        petName: row.petName,
        salonName: row.salonName,
        reason: row.reason,
        total: String(row.total),
        expiresAt: row.expiresAt,
        lines: lines.map((l: any) => ({ description: l.description, amount: String(l.amount) })),
      };
    }),

  /** The owner's answer, from their own phone. */
  answerByToken: publicProcedure
    .input(z.object({
      token: z.string().regex(QUOTE_TOKEN_PATTERN),
      decision: z.enum(["approved", "declined"]),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const tokenHash = hashQuoteToken(input.token);
      const [row] = await db.select({
        id: groomQuotes.id,
        tenantId: groomQuotes.tenantId,
        status: groomQuotes.status,
        sentAt: groomQuotes.sentAt,
      }).from(groomQuotes).where(eq(groomQuotes.tokenHash, tokenHash)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "This link is no longer active." });

      const status = await settleExpiry(db, row as any);
      if (status === "expired") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This request has expired, so nothing has been charged. Please call the salon.",
        });
      }
      if (!canTransitionQuote(status as QuoteStatus, input.decision)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This link is no longer active." });
      }

      const now = new Date();
      const updated = await db.update(groomQuotes)
        .set({
          status: input.decision,
          decidedAt: now,
          approvalSource: "client",
          decidedByUserId: null,
          // One answer per link. Clearing the hash is what makes a second
          // tap — or a forwarded message — land on "no longer active"
          // rather than flipping an answer somebody already gave.
          tokenHash: null,
          updatedAt: now,
        })
        .where(and(
          eq(groomQuotes.id, row.id),
          eq(groomQuotes.tokenHash, tokenHash),
          eq(groomQuotes.status, "sent"),
        ));
      assertOneRow(updated, "This link is no longer active.");
      return { success: true, status: input.decision };
    }),
});
