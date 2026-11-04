/**
 * Texting a client when their booking is cancelled or moved.
 *
 * Andy, 04/11/2026: "Send auto cancellation and reschedule texts also."
 *
 * Built on the booking confirmation's shape — same claim-before-send
 * discipline, same "fail towards silence", same BOOKING-not-row unit, so
 * a three-dog family gets one text naming three dogs rather than three
 * texts naming one each. The rules themselves live in
 * shared/appointmentChangeSms.ts, which explains where they diverge from
 * the confirmation and why.
 *
 * The booking is matched on (client, scheduled start), not on
 * session_id. session_id is NULL on MoeGo imports, which is nearly every
 * upcoming booking, so keying on it would leave the duplicates exactly
 * where they are commonest — the same reasoning as
 * shared/reminderGrouping.ts, and the same key.
 */
import { automatedSmsPermitted } from "@shared/automatedSms";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { appointments, clients, pets, staff, tenants, smsLogs } from "../drizzle/schema";
import { sendSms } from "./sms";
import { safeTimeZone } from "../shared/auditTimestamp";
import { brisbaneDateKey } from "../shared/localDateTime";
import {
  buildCancellationSms, buildRescheduleSms,
  decideCancellationSms, decideRescheduleSms,
  CHANGE_SKIP_LABEL, BURST_WINDOW_MINUTES,
} from "../shared/appointmentChangeSms";

export type ChangeOutcome =
  | { sent: true; to: string; pets: number }
  | { sent: false; reason: string };

