/**
 * Texting a client that their dog is booked in.
 *
 * Andy, 26/10/2026: "Setup a full workflow for automated SMS to clients
 * once an appointment is booked in Groomigo."
 *
 * There is no undo on a sent SMS, so this fails towards silence at every
 * step. A client who misses a confirmation rings the salon; a client who
 * gets three does not ring, they tell people.
 *
 * **The unit is the BOOKING, not the appointment row.** A two-dog family
 * is two rows and one trip, so it gets one text naming both dogs — the
 * same rule Lauren set for the pickup message on 13/10/2026. Claiming and
 * sending per row would have texted that family twice, each message
 * naming one dog.
 *
 * Who can receive one: a client with a phone, who has not replied STOP,
 * on a CONFIRMED future booking a staff member just made, during salon
 * hours. Never an online booking (those have their own "we'll confirm"
 * message) and never anything carrying a MoeGo id. All of those rules
 * live in shared/bookingConfirmationSms.ts so they are testable without
 * a database or a Twilio key.
 */
import { automatedSmsPermitted } from "@shared/automatedSms";
import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { appointments, clients, pets, staff, tenants, smsLogs } from "../drizzle/schema";
import { sendSms } from "./sms";
import { safeTimeZone } from "../shared/auditTimestamp";
import {
  buildBookingConfirmationSms, decideBookingConfirmation,
  CONFIRMATION_SKIP_LABEL,
  confirmationAsksToConfirm,
} from "../shared/bookingConfirmationSms";

export type ConfirmationOutcome =
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
 * Confirm one booking — every appointment id that was created together.
 *
 * Never throws. The rows are already committed and the staff member has
 * already seen the booking succeed, so a Twilio outage must not surface
 * as a failed booking. Same shape as onlineBookingNotify.
 */
