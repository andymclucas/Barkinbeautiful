/**
 * Support chat — the bubble on every staff screen (shared/supportChat.ts).
 *
 * Two halves:
 *  - The staff member's side (mine, send, requestPerson, markRead, close)
 *    is operationalProcedure: every staff login, restricted groomers
 *    included, and not gated on a section (see UNGATED_NAMESPACES). Each
 *    one reads and writes ONLY the caller's own conversation.
 *  - Support's side (inbox, thread, reply, closeThread, waitingCount) is
 *    for SUPPORT_AGENT_USER_IDS only, checked inside. It reads ACROSS
 *    salons on purpose: support is Groomigo's, not one salon's.
 *
 * The assistant is asked inside `send`, so the caller waits for its
 * answer. Once a person has been asked for it is never asked again.
 */
import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, operationalProcedure, protectedProcedure, tenantOf } from "../_core/trpc";
import { getDb } from "../db";
import { pushSubscriptions, staff, supportConversations, supportMessages, tenants } from "../../drizzle/schema";
import {
  ASSISTANT_UNAVAILABLE_LINE, HANDOVER_LINE, SUPPORT_AGENT_USER_IDS, SUPPORT_MESSAGE_MAX,
  asksForPerson, canAnswerSupport, isWithPerson, supportPushText, unreadCount,
  type SupportSender, type SupportStatus,
} from "@shared/supportChat";
import { isSafeAppPath } from "@shared/issueReports";
import { sendPushToUser } from "../webPush";
import { answerSupportMessage, supportAssistantConfigured } from "../supportAssistant";

/** A ceiling on one person's messages, so a stuck loop cannot run up a bill. */
const MAX_USER_MESSAGES_PER_HOUR = 60;

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const requireDb = async (): Promise<Db> => {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
};

const requireAgent = (user: { id: number }) => {
  if (!canAnswerSupport(user)) throw new TRPCError({ code: "FORBIDDEN", message: "The support inbox is for Groomigo support only." });
};

const messageInput = z.string().trim().min(1, "Type a message").max(SUPPORT_MESSAGE_MAX);

async function openConversation(db: Db, tenantId: number, userId: number) {
  const [row] = await db.select().from(supportConversations)
    .where(and(
      eq(supportConversations.tenantId, tenantId),
      eq(supportConversations.userId, userId),
      ne(supportConversations.status, "closed"),
    ))
    .orderBy(desc(supportConversations.id))
    .limit(1);
  return row ?? null;
}

async function messagesOf(db: Db, conversationId: number) {
  return db.select({
    id: supportMessages.id,
    sender: supportMessages.sender,
    body: supportMessages.body,
    createdAt: supportMessages.createdAt,
  }).from(supportMessages)
    .where(eq(supportMessages.conversationId, conversationId))
    .orderBy(asc(supportMessages.id))
    .limit(500);
}

async function addMessage(db: Db, conv: { id: number; tenantId: number }, sender: SupportSender, body: string, senderUserId: number | null) {
  await db.insert(supportMessages).values({
    conversationId: conv.id, tenantId: conv.tenantId, sender, senderUserId, body,
  });
  await db.update(supportConversations).set({ lastMessageAt: new Date() }).where(eq(supportConversations.id, conv.id));
}

/**
 * Tell support's phones. Never awaited by a caller and never throws: the
 * conversation row is the record, and the inbox badge shows it regardless.
 *
 * A push subscription belongs to the salon it was registered in, and
 * support answers every salon, so this sends to the agent's subscriptions
 * in whichever salons they have one.
 */
function notifyAgents(db: Db, conv: { id: number; tenantId: number; userName: string | null }, message: string, isNewRequest: boolean, exceptUserId: number) {
  void (async () => {
    const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, conv.tenantId)).limit(1);
    const { title, body } = supportPushText(conv.userName, tenant?.name ?? null, message, isNewRequest);
    const agents = SUPPORT_AGENT_USER_IDS.filter((id) => id !== exceptUserId);
    if (agents.length === 0) return;
    const subs = await db.selectDistinct({ tenantId: pushSubscriptions.tenantId, userId: pushSubscriptions.userId })
      .from(pushSubscriptions).where(inArray(pushSubscriptions.userId, agents));
    await Promise.all(subs.map((s) => sendPushToUser(s.tenantId, s.userId, {
      title, body,
      url: `/support?chat=${conv.id}`,
      tag: `support:${conv.id}`,
      kind: "new-message",
      renotify: true,
      requireInteraction: false,
    })));
  })().catch((err) => console.error("[supportChat] could not notify support for conversation", conv.id, err));
}