/** The salon's clock, never the server's. */
function formatWhen(at: Date, timeZone: string) {
  const zone = safeTimeZone(timeZone);
  const date = new Intl.DateTimeFormat("en-AU", {
    timeZone: zone, weekday: "long", day: "numeric", month: "long",
  }).format(at);
  const time = new Intl.DateTimeFormat("en-AU", {
    timeZone: zone, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(at);
  const hour = Number(new Intl.DateTimeFormat("en-AU", {
    timeZone: zone, hour: "numeric", hour12: false, hourCycle: "h23",
  }).formatToParts(new Date()).find((p) => p.type === "hour")?.value ?? NaN);
  return { date, time, localHour: Number.isFinite(hour) ? hour : undefined };
}

const affected = (result: unknown): number =>
  Number((result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0);

/**
 * How many of this type already went out in the burst window.
 *
 * Counted from sms_logs, which is the record of what was actually
 * SENT — not from the claim columns, which a blocked or failed send
 * also sets. A full scan of a few hundred rows, and it runs once per
 * cancellation, so it needs no index.
 *
 * A failure here returns 0 rather than throwing: the breaker is a
 * safety net, and a net that takes the feature down when the database
 * hiccups is worse than the thing it guards against.
 */
async function recentSendCount(
  db: any, tenantId: number, type: "cancellation" | "reschedule",
): Promise<number> {
  try {
    const [row] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(smsLogs)
      .where(and(
        eq(smsLogs.tenantId, tenantId),
        eq(smsLogs.type, type),
        eq(smsLogs.direction, "outbound"),
        sql`${smsLogs.sentAt} >= DATE_SUB(NOW(), INTERVAL ${sql.raw(String(BURST_WINDOW_MINUTES))} MINUTE)`,
      ));
    return Number(row?.n ?? 0);
  } catch (err) {
    console.error("[changeSms] could not count recent sends:", err);
    return 0;
  }
}

const SELECTION = {
  id: appointments.id,
  tenantId: appointments.tenantId,
  clientId: appointments.clientId,
  scheduledStart: appointments.scheduledStart,
  status: appointments.status,
  workflowState: appointments.workflowState,
  cancellationSmsSentAt: appointments.cancellationSmsSentAt,
  rescheduleSmsSentFor: appointments.rescheduleSmsSentFor,
  clientFirstName: clients.firstName,
  clientPhone: clients.phone,
  smsOptedOutAt: clients.smsOptedOutAt,
  petName: pets.name,
  groomer: staff.name,
  salonName: tenants.name,
  timezone: tenants.timezone,
};

/** Every row of the booking this appointment belongs to. */
async function loadBooking(db: any, appointmentId: number) {
  const [anchor] = await db
    .select({
      id: appointments.id, tenantId: appointments.tenantId,
      clientId: appointments.clientId, scheduledStart: appointments.scheduledStart,
    })
    .from(appointments)
    .where(eq(appointments.id, appointmentId))
    .limit(1);
  if (!anchor) return { anchor: null, rows: [] as any[] };

  const rows = await db
    .select(SELECTION)
    .from(appointments)
    .leftJoin(clients, eq(clients.id, appointments.clientId))
    .leftJoin(pets, eq(pets.id, appointments.petId))
    .leftJoin(staff, eq(staff.id, appointments.staffId))
    .leftJoin(tenants, eq(tenants.id, appointments.tenantId))
    .where(and(
      eq(appointments.tenantId, anchor.tenantId),
      eq(appointments.clientId, anchor.clientId),
      eq(appointments.scheduledStart, anchor.scheduledStart),
    ));
  return { anchor, rows };
}

/**
 * Tell the client a booking is off.
 *
 * Covers the dogs of the booking that are ALSO cancelled and not yet
 * told — not the whole family. Cancelling one dog of three is one dog's
 * news, and the other two are still coming at the same time.
 */
export async function sendCancellationNotice(db: any, appointmentId: number): Promise<ChangeOutcome> {
  try {
    const { anchor, rows } = await loadBooking(db, appointmentId);
    if (!anchor || rows.length === 0) return { sent: false, reason: "appointment not found" };

    const first = rows.find((r: any) => r.id === appointmentId) ?? rows[0];
    const { date, time, localHour } = formatWhen(new Date(first.scheduledStart), first.timezone);

    const cancelled = rows.filter((r: any) =>
      r.status === "cancelled" || r.workflowState === "cancelled");
    const toTell = cancelled.filter((r: any) => !r.cancellationSmsSentAt);
    if (toTell.length === 0) return { sent: false, reason: CHANGE_SKIP_LABEL.already_sent };

    const decision = decideCancellationSms({
      automationEnabled: process.env.SMS_AUTOMATION_ENABLED === "true",
      policyAllows: automatedSmsPermitted("cancellation", process.env),
      cancellationSmsSentAt: null,
      clientPhone: first.clientPhone,
      smsOptedOutAt: first.smsOptedOutAt,
      scheduledStart: first.scheduledStart,
      status: first.status,
      workflowState: first.workflowState,
      localHour,
      recentSendCount: await recentSendCount(db, first.tenantId, "cancellation"),
    });
    if (!decision.send) {
      if (decision.reason === "burst_guard") {
        console.error(`[cancellationSms] BURST GUARD tripped on appointment ${appointmentId}. `
          + "Something is cancelling in bulk through application code. Nothing was sent.");
      }
      return { sent: false, reason: CHANGE_SKIP_LABEL[decision.reason] };
    }

    // Built before the claim: a bad tenant timezone used to throw after
    // the column said "sent", leaving nothing in sms_logs.
    const body = buildCancellationSms({
      clientFirstName: first.clientFirstName ?? "",
      petNames: toTell.map((r: any) => r.petName).filter(Boolean),
      date, time,
      salonName: first.salonName,
    });

    const ids = toTell.map((r: any) => r.id);
    const claim = await db
      .update(appointments)
      .set({ cancellationSmsSentAt: new Date() })
      .where(and(inArray(appointments.id, ids), isNull(appointments.cancellationSmsSentAt)));
    if (affected(claim) !== ids.length) {
      return { sent: false, reason: "another send already claimed this booking" };
    }

    const result = await sendSms(first.clientPhone as string, body,
      { tenantId: first.tenantId, trigger: "automated", type: "cancellation" });

    // A policy-blocked send is not a failure and must not appear in the
    // Messages thread — smsLogs IS that thread, and a row for a text
    // nobody attempted reads to staff as a phantom message.
    if (!result.blocked) {
      await db.insert(smsLogs).values({
        tenantId: first.tenantId, clientId: first.clientId, appointmentId: first.id,
        toNumber: first.clientPhone as string, body, twilioSid: result.sid ?? null,
        status: result.success ? "sent" : "failed",
        type: "cancellation", direction: "outbound",
        errorMessage: result.success ? null : (result.error ?? "send failed"),
      });
    }
    if (!result.success) return { sent: false, reason: result.error ?? "send failed" };
    return { sent: true, to: first.clientPhone as string, pets: toTell.length };
  } catch (err) {
    // Never let a messaging failure surface as a failed cancellation.
    // The dog is off the board either way, which is the part that matters.
    console.error("[cancellationSms] failed:", err);
    return { sent: false, reason: "error" };
  }
}

/**
 * Tell the client their booking has moved to another DAY.
 *
 * Claims every LIVE row of the booking, not just the one that moved.
 * The calendar reschedules a family one row at a time, so without that
 * a three-dog booking would send three identical texts.
 */
export async function sendRescheduleNotice(
  db: any, appointmentId: number, previousStart: Date | string,
): Promise<ChangeOutcome> {
  try {
    const { anchor, rows } = await loadBooking(db, appointmentId);
    if (!anchor || rows.length === 0) return { sent: false, reason: "appointment not found" };

    const first = rows.find((r: any) => r.id === appointmentId) ?? rows[0];
    const { date, time, localHour } = formatWhen(new Date(first.scheduledStart), first.timezone);

    const live = rows.filter((r: any) =>
      r.status !== "cancelled" && r.workflowState !== "cancelled" && r.workflowState !== "no_show");
    if (live.length === 0) return { sent: false, reason: CHANGE_SKIP_LABEL.not_cancelled };

    const decision = decideRescheduleSms({
      automationEnabled: process.env.SMS_AUTOMATION_ENABLED === "true",
      policyAllows: automatedSmsPermitted("reschedule", process.env),
      previousStart,
      rescheduleSmsSentFor: first.rescheduleSmsSentFor,
      clientPhone: first.clientPhone,
      smsOptedOutAt: first.smsOptedOutAt,
      scheduledStart: first.scheduledStart,
      status: first.status,
      workflowState: first.workflowState,
      localHour,
      recentSendCount: await recentSendCount(db, first.tenantId, "reschedule"),
    });
    if (!decision.send) {
      if (decision.reason === "burst_guard") {
        console.error(`[rescheduleSms] BURST GUARD tripped on appointment ${appointmentId}. `
          + "Something is moving bookings in bulk through application code. Nothing was sent.");
      }
      return { sent: false, reason: CHANGE_SKIP_LABEL[decision.reason] };
    }

    const body = buildRescheduleSms({
      clientFirstName: first.clientFirstName ?? "",
      petNames: live.map((r: any) => r.petName).filter(Boolean),
      date, time,
      groomer: first.groomer,
      salonName: first.salonName,
    });

    const dayKey = brisbaneDateKey(new Date(first.scheduledStart));
    const ids = live.map((r: any) => r.id);
    /*
     * Claimed on the DAY, so the siblings the calendar is about to
     * reschedule in the same breath find the booking already told and
     * stay silent. `ne` rather than isNull: a booking moved twice has a
     * stale day in the column, and that must not block the second text.
     */
    const claim = await db
      .update(appointments)
      .set({ rescheduleSmsSentFor: dayKey })
      .where(and(
        inArray(appointments.id, ids),
        or(isNull(appointments.rescheduleSmsSentFor), ne(appointments.rescheduleSmsSentFor, dayKey)),
      ));
    if (affected(claim) === 0) {
      return { sent: false, reason: "another send already claimed this booking" };
    }

    const result = await sendSms(first.clientPhone as string, body,
      { tenantId: first.tenantId, trigger: "automated", type: "reschedule" });

    if (!result.blocked) {
      await db.insert(smsLogs).values({
        tenantId: first.tenantId, clientId: first.clientId, appointmentId: first.id,
        toNumber: first.clientPhone as string, body, twilioSid: result.sid ?? null,
        status: result.success ? "sent" : "failed",
        type: "reschedule", direction: "outbound",
        errorMessage: result.success ? null : (result.error ?? "send failed"),
      });
    }
    if (!result.success) return { sent: false, reason: result.error ?? "send failed" };
    return { sent: true, to: first.clientPhone as string, pets: live.length };
  } catch (err) {
    console.error("[rescheduleSms] failed:", err);
    return { sent: false, reason: "error" };
  }
}

/**
 * A booking put back on is a booking that can be cancelled again, and
 * the client must hear about that one too.
 */
export async function clearCancellationClaim(db: any, appointmentId: number): Promise<void> {
  try {
    await db.update(appointments)
      .set({ cancellationSmsSentAt: null })
      .where(eq(appointments.id, appointmentId));
  } catch (err) {
    console.error("[cancellationSms] could not clear the claim:", err);
  }
}