export async function sendBookingConfirmation(
  db: any,
  appointmentIds: readonly number[],
  /**
   * Staff said the client already has this booking elsewhere.
   *
   * Back-filling a MoeGo booking by hand leaves no id for the import
   * guard to catch, so nothing in the data can tell this apart from a
   * new booking. Only the person typing it knows.
   */
  options: { alreadyArranged?: boolean } = {},
): Promise<ConfirmationOutcome> {
  try {
    const ids = Array.from(new Set(appointmentIds.filter((id) => Number.isInteger(id) && id > 0)));
    if (ids.length === 0) return { sent: false, reason: "no appointments to confirm" };

    const rows = await db
      .select({
        id: appointments.id,
        tenantId: appointments.tenantId,
        clientId: appointments.clientId,
        scheduledStart: appointments.scheduledStart,
        status: appointments.status,
        workflowState: appointments.workflowState,
        bookedOnline: appointments.bookedOnline,
        moegoAppointmentId: appointments.moegoAppointmentId,
        confirmationSmsSentAt: appointments.confirmationSmsSentAt,
        clientFirstName: clients.firstName,
        clientPhone: clients.phone,
        smsOptedOutAt: clients.smsOptedOutAt,
        confirmationSmsOffAt: clients.confirmationSmsOffAt,
        petName: pets.name,
        groomer: staff.name,
        salonName: tenants.name,
        timezone: tenants.timezone,
      })
      .from(appointments)
      .leftJoin(clients, eq(clients.id, appointments.clientId))
      .leftJoin(pets, eq(pets.id, appointments.petId))
      .leftJoin(staff, eq(staff.id, appointments.staffId))
      .leftJoin(tenants, eq(tenants.id, appointments.tenantId))
      .where(inArray(appointments.id, ids));
    if (rows.length === 0) return { sent: false, reason: "appointment not found" };

    const first = rows[0];
    const { date, time, localHour } = formatWhen(new Date(first.scheduledStart), first.timezone);

    /**
     * ANY row failing vetoes the whole booking. A two-dog booking where
     * one dog is a MoeGo import is not half-confirmable, and a message
     * naming only the other dog would be worse than none.
     */
    for (const row of rows) {
      const decision = decideBookingConfirmation({
        automationEnabled: process.env.SMS_AUTOMATION_ENABLED === "true",
        policyAllows: automatedSmsPermitted("confirmation", process.env),
        confirmationSmsSentAt: row.confirmationSmsSentAt,
        clientPhone: row.clientPhone,
        smsOptedOutAt: row.smsOptedOutAt,
        confirmationSmsOffAt: row.confirmationSmsOffAt,
        moegoAppointmentId: row.moegoAppointmentId,
        bookedOnline: row.bookedOnline,
        scheduledStart: row.scheduledStart,
        status: row.status,
        workflowState: row.workflowState,
        localHour,
        alreadyArranged: options.alreadyArranged === true,
      });
      if (!decision.send) return { sent: false, reason: CONFIRMATION_SKIP_LABEL[decision.reason] };
    }

    // Built BEFORE the claim. An unusable tenant timezone used to throw
    // here after the claim was burnt, leaving the column saying "sent"
    // with nothing in sms_logs.
    const body = buildBookingConfirmationSms({
      clientFirstName: first.clientFirstName ?? "",
      petNames: rows.map((r: any) => r.petName).filter(Boolean),
      date, time,
      salonName: first.salonName,
      asksToConfirm: confirmationAsksToConfirm(first.scheduledStart),
    });

    /**
     * Claim EVERY row of the booking in one conditional update, and
     * require all of them. Two staff saving at once, or a retried
     * request, both reach here; only the one whose update takes the
     * whole set goes on to text. A partial claim means somebody else is
     * mid-send, so this one backs off.
     */
    const claim = await db
      .update(appointments)
      .set({ confirmationSmsSentAt: new Date() })
      .where(and(inArray(appointments.id, ids), isNull(appointments.confirmationSmsSentAt)));
    if (affected(claim) !== rows.length) {
      return { sent: false, reason: "another send already claimed this booking" };
    }

    const result = await sendSms(first.clientPhone as string, body, { tenantId: first.tenantId, trigger: "automated", type: "confirmation" });

    // Policy-blocked sends are not logged: nothing was attempted, and the
    // row would show as a message in the client's conversation. The claim
    // above is kept, so turning confirmations back on never back-fills a
    // text for a booking that has since happened.
    if (!result.blocked) {
      await db.insert(smsLogs).values({
        tenantId: first.tenantId,
        clientId: first.clientId,
        appointmentId: first.id,
        toNumber: first.clientPhone as string,
        body,
        twilioSid: result.sid ?? null,
        status: result.success ? "sent" : "failed",
        type: "confirmation",
        direction: "outbound",
        // So "why didn't Mrs Gerard get a text" has an answer beyond "failed".
        errorMessage: result.success ? null : (result.error ?? "unknown error"),
      });
    }

    /**
     * The claim is KEPT on failure, deliberately.
     *
     * sendSms flattens every failure to a string, so a timeout after
     * Twilio queued the message is indistinguishable from an invalid
     * number. Releasing would re-send the first case to a client who
     * already has it. At-most-once is the right default for SMS: the
     * sms_logs row records the attempt and its error, and a staff member
     * can send the manual template deliberately.
     */
    if (result.blocked) return { sent: false, reason: "automated confirmations are switched off" };
    if (!result.success) return { sent: false, reason: result.error ?? "the text could not be sent" };

    return { sent: true, to: first.clientPhone as string, pets: rows.length };
  } catch (error) {
    console.error("[BookingConfirmation] failed for", appointmentIds, error);
    return { sent: false, reason: "an error occurred while sending" };
  }
}


export type StaffBookingTextOutcome =
  | { sent: true; to: string; pets: number }
  | { sent: false; reason: string; alreadySentAt?: Date | null };

