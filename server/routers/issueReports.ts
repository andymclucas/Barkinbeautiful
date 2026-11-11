/**
 * "Report a problem" — staff send, the owners work through them.
 *
 * Andy, 11/11/2026: "all staff, in-app notification". So:
 *  - submit is operationalProcedure: every staff login, restricted groomers
 *    included, can report from any screen they can reach. It is not gated
 *    on a section (see UNGATED_NAMESPACES) — a problem with the Workflow
 *    Board is exactly the kind a bather should be able to send.
 *  - list / openCount / setStatus are for the salon owners only:
 *    canAdministerStaff (Lauren and Andy), NOT users.role === "admin",
 *    which four groomers hold. A report carries a screenshot of whatever
 *    was on screen, client details included.
 *
 * The rules are in shared/issueReports.ts; images are uploaded first
 * through /api/upload/issue-report-image and referenced here by key.
 */
import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, operationalProcedure, protectedProcedure, tenantOf } from "../_core/trpc";
import { getDb } from "../db";
import { clients, issueReports, pets, uploadedImages } from "../../drizzle/schema";
import { canAdministerStaff, STAFF_ADMINISTRATOR_USER_IDS } from "@shared/staffAdministrators";
import {
  ISSUE_MAX_PHOTOS, ISSUE_MESSAGE_MAX, ISSUE_STATUSES, OPEN_ISSUE_STATUSES,
  isIssueImageKey, issuePushText, recentIssueErrors,
  type IssueContext, type IssueImage, type IssueStatus,
} from "@shared/issueReports";
import { sendPushToUser } from "../webPush";

const DENIED = "Problem reports are visible to the salon owner only.";

const requireOwner = (user: { id: number; email?: string | null }) => {
  if (!canAdministerStaff(user)) throw new TRPCError({ code: "FORBIDDEN", message: DENIED });
};

const contextInput = z.object({
  clientId: z.number().int().positive().optional(),
  petId: z.number().int().positive().optional(),
  appointmentId: z.number().int().positive().optional(),
  staffId: z.number().int().positive().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().max(600).optional(),
  viewport: z.string().max(40).optional(),
  userAgent: z.string().max(400).optional(),
}).strict();

