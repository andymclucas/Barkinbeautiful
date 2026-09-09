/**
 * Heartbeat scheduled handler: payment-retry
 *
 * Fires daily at 9:00 AM AEST (23:00 UTC previous day) on weekdays.
 * Finds all memberships with a payment_retry_scheduled_at in the past
 * and marks them as retry-attempted (increments failed count if still unresolved,
 * or sends the 2-strike email if this is the second failure).
 */
import { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import { memberships, clients, pets, tenants, smsLogs } from "../drizzle/schema";
import { eq, lte, and, gt, sql } from "drizzle-orm";
import {
  sendEmail,
  buildAdminFailedPaymentEmail,
  buildClientFailedPaymentEmail,
} from "./email";
import { notifyOwner } from "./ownerNotification";
import { sendSms, buildAppointmentReminderSms } from "./sms";
import { appointments, staff } from "../drizzle/schema";
import { gte, isNotNull, lt } from "drizzle-orm";

function nextBusinessDay(from: Date): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  // Skip Saturday (6) and Sunday (0)
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

export async function paymentRetryHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) {
      return res.status(403).json({ error: "cron-only" });
    }

    const db = await getDb();
    if (!db) return res.json({ ok: true, skipped: "no-db" });

    const now = new Date();

    // Find all memberships due for retry (retry date is in the past, still has failures)
    const dueRetries = await db
      .select({
        id: memberships.id,
        tenantId: memberships.tenantId,
        failedCount: memberships.failedPaymentCount,
        pricePerCycle: memberships.pricePerCycle,
        membershipName: memberships.name,
        clientId: memberships.clientId,
        petId: memberships.petId,
      })
      .from(memberships)
      .where(
        and(
          lte(memberships.paymentRetryScheduledAt, now),
          gt(sql`${memberships.failedPaymentCount}`, 0)
        )
      );

    let processed = 0;

    for (const m of dueRetries) {
      // Get client and pet info
      const [clientRow] = await db
        .select({
          firstName: clients.firstName,
          lastName: clients.lastName,
          email: clients.email,
        })
        .from(clients)
        .where(eq(clients.id, m.clientId!))
        .limit(1);

      const [petRow] = m.petId
        ? await db
            .select({ name: pets.name })
            .from(pets)
            .where(eq(pets.id, m.petId))
            .limit(1)
        : [{ name: null }];

      const [tenantRow] = await db
        .select({
          name: tenants.name,
          phone: tenants.phone,
          email: tenants.email,
        })
        .from(tenants)
        .where(eq(tenants.id, m.tenantId ?? 1))
        .limit(1);

      const clientName = `${clientRow?.firstName ?? ""} ${clientRow?.lastName ?? ""}`.trim();
      const petName = petRow?.name ?? "your pet";
      const membershipName = m.membershipName ?? "Membership";
      const priceStr = m.pricePerCycle ? String(m.pricePerCycle) : "0.00";
      const newFailCount = (m.failedCount ?? 0) + 1;
      const retryDate = nextBusinessDay(now).toLocaleDateString("en-AU");

      if (newFailCount >= 2) {
        // Strike 2 — suspend and email client
        await db
          .update(memberships)
          .set({
            failedPaymentCount: newFailCount,
            lastFailedPaymentAt: now,
            bookingSuspended: true,
            paymentRetryScheduledAt: null,
            status: "paused",
          })
          .where(eq(memberships.id, m.id));

        // Email client
        if (clientRow?.email) {
          await sendEmail({
            to: clientRow.email,
            subject: `Important: Your ${membershipName} payment has failed`,
            html: buildClientFailedPaymentEmail({
              clientFirstName: clientRow.firstName ?? "Valued Client",
              petName,
              membershipName,
              pricePerCycle: priceStr,
              businessName: tenantRow?.name ?? "Barkin' Beautiful",
              businessPhone: tenantRow?.phone,
              businessEmail: tenantRow?.email,
            }),
          });
        }

        // Notify admin
        await notifyOwner({
          title: "⛔ Membership Suspended — Strike 2",
          content: `${clientName} (${petName}) — ${membershipName} suspended after 2 failed payments.`,
        });
      } else {
        // Strike 1 retry — increment count, schedule another retry
        const nextRetry = nextBusinessDay(now);
        await db
          .update(memberships)
          .set({
            failedPaymentCount: newFailCount,
            lastFailedPaymentAt: now,
            paymentRetryScheduledAt: nextRetry,
            status: "pending_payment",
          })
          .where(eq(memberships.id, m.id));

        // Notify admin
        await notifyOwner({
          title: "⚠️ Payment Retry Failed",
          content: `${clientName} (${petName}) — ${membershipName}. Next retry: ${retryDate}.`,
        });

        // Email admin
        const adminEmail = process.env.OWNER_EMAIL ?? tenantRow?.email;
        if (adminEmail) {
          await sendEmail({
            to: adminEmail,
            subject: `Payment retry failed — ${clientName} (${membershipName})`,
            html: buildAdminFailedPaymentEmail({
              clientName,
              petName,
              membershipName,
              pricePerCycle: priceStr,
              failedPaymentCount: newFailCount,
              retryDate,
            }),
          });
        }
      }

      processed++;
    }

    return res.json({ ok: true, processed });
  } catch (err) {
    console.error("[paymentRetryHandler] Error:", err);
    return res.status(500).json({
      error: String(err),
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Heartbeat scheduled handler: appointment-reminders
 *
 * Fires daily at 8:00 AM AEST (22:00 UTC previous day).
 * Finds all appointments scheduled for tomorrow (AEST) and sends an SMS reminder
 * to each client who has a phone number on file.
 */
export async function appointmentReminderHandler(req: Request, res: Response) {
  try {
    // Support two ways of authenticating a cron-triggered call: Manus's own
    // scheduled-task auth (if it's ever restored), or a simple shared secret
    // for an external trigger like a Render Cron Job — set CRON_SECRET in
    // the environment and have the cron job call this endpoint with
    // Authorization: Bearer <CRON_SECRET>.
    const authHeader = req.headers.authorization;
    const hasValidCronSecret =
      !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
    if (!hasValidCronSecret) {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron) {
        return res.status(403).json({ error: "cron-only" });
      }
    }

    const db = await getDb();
    if (!db) return res.json({ ok: true, skipped: "no-db" });
    if (process.env.SMS_AUTOMATION_ENABLED !== "true") {
      return res.json({ ok: true, skipped: "automation-disabled" });
    }

    // Brisbane is UTC+10 with no DST, so "midnight AEST" is always 14:00 UTC
    // the previous day.
    // Figure out which AEST calendar day "now" actually falls on, so day
    // offsets are computed from the correct starting point (not always
    // assuming "now" is before this UTC instant's midnight boundary).
    const nowAestDayStart = (() => {
      const now = new Date();
      const brisbaneNow = new Date(now.getTime() + 10 * 60 * 60 * 1000);
      const d = new Date(Date.UTC(brisbaneNow.getUTCFullYear(), brisbaneNow.getUTCMonth(), brisbaneNow.getUTCDate()));
      d.setUTCHours(d.getUTCHours() - 10); // back to the UTC instant of that AEST midnight
      return d;
    })();
    const windowFor = (daysFromToday: number) => {
      const start = new Date(nowAestDayStart);
      start.setUTCDate(start.getUTCDate() + daysFromToday);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      return { start, end };
    };

    const stages: { key: "4d" | "2d" | "morning"; daysOut: number; column: "reminder4dSentAt" | "reminder2dSentAt" | "reminderMorningSentAt"; sqlColumn: string }[] = [
      { key: "4d", daysOut: 4, column: "reminder4dSentAt", sqlColumn: "reminder_4d_sent_at" },
      { key: "2d", daysOut: 2, column: "reminder2dSentAt", sqlColumn: "reminder_2d_sent_at" },
      { key: "morning", daysOut: 0, column: "reminderMorningSentAt", sqlColumn: "reminder_morning_sent_at" },
    ];

    let sent = 0;
    let skipped = 0;
    const breakdown: Record<string, number> = {};

    for (const stage of stages) {
      const { start, end } = windowFor(stage.daysOut);

      const rows = await db
        .select({
          apptId: appointments.id,
          clientId: appointments.clientId,
          scheduledStart: appointments.scheduledStart,
          clientFirstName: clients.firstName,
          clientPhone: clients.phone,
          petName: pets.name,
          staffName: staff.name,
        })
        .from(appointments)
        .leftJoin(clients, eq(appointments.clientId, clients.id))
        .leftJoin(pets, eq(appointments.petId, pets.id))
        .leftJoin(staff, eq(appointments.staffId, staff.id))
        .where(
          and(
            gte(appointments.scheduledStart, start),
            lt(appointments.scheduledStart, end),
            isNotNull(clients.phone),
            eq(appointments.status, "confirmed"),
            sql`appointments.${sql.raw(stage.sqlColumn)} IS NULL`
          )
        );

      let stageSent = 0;
      for (const row of rows) {
        if (!row.clientPhone || !row.scheduledStart) { skipped++; continue; }

        const apptDate = row.scheduledStart.toLocaleDateString("en-AU", {
          weekday: "long", day: "numeric", month: "long", timeZone: "Australia/Brisbane",
        });
        const apptTime = row.scheduledStart.toLocaleTimeString("en-AU", {
          hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Australia/Brisbane",
        });

        const body = buildAppointmentReminderSms({
          clientFirstName: row.clientFirstName ?? "there",
          petName: row.petName ?? "your dog",
          date: apptDate,
          time: apptTime,
          groomer: row.staffName ?? "our team",
          stage: stage.key,
        });

        const result = await sendSms(row.clientPhone, body);

        if (result.success) {
          await db
            .update(appointments)
            .set({ [stage.column]: new Date() } as any)
            .where(eq(appointments.id, row.apptId));
          await db.insert(smsLogs).values({
            tenantId: 1,
            clientId: row.clientId,
            appointmentId: row.apptId,
            toNumber: row.clientPhone,
            body,
            twilioSid: result.sid,
            status: "sent",
            type: "reminder",
            direction: "outbound",
          });
          sent++;
          stageSent++;
        } else {
          skipped++;
        }
      }
      breakdown[stage.key] = stageSent;
    }

    return res.json({ ok: true, sent, skipped, breakdown });
  } catch (err) {
    console.error("[appointmentReminderHandler] Error:", err);
    return res.status(500).json({ error: String(err), timestamp: new Date().toISOString() });
  }
}