/**
 * A person pressing "Text booking details" on the appointment.
 *
 * Lauren, 11/11/2026: she rebooked a dog at 8:59 am, the automatic
 * confirmation was rightly held back until 9 (Andy's rule), and there
 * was then no way to send it at all — nothing retries a held-back text.
 *
 * This is a STAFF send, not an automated one: no quiet hours, no
 * allow-list, no per-client switches — those govern what the system
 * sends on its own, and the Preferences dialog says plainly that they do
 * not stop a person texting by hand. Same words as the automatic one, so
 * the client cannot tell which sent it, and it marks the booking as
 * confirmed-by-text so the automatic one never follows it.
 *
 * A second send of the same booking needs `again`, so a double tap is a
 * question rather than two texts.
 */
export async function sendBookingDetailsByStaff(
  db: any,
  input: { appointmentId: number; tenantId: number; again?: boolean },
): Promise<StaffBookingTextOutcome> {
  const [anchor] = await db
    .select({ id: appointments.id, clientId: appointments.clientId, scheduledStart: appointments.scheduledStart })
    .from(appointments)
    .where(and(eq(appointments.id, input.appointmentId), eq(appointments.tenantId, input.tenantId)))
    .limit(1);
  if (!anchor) return { sent: false, reason: "That appointment was not found." };

  // The booking: every live dog of this client at this same time — one
  // trip, one text, as the automatic confirmation does.
  const rows = await db
    .select({
      id: appointments.id,
      tenantId: appointments.tenantId,
      clientId: appointments.clientId,
      scheduledStart: appointments.scheduledStart,
      confirmationSmsSentAt: appointments.confirmationSmsSentAt,
      clientFirstName: clients.firstName,
      clientPhone: clients.phone,
      petName: pets.name,
      salonName: tenants.name,
      timezone: tenants.timezone,
    })
    .from(appointments)
    .leftJoin(clients, eq(clients.id, appointments.clientId))
    .leftJoin(pets, eq(pets.id, appointments.petId))
    .leftJoin(tenants, eq(tenants.id, appointments.tenantId))
    .where(and(
      eq(appointments.tenantId, input.tenantId),
      eq(appointments.clientId, anchor.clientId),
      eq(appointments.scheduledStart, anchor.scheduledStart),
      notInArray(appointments.workflowState, ["cancelled", "no_show"]),
      notInArray(appointments.status, ["cancelled", "no_show"]),
    ));
  if (rows.length === 0) return { sent: false, reason: "This booking is cancelled, so there is nothing to tell them." };

  const first = rows[0];
  if (new Date(first.scheduledStart).getTime() <= Date.now()) {
    return { sent: false, reason: "This appointment has already happened." };
  }
  const phone = String(first.clientPhone ?? "").trim();
  if (!phone) return { sent: false, reason: "There is no phone number on this client." };

  const previously = rows.map((r: any) => r.confirmationSmsSentAt).find(Boolean) ?? null;
  if (previously && !input.again) {
    return { sent: false, reason: "already_sent", alreadySentAt: new Date(previously) };
  }

  const { date, time } = formatWhen(new Date(first.scheduledStart), first.timezone);
  const body = buildBookingConfirmationSms({
    clientFirstName: first.clientFirstName ?? "",
    petNames: rows.map((r: any) => r.petName).filter(Boolean),
    date, time,
    salonName: first.salonName,
    asksToConfirm: confirmationAsksToConfirm(first.scheduledStart),
  });

  // Claim the rows that have not been texted, so the automatic one never
  // sends this booking again. Rows already texted keep their first time.
  await db.update(appointments)
    .set({ confirmationSmsSentAt: new Date() })
    .where(and(inArray(appointments.id, rows.map((r: any) => r.id)), isNull(appointments.confirmationSmsSentAt)));

  const result = await sendSms(phone, body, { tenantId: first.tenantId, trigger: "staff" });
  await db.insert(smsLogs).values({
    tenantId: first.tenantId,
    clientId: first.clientId,
    appointmentId: first.id,
    toNumber: phone,
    body,
    twilioSid: result.sid ?? null,
    status: result.success ? "sent" : "failed",
    type: "confirmation",
    direction: "outbound",
    errorMessage: result.success ? null : (result.error ?? "unknown error"),
  });
  if (!result.success) return { sent: false, reason: result.error ?? "The text could not be sent." };
  return { sent: true, to: phone, pets: rows.length };
}
