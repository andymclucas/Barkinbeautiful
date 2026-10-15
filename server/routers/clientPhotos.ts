/**
 * Getting a photo from a client, when the phone network will not carry one.
 *
 * The salon texts a link; the client taps it and picks a photo; it lands
 * against their record. See shared/clientPhotoRequest.ts for why this is
 * a link rather than an MMS.
 *
 * ## Procedure types
 *
 * `operationalProcedure` for the staff side. Asking a client for a photo
 * of a cut, or looking at what they sent, is salon-floor work — the
 * groomer who did the groom and the receptionist taking the call both
 * need it, and `protectedProcedure` would lock out every restricted staff
 * account. Each one re-checks the tenant, because the procedure type only
 * proves the caller is signed in.
 *
 * `publicProcedure` for the client's own page, which is reached by a
 * token and nothing else. It returns the first name and the reason and
 * stops there: enough for the client to know the link is theirs, nothing
 * a stranger with a guessed token could use.
 */
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, operationalProcedure, tenantOf } from "../_core/trpc";
import { getDb } from "../db";
import { clients, tenants, pets, clientPhotoRequests, clientPhotos, smsLogs } from "../../drizzle/schema";
import { requireApprovedStaffTenant } from "../staffAccess";
import { sendSms } from "../sms";
import { getAppBaseUrl } from "../appUrl";
import {
  createClientPhotoToken,
  hashClientPhotoToken,
  clientPhotoUrl,
  photoRequestSms,
  photoRequestState,
} from "@shared/clientPhotoRequest";

/** Restricted staff are confined to their own salon; admins are not. */
async function assertTenant(db: any, ctx: any, tenantId: number) {
  const portalStaff = await requireApprovedStaffTenant(db, ctx.user);
  if (portalStaff && portalStaff.tenantId !== tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This salon is not available to your staff profile" });
  }
}

