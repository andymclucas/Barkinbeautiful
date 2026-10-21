/**
 * Everything that happens AFTER an online booking row is written.
 *
 * Four things, in Andy's words on 21/10/2026: notify staff in the bell,
 * email the client a confirmation, text the client a confirmation, and
 * price the booking automatically.
 *
 * **None of them may undo the booking.** The appointment is already in
 * the database by the time this runs, and a client who has filled in the
 * form and seen a success screen must not be told their booking failed
 * because Resend was down or a bell row hit a constraint. So every step
 * is caught individually, reports what it did, and carries on — the same
 * shape as the membership sign-up notification write.
 *
 * The price is the exception to "after": it is computed BEFORE the insert
 * so it can be stored on the appointment, and passed in here only to be
 * quoted back. Quoting a figure the row does not hold is how the salon
 * ends up honouring a number it never recorded.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { clients, pets, systemNotifications, tenants } from "../drizzle/schema";
import { sendEmail } from "./email";
import { sendSms } from "./sms";
import { onlineBookingServiceLabel } from "../shared/onlineBookingWeightEligibility";
import {
  buildOnlineBookingRequestSms,
  buildOnlineBookingRequestEmailSubject,
  buildOnlineBookingRequestEmailBody,
  formatEstimate,
} from "../shared/onlineBookingConfirmation";
import { describeBookedWeight } from "../shared/onlineBookingPrice";

/**
 * Brisbane, always. The salon's day is not the server's day, and
 * `e6a4662` is the commit that fixed exactly this class of bug.
 * Formatted the same way the appointment reminders do it, so a client
 * who gets both reads the same date in the same words.
 */
const SALON_TZ = "Australia/Brisbane";

function salonDate(when: Date): string {
  return when.toLocaleDateString("en-AU", {
    weekday: "long", day: "numeric", month: "long", timeZone: SALON_TZ,
  });
}

function salonTime(when: Date): string {
  return when.toLocaleTimeString("en-AU", {
    hour: "numeric", minute: "2-digit", hour12: true, timeZone: SALON_TZ,
  });
}

export type OnlineBookingNotifyInput = {
  tenantId: number;
  clientId: number;
  petId: number;
  appointmentId: number;
  serviceType: string;
  scheduledStart: Date;
  weightKg: number;
  /** The stored estimate, exactly as written to appointments.price. */
  estimatePrice: string | null;
  /** A preview booking an admin made to test the flow. */
  preview?: boolean;
};

export type OnlineBookingNotifyResult = {
  notified: boolean;
  emailed: boolean;
  texted: boolean;
  /** Why a channel did nothing, for the server log and the test. */
  skipped: string[];
};

/**
 * A plain-text body in an email that expects HTML.
 *
 * `sendEmail` takes `html`, and the copy is written as plain text on
 * purpose (see shared/onlineBookingConfirmation.ts). Escaping and
 * wrapping in <pre> keeps the line breaks and the aligned detail block
 * without pretending this is a designed template.
 */
function asHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<pre style="font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;white-space:pre-wrap">${escaped}</pre>`;
}

export async function notifyOnlineBooking(
  input: OnlineBookingNotifyInput,
): Promise<OnlineBookingNotifyResult> {
  const out: OnlineBookingNotifyResult = { notified: false, emailed: false, texted: false, skipped: [] };
  const db = await getDb();
  if (!db) {
    out.skipped.push("no database");
    return out;
  }

  // One read for everything the three channels need.
  let client: { firstName: string | null; lastName: string | null; email: string | null; phone: string | null } | undefined;
  let petName = "your dog";
  let salonName: string | undefined;
  let salonPhone: string | null = null;
  try {
    [client] = await db.select({
      firstName: clients.firstName, lastName: clients.lastName,
      email: clients.email, phone: clients.phone,
    }).from(clients).where(and(eq(clients.id, input.clientId), eq(clients.tenantId, input.tenantId))).limit(1);
    const [pet] = await db.select({ name: pets.name }).from(pets)
      .where(and(eq(pets.id, input.petId), eq(pets.tenantId, input.tenantId))).limit(1);
    if (pet?.name) petName = pet.name;
    const [tenant] = await db.select({ name: tenants.name, phone: tenants.phone })
      .from(tenants).where(eq(tenants.id, input.tenantId)).limit(1);
    salonName = tenant?.name ?? undefined;
    salonPhone = tenant?.phone ?? null;
  } catch (err) {
    console.error("[online-booking] could not read the booking's client, pet or salon", err);
    out.skipped.push("lookup failed");
    return out;
  }

  const serviceLabel = onlineBookingServiceLabel(input.serviceType);
  const estimate = formatEstimate(input.estimatePrice);

  // 1. The bell. Written first, because it is the one that matters even
  //    when every outbound channel is down: a booking nobody is told
  //    about is a dog arriving unannounced.
  try {
    await db.insert(systemNotifications).values({
      tenantId: input.tenantId,
      kind: "online_booking_received",
      clientId: input.clientId,
      detail: [
        `${serviceLabel}, ${describeBookedWeight(input.weightKg)}`,
        estimate ? `estimated ${estimate}` : "no price estimate available",
        input.preview ? "(test booking)" : null,
      ].filter(Boolean).join(", ") + ".",
    });
    out.notified = true;
  } catch (err) {
    console.error("[online-booking] could not record a system notification", err);
    out.skipped.push("bell write failed");
  }

  const copy = {
    clientFirstName: client?.firstName?.trim() || "there",
    petName,
    date: salonDate(input.scheduledStart),
    time: salonTime(input.scheduledStart),
    serviceLabel,
    estimatePrice: input.estimatePrice,
    salonName,
    salonPhone,
  };

  // 2. The email.
  if (!client?.email) {
    out.skipped.push("no email address");
  } else {
    try {
      out.emailed = await sendEmail({
        to: client.email,
        subject: buildOnlineBookingRequestEmailSubject(copy),
        html: asHtml(buildOnlineBookingRequestEmailBody(copy)),
      });
      if (!out.emailed) out.skipped.push("email not sent");
    } catch (err) {
      console.error("[online-booking] confirmation email failed", err);
      out.skipped.push("email failed");
    }
  }

  // 3. The text. Gated on SMS_AUTOMATION_ENABLED like every other
  //    automated send here, so a staging deploy does not text a real
  //    person who filled in a form on the real site.
  if (process.env.SMS_AUTOMATION_ENABLED !== "true") {
    out.skipped.push("SMS automation disabled");
  } else if (!client?.phone) {
    out.skipped.push("no phone number");
  } else {
    try {
      const sent = await sendSms(client.phone, buildOnlineBookingRequestSms(copy), { tenantId: input.tenantId });
      out.texted = sent.success;
      if (!sent.success) out.skipped.push(`sms: ${sent.error ?? "not sent"}`);
    } catch (err) {
      console.error("[online-booking] confirmation SMS failed", err);
      out.skipped.push("sms failed");
    }
  }

  return out;
}