export const issueReportsRouter = router({
  submit: operationalProcedure
    .input(z.object({
      tenantId: z.number().int().positive().optional(),
      message: z.string().trim().min(1, "Say what went wrong").max(ISSUE_MESSAGE_MAX),
      pagePath: z.string().max(512).optional(),
      pageTitle: z.string().max(255).optional(),
      context: contextInput.optional(),
      recentErrors: z.array(z.object({
        kind: z.string().max(60),
        message: z.string().max(2000),
        at: z.string().max(40),
      })).max(50).optional(),
      images: z.array(z.object({
        key: z.string().max(255),
        kind: z.enum(["screenshot", "photo"]),
      })).max(ISSUE_MAX_PHOTOS + 1).default([]),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);

      const images: IssueImage[] = input.images.filter((img) => isIssueImageKey(img.key));
      if (images.length !== input.images.length) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "One of the attachments could not be used. Try attaching it again." });
      }
      if (images.filter((i) => i.kind === "screenshot").length > 1 || images.filter((i) => i.kind === "photo").length > ISSUE_MAX_PHOTOS) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Up to ${ISSUE_MAX_PHOTOS} photos and one screenshot.` });
      }
      if (images.length > 0) {
        const found = await db.select({ key: uploadedImages.storageKey }).from(uploadedImages)
          .where(inArray(uploadedImages.storageKey, images.map((i) => i.key)));
        if (found.length !== new Set(images.map((i) => i.key)).size) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "An attachment did not finish uploading. Try attaching it again." });
        }
      }

      const reporterName = (ctx.user.name ?? "").trim() || ctx.user.email || null;
      const [result] = await db.insert(issueReports).values({
        tenantId,
        reporterUserId: ctx.user.id,
        reporterName,
        message: input.message,
        pagePath: input.pagePath ?? null,
        pageTitle: input.pageTitle ?? null,
        context: (input.context ?? null) as IssueContext | null,
        recentErrors: recentIssueErrors(input.recentErrors ?? [], Date.now()),
        imageKeys: images,
      });
      const id = Number((result as { insertId?: number }).insertId);

      // Tell the owners' phones, but not the person who sent it. Never
      // allowed to fail the report: the row is the record, the push is a nudge.
      const { title, body } = issuePushText(reporterName, input.message);
      const recipients = STAFF_ADMINISTRATOR_USER_IDS.filter((uid) => uid !== ctx.user.id);
      void Promise.all(recipients.map((uid) => sendPushToUser(tenantId, uid, {
        title, body,
        url: `/issues?report=${id}`,
        tag: `issue:${id}`,
        kind: "issue-report",
        renotify: false,
        requireInteraction: false,
      }).catch((err) => console.error("[issueReports] push failed", uid, err))));

      return { id };
    }),

  list: protectedProcedure
    .input(z.object({
      tenantId: z.number().int().positive().optional(),
      filter: z.enum(["open", "closed", "all"]).default("open"),
    }).optional())
    .query(async ({ input, ctx }) => {
      requireOwner(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input ?? {});
      const filter = input?.filter ?? "open";
      const statuses: IssueStatus[] = filter === "open"
        ? [...OPEN_ISSUE_STATUSES]
        : filter === "closed" ? ["fixed", "dismissed"] : [...ISSUE_STATUSES];

      const rows = await db.select().from(issueReports)
        .where(and(eq(issueReports.tenantId, tenantId), inArray(issueReports.status, statuses)))
        .orderBy(desc(issueReports.createdAt))
        .limit(200);

      // Names for the records a report points at, so the inbox says
      // "Pat Grant" rather than "client 812".
      const clientIds = Array.from(new Set(rows.map((r) => r.context?.clientId).filter((n): n is number => !!n)));
      const petIds = Array.from(new Set(rows.map((r) => r.context?.petId).filter((n): n is number => !!n)));
      const [clientRows, petRows] = await Promise.all([
        clientIds.length ? db.select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName })
          .from(clients).where(and(eq(clients.tenantId, tenantId), inArray(clients.id, clientIds))) : Promise.resolve([]),
        petIds.length ? db.select({ id: pets.id, name: pets.name })
          .from(pets).where(and(eq(pets.tenantId, tenantId), inArray(pets.id, petIds))) : Promise.resolve([]),
      ]);
      const clientName = new Map(clientRows.map((c) => [c.id, [c.firstName, c.lastName].filter(Boolean).join(" ")]));
      const petName = new Map(petRows.map((p) => [p.id, p.name]));

      return rows.map((r) => ({
        id: r.id,
        reporterName: r.reporterName,
        reporterUserId: r.reporterUserId,
        message: r.message,
        pagePath: r.pagePath,
        pageTitle: r.pageTitle,
        context: r.context ?? {},
        clientName: r.context?.clientId ? clientName.get(r.context.clientId) ?? null : null,
        petName: r.context?.petId ? petName.get(r.context.petId) ?? null : null,
        recentErrors: r.recentErrors ?? [],
        images: (r.imageKeys ?? []).map((img) => ({
          ...img,
          url: `/api/issue-report-image?key=${encodeURIComponent(img.key)}`,
        })),
        status: r.status as IssueStatus,
        resolutionNote: r.resolutionNote,
        statusChangedAt: r.statusChangedAt,
        createdAt: r.createdAt,
      }));
    }),

  /** For the sidebar badge. Zero, not an error, for anyone else. */
  openCount: protectedProcedure
    .input(z.object({ tenantId: z.number().int().positive().optional() }).optional())
    .query(async ({ input, ctx }) => {
      if (!canAdministerStaff(ctx.user)) return { open: 0, unread: 0 };
      const db = await getDb();
      if (!db) return { open: 0, unread: 0 };
      const tenantId = tenantOf(ctx, input ?? {});
      const [row] = await db.select({
        open: sql<number>`COUNT(*)`,
        unread: sql<number>`SUM(CASE WHEN ${issueReports.status} = 'new' THEN 1 ELSE 0 END)`,
      }).from(issueReports)
        .where(and(eq(issueReports.tenantId, tenantId), inArray(issueReports.status, [...OPEN_ISSUE_STATUSES])));
      return { open: Number(row?.open ?? 0), unread: Number(row?.unread ?? 0) };
    }),

  setStatus: protectedProcedure
    .input(z.object({
      tenantId: z.number().int().positive().optional(),
      id: z.number().int().positive(),
      status: z.enum(ISSUE_STATUSES),
      note: z.string().trim().max(2000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireOwner(ctx.user);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      const [result] = await db.update(issueReports).set({
        status: input.status,
        ...(input.note !== undefined ? { resolutionNote: input.note || null } : {}),
        statusChangedAt: new Date(),
        statusChangedByUserId: ctx.user.id,
      }).where(and(eq(issueReports.id, input.id), eq(issueReports.tenantId, tenantId)));
      if (!(result as { affectedRows?: number }).affectedRows) {
        throw new TRPCError({ code: "NOT_FOUND", message: "That report no longer exists." });
      }
      return { ok: true };
    }),
});