export const clientPhotosRouter = router({
  /**
   * Text a client a link to send us a photo.
   *
   * Sends immediately, like the pickup message: a staff member pressed
   * the button, so there is no automation flag in front of it. The send
   * is logged to sms_logs as a `custom` message so it appears in the
   * conversation the client is looking at, in order, beside everything
   * else the salon has said to them.
   */
  request: operationalProcedure
    .input(z.object({
      tenantId: z.number().default(1),
      clientId: z.number(),
      petId: z.number().optional(),
      /** "a photo of Harvey's cut" — shown back on the client's page. */
      reason: z.string().trim().max(255).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      await assertTenant(db, ctx, tenantId);

      const [client] = await db.select({
        id: clients.id, firstName: clients.firstName, phone: clients.phone, salonName: tenants.name,
      })
        .from(clients)
        .innerJoin(tenants, eq(clients.tenantId, tenants.id))
        .where(and(eq(clients.id, input.clientId), eq(clients.tenantId, tenantId)))
        .limit(1);
      if (!client) throw new TRPCError({ code: "NOT_FOUND", message: "That client is not available to this salon" });
      if (!client.phone?.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `${client.firstName} has no mobile number on file.` });
      }

      if (input.petId !== undefined) {
        const [pet] = await db.select({ id: pets.id }).from(pets)
          .where(and(eq(pets.id, input.petId), eq(pets.clientId, client.id), eq(pets.tenantId, tenantId)))
          .limit(1);
        if (!pet) throw new TRPCError({ code: "BAD_REQUEST", message: "That dog is not on this client's record" });
      }

      const { token, tokenHash, expiresAt } = createClientPhotoToken();
      const [created] = await db.insert(clientPhotoRequests).values({
        tenantId, clientId: client.id, petId: input.petId ?? null,
        tokenHash, reason: input.reason || null,
        requestedByUserId: ctx.user.id, expiresAt,
      });
      const requestId = (created as any).insertId as number;

      const url = clientPhotoUrl(getAppBaseUrl(), token);
      const body = photoRequestSms(client.salonName ?? "Your groomer", url);
      const result = await sendSms(client.phone, body, { tenantId });

      // Logged whether or not Twilio took it, so the conversation shows
      // that the salon tried and a failure is visible rather than silent.
      await db.insert(smsLogs).values({
        tenantId, clientId: client.id, toNumber: client.phone, body,
        twilioSid: result.sid, status: result.success ? "sent" : "failed",
        type: "custom", direction: "outbound", errorMessage: result.error,
      });

      return {
        requestId,
        /** Returned so staff can read the link out if the text does not arrive. */
        url,
        expiresAt,
        smsSent: result.success,
        smsError: result.error ?? null,
      };
    }),

  /** Turn a link off early — a wrong number, or a client who asked us to. */
  revoke: operationalProcedure
    .input(z.object({ tenantId: z.number().default(1), requestId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      await assertTenant(db, ctx, tenantId);

      await db.update(clientPhotoRequests)
        .set({ revokedAt: new Date(), revokedByUserId: ctx.user.id })
        .where(and(
          eq(clientPhotoRequests.id, input.requestId),
          eq(clientPhotoRequests.tenantId, tenantId),
        ));
      return { success: true };
    }),

  /** What this client has sent in, newest first. */
  listForClient: operationalProcedure
    .input(z.object({ tenantId: z.number().default(1), clientId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      await assertTenant(db, ctx, tenantId);

      const rows = await db.select({
        id: clientPhotos.id,
        petId: clientPhotos.petId,
        petName: pets.name,
        storageKey: clientPhotos.storageKey,
        contentType: clientPhotos.contentType,
        byteSize: clientPhotos.byteSize,
        createdAt: clientPhotos.createdAt,
      })
        .from(clientPhotos)
        .leftJoin(pets, eq(clientPhotos.petId, pets.id))
        .where(and(
          eq(clientPhotos.tenantId, tenantId),
          eq(clientPhotos.clientId, input.clientId),
        ))
        .orderBy(desc(clientPhotos.createdAt));

      return rows.map((row: any) => ({
        ...row,
        url: `/api/client-photo?key=${encodeURIComponent(row.storageKey)}`,
      }));
    }),

  /** Any links for this client that still work, so staff do not send two. */
  listOpenRequests: operationalProcedure
    .input(z.object({ tenantId: z.number().default(1), clientId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const tenantId = tenantOf(ctx, input);
      await assertTenant(db, ctx, tenantId);

      const rows = await db.select({
        id: clientPhotoRequests.id,
        reason: clientPhotoRequests.reason,
        expiresAt: clientPhotoRequests.expiresAt,
        revokedAt: clientPhotoRequests.revokedAt,
        uploadCount: clientPhotoRequests.uploadCount,
        createdAt: clientPhotoRequests.createdAt,
      })
        .from(clientPhotoRequests)
        .where(and(
          eq(clientPhotoRequests.tenantId, tenantId),
          eq(clientPhotoRequests.clientId, input.clientId),
        ))
        .orderBy(desc(clientPhotoRequests.createdAt));

      return rows
        .map((row: any) => ({ ...row, state: photoRequestState(row) }))
        .filter((row: any) => row.state.ok);
    }),

  /**
   * The client's own page, reached by the token in their text.
   *
   * Deliberately thin. A first name and the reason are enough for the
   * client to recognise the link as theirs; anything more would be handed
   * to anyone holding the token.
   */
  getByToken: publicProcedure
    .input(z.object({ token: z.string().regex(/^[0-9a-f]{32}$/) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const [row] = await db.select({
        id: clientPhotoRequests.id,
        reason: clientPhotoRequests.reason,
        expiresAt: clientPhotoRequests.expiresAt,
        revokedAt: clientPhotoRequests.revokedAt,
        uploadCount: clientPhotoRequests.uploadCount,
        clientFirstName: clients.firstName,
        petName: pets.name,
        salonName: tenants.name,
      })
        .from(clientPhotoRequests)
        .innerJoin(clients, eq(clientPhotoRequests.clientId, clients.id))
        .innerJoin(tenants, eq(clientPhotoRequests.tenantId, tenants.id))
        .leftJoin(pets, eq(clientPhotoRequests.petId, pets.id))
        .where(eq(clientPhotoRequests.tokenHash, hashClientPhotoToken(input.token)))
        .limit(1);

      // A token that does not exist and one that expired get the same
      // answer, so the page cannot be used to probe for live links.
      if (!row) {
        return { ok: false as const, message: "This photo link is not valid. Please ask the salon for a new one." };
      }
      const state = photoRequestState(row);
      if (!state.ok) return { ok: false as const, message: state.message };

      return {
        ok: true as const,
        firstName: row.clientFirstName,
        petName: row.petName,
        salonName: row.salonName,
        reason: row.reason,
        remaining: state.remaining,
      };
    }),
});