async function handOver(db: Db, conv: { id: number; tenantId: number; userName: string | null }, lastUserMessage: string, userId: number, lead?: string) {
  await db.update(supportConversations)
    .set({ status: "waiting", humanRequestedAt: new Date() })
    .where(eq(supportConversations.id, conv.id));
  await addMessage(db, conv, "system", lead ? `${lead} ${HANDOVER_LINE}` : HANDOVER_LINE, null);
  notifyAgents(db, conv, lastUserMessage, true, userId);
}

async function viewForUser(db: Db, tenantId: number, userId: number) {
  const conv = await openConversation(db, tenantId, userId);
  if (!conv) return { conversation: null, messages: [], unread: 0, assistantAvailable: supportAssistantConfigured() };
  const messages = await messagesOf(db, conv.id);
  return {
    conversation: { id: conv.id, status: conv.status as SupportStatus },
    messages,
    unread: unreadCount(messages, conv.userReadMessageId, "user"),
    assistantAvailable: supportAssistantConfigured(),
  };
}

export const supportChatRouter = router({
  /** The caller's own open conversation, if any. Polled while the window is open. */
  mine: operationalProcedure
    .input(z.object({ tenantId: z.number().int().positive().optional() }).optional())
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      return viewForUser(db, tenantOf(ctx, input ?? {}), ctx.user.id);
    }),

  send: operationalProcedure
    .input(z.object({
      tenantId: z.number().int().positive().optional(),
      message: messageInput,
      pagePath: z.string().max(512).refine(isSafeAppPath, "Invalid page").optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const tenantId = tenantOf(ctx, input);
      const userId = ctx.user.id;

      const [{ n }] = await db.select({ n: sql<number>`COUNT(*)` }).from(supportMessages)
        .where(and(
          eq(supportMessages.senderUserId, userId),
          eq(supportMessages.sender, "user"),
          gte(supportMessages.createdAt, new Date(Date.now() - 3_600_000)),
        ));
      if (Number(n) >= MAX_USER_MESSAGES_PER_HOUR) {
        throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "That is a lot of messages in an hour. Give it a few minutes, or use Report a problem." });
      }

      let conv = await openConversation(db, tenantId, userId);
      if (!conv) {
        const userName = (ctx.user.name ?? "").trim() || ctx.user.email || null;
        const [result] = await db.insert(supportConversations).values({
          tenantId, userId, userName, pagePath: input.pagePath ?? null,
        });
        const id = Number((result as { insertId?: number }).insertId);
        [conv] = await db.select().from(supportConversations).where(eq(supportConversations.id, id)).limit(1);
        if (!conv) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not start the chat. Try again." });
      }

      await addMessage(db, conv, "user", input.message, userId);

      if (isWithPerson(conv.status as SupportStatus)) {
        // A person owns it. The assistant stays out; support is told.
        notifyAgents(db, conv, input.message, false, userId);
      } else if (asksForPerson(input.message)) {
        await handOver(db, conv, input.message, userId);
      } else {
        const [me] = await db.select({ role: staff.role }).from(staff)
          .where(and(eq(staff.userId, userId), eq(staff.tenantId, tenantId))).limit(1);
        const answer = await answerSupportMessage({
          messages: await messagesOf(db, conv.id),
          pagePath: input.pagePath ?? conv.pagePath,
          role: me?.role ?? null,
        });
        // Read again: "Talk to a person" may have been pressed while the
        // assistant was thinking, and it must not then talk over a person.
        const [now] = await db.select({ status: supportConversations.status })
          .from(supportConversations).where(eq(supportConversations.id, conv.id)).limit(1);
        if (now && now.status === "ai") {
          if (!answer) {
            await handOver(db, conv, input.message, userId, ASSISTANT_UNAVAILABLE_LINE);
          } else {
            await addMessage(db, conv, "ai", answer.reply, null);
            if (answer.handoff) await handOver(db, conv, input.message, userId);
          }
        }
      }

      // The sender has, by definition, seen everything up to their own message.
      const view = await viewForUser(db, tenantId, userId);
      return view;
    }),

  /** The "Talk to a person" button. */
  requestPerson: operationalProcedure
    .input(z.object({ tenantId: z.number().int().positive().optional() }).optional())
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const tenantId = tenantOf(ctx, input ?? {});
      let conv = await openConversation(db, tenantId, ctx.user.id);
      if (!conv) {
        const userName = (ctx.user.name ?? "").trim() || ctx.user.email || null;
        const [result] = await db.insert(supportConversations).values({ tenantId, userId: ctx.user.id, userName });
        const id = Number((result as { insertId?: number }).insertId);
        [conv] = await db.select().from(supportConversations).where(eq(supportConversations.id, id)).limit(1);
        if (!conv) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not start the chat. Try again." });
      }
      if (!isWithPerson(conv.status as SupportStatus)) {
        const messages = await messagesOf(db, conv.id);
        const lastMine = [...messages].reverse().find((m) => m.sender === "user")?.body ?? "Asked to talk to a person.";
        await handOver(db, conv, lastMine, ctx.user.id);
      }
      return viewForUser(db, tenantId, ctx.user.id);
    }),

  markRead: operationalProcedure
    .input(z.object({ tenantId: z.number().int().positive().optional(), upToMessageId: z.number().int().nonnegative() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const conv = await openConversation(db, tenantOf(ctx, input), ctx.user.id);
      if (conv && input.upToMessageId > conv.userReadMessageId) {
        await db.update(supportConversations).set({ userReadMessageId: input.upToMessageId })
          .where(eq(supportConversations.id, conv.id));
      }
      return { ok: true };
    }),

  /** The staff member ends it. Their next message starts a fresh conversation. */
  close: operationalProcedure
    .input(z.object({ tenantId: z.number().int().positive().optional() }).optional())
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const conv = await openConversation(db, tenantOf(ctx, input ?? {}), ctx.user.id);
      if (conv) await db.update(supportConversations).set({ status: "closed" }).where(eq(supportConversations.id, conv.id));
      return { ok: true };
    }),

  // ── Support's side ─────────────────────────────────────────────────────

  /** How many conversations are waiting on support, for the sidebar badge. */
  waitingCount: protectedProcedure.query(async ({ ctx }) => {
    if (!canAnswerSupport(ctx.user)) return { waiting: 0 };
    const db = await requireDb();
    const rows = await db.select({
      id: supportConversations.id,
      status: supportConversations.status,
      agentRead: supportConversations.agentReadMessageId,
    }).from(supportConversations)
      .where(inArray(supportConversations.status, ["waiting", "human"]))
      .limit(500);
    if (rows.length === 0) return { waiting: 0 };
    // Grouped by a plain column, not an expression (CLAUDE.md §6).
    const lastUser = await db.select({
      conversationId: supportMessages.conversationId,
      lastId: sql<number>`MAX(${supportMessages.id})`.as("lastId"),
    }).from(supportMessages)
      .where(and(inArray(supportMessages.conversationId, rows.map((r) => r.id)), eq(supportMessages.sender, "user")))
      .groupBy(supportMessages.conversationId);
    const lastByConversation = new Map(lastUser.map((r) => [r.conversationId, Number(r.lastId)]));
    return { waiting: rows.filter((r) => r.status === "waiting" || (lastByConversation.get(r.id) ?? 0) > r.agentRead).length };
  }),

  inbox: protectedProcedure
    .input(z.object({ filter: z.enum(["open", "closed"]).default("open") }).optional())
    .query(async ({ input, ctx }) => {
      requireAgent(ctx.user);
      const db = await requireDb();
      const statuses: SupportStatus[] = (input?.filter ?? "open") === "open" ? ["waiting", "human"] : ["closed"];
      const rows = await db.select({
        id: supportConversations.id,
        tenantId: supportConversations.tenantId,
        salonName: tenants.name,
        userName: supportConversations.userName,
        status: supportConversations.status,
        pagePath: supportConversations.pagePath,
        humanRequestedAt: supportConversations.humanRequestedAt,
        lastMessageAt: supportConversations.lastMessageAt,
        agentRead: supportConversations.agentReadMessageId,
      }).from(supportConversations)
        .leftJoin(tenants, eq(tenants.id, supportConversations.tenantId))
        .where(and(
          inArray(supportConversations.status, statuses),
          // A closed conversation the assistant handled alone is not support's business.
          statuses.includes("closed") ? isNotNull(supportConversations.humanRequestedAt) : undefined,
        ))
        .orderBy(desc(supportConversations.lastMessageAt))
        .limit(100);
      if (rows.length === 0) return [];
      const all = await db.select({
        id: supportMessages.id, conversationId: supportMessages.conversationId,
        sender: supportMessages.sender, body: supportMessages.body,
      }).from(supportMessages)
        .where(inArray(supportMessages.conversationId, rows.map((r) => r.id)))
        .orderBy(asc(supportMessages.id));
      return rows.map((r) => {
        const messages = all.filter((m) => m.conversationId === r.id);
        const lastUser = [...messages].reverse().find((m) => m.sender === "user");
        return {
          id: r.id,
          salonName: r.salonName ?? `Salon ${r.tenantId}`,
          userName: r.userName ?? "Someone",
          status: r.status as SupportStatus,
          pagePath: r.pagePath,
          humanRequestedAt: r.humanRequestedAt,
          lastMessageAt: r.lastMessageAt,
          preview: (lastUser?.body ?? "").replace(/\s+/g, " ").slice(0, 160),
          unread: unreadCount(messages, r.agentRead, "agent"),
        };
      });
    }),

  /** One conversation in full. Opening it marks it read for support. */
  thread: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      requireAgent(ctx.user);
      const db = await requireDb();
      const [conv] = await db.select().from(supportConversations).where(eq(supportConversations.id, input.id)).limit(1);
      if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "That conversation no longer exists." });
      const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, conv.tenantId)).limit(1);
      const messages = await messagesOf(db, conv.id);
      const newest = messages.length ? messages[messages.length - 1].id : 0;
      if (newest > conv.agentReadMessageId) {
        await db.update(supportConversations).set({ agentReadMessageId: newest }).where(eq(supportConversations.id, conv.id));
      }
      return {
        id: conv.id,
        status: conv.status as SupportStatus,
        userName: conv.userName ?? "Someone",
        salonName: tenant?.name ?? `Salon ${conv.tenantId}`,
        pagePath: conv.pagePath,
        messages,
      };
    }),

  reply: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), message: messageInput }))
    .mutation(async ({ input, ctx }) => {
      requireAgent(ctx.user);
      const db = await requireDb();
      const [conv] = await db.select().from(supportConversations).where(eq(supportConversations.id, input.id)).limit(1);
      if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "That conversation no longer exists." });
      if (conv.status === "closed") throw new TRPCError({ code: "BAD_REQUEST", message: "This conversation has been closed." });
      await addMessage(db, conv, "human", input.message, ctx.user.id);
      const [{ newest }] = await db.select({ newest: sql<number>`COALESCE(MAX(${supportMessages.id}), 0)` })
        .from(supportMessages).where(eq(supportMessages.conversationId, conv.id));
      // Replying takes it over, whatever state it was in, and counts as having read it.
      await db.update(supportConversations)
        .set({ status: "human", agentReadMessageId: Number(newest) })
        .where(eq(supportConversations.id, conv.id));
      void sendPushToUser(conv.tenantId, conv.userId, {
        title: "Groomigo support replied",
        body: input.message.replace(/\s+/g, " ").slice(0, 140),
        url: "/calendar?support=open",
        tag: `support-reply:${conv.id}`,
        kind: "new-message",
        renotify: true,
        requireInteraction: false,
      }).catch((err) => console.error("[supportChat] could not notify the staff member", conv.userId, err));
      return { ok: true };
    }),

  closeThread: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      requireAgent(ctx.user);
      const db = await requireDb();
      const [conv] = await db.select().from(supportConversations).where(eq(supportConversations.id, input.id)).limit(1);
      if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "That conversation no longer exists." });
      if (conv.status !== "closed") {
        await addMessage(db, conv, "system", "Support closed this conversation. Send a new message any time to start another.", null);
        await db.update(supportConversations).set({ status: "closed" }).where(eq(supportConversations.id, conv.id));
      }
      return { ok: true };
    }),
});
