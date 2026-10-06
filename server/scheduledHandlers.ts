/**
 * Heartbeat scheduled handler: payment-retry
 *
 * Fires daily at 9:00 AM AEST (23:00 UTC previous day) on weekdays. Finds
 * every membership whose retry is due and ACTUALLY ATTEMPTS THE PAYMENT.
 *
 * It did not, until 30/09/2026. It read the memberships due for retry and
 * escalated each one straight to another strike - so a client whose card was
 * short on the Tuesday was marked failed again on the Wednesday and
 * suspended on the Thursday, with Stripe never asked a second time. "Retry
 * on the next business day" had been built as a diary entry with no payment
 * behind it.
 *
 * Now: charge the saved card (or pay the open Stripe subscription invoice),
 * and only escalate on a genuine decline. A missing Stripe key or a client
 * with no card on file is NOT a decline and must never cost a strike.
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
// Brisbane-correct, and tested in both timezones. The local version used
// getDay(), which on Render (UTC) read the wrong weekday for anything after
// 10:00 Brisbane and pushed retries a day late.
import { nextBrisbaneBusinessDay } from "../shared/businessDays";
import {
  classifyFailure,
  planAfterFailure,
  canChargeOffSession,
  isCardExpired,
  describeCard,
  describeStripeKey,
} from "../shared/stripeBilling";
import { chargeSavedCard, payOpenInvoice } from "./stripeCards";
import { membershipPayments, membershipLedgerEntries } from "../drizzle/schema";
import { desc } from "drizzle-orm";
import { sendSms, buildAppointmentReminderSms } from "./sms";
import { appointments, staff } from "../drizzle/schema";
import { gte, isNotNull, lt } from "drizzle-orm";




interface ChargeAttempt {
  ok: boolean;
  /** Nothing was tried, so nothing failed - do not count a strike. */
  skipped: boolean;
  reason: string | null;
  declineCode: string | null;
  /** True when Stripe settled a subscription invoice; the webhook books it. */
  viaInvoice: boolean;
}

/**
 * Try to take this week's money.
 *
 * Paying the open Stripe invoice is preferred over raising a fresh charge:
 * the subscription then sees its own invoice settled rather than an unrelated
 * payment sitting beside a still-unpaid one. That path deliberately does NOT
 * write a payment row here - Stripe emits `invoice.paid`, and the webhook
 * records it. Writing it in both places would double every retried payment.
 */
async function attemptMembershipCharge(
  db: any,
  membership: { id: number; clientId: number | null; pricePerCycle: string | null; name: string | null; tenantId: number | null },
  now: Date,
): Promise<ChargeAttempt> {
  if (!membership.clientId) {
    return { ok: false, skipped: true, reason: "Membership has no client attached", declineCode: null, viaInvoice: false };
  }

  const [client] = await db
    .select({
      stripeCustomerId: clients.stripeCustomerId,
      stripeDefaultPaymentMethodId: clients.stripeDefaultPaymentMethodId,
      stripeCardBrand: clients.stripeCardBrand,
      stripeCardLast4: clients.stripeCardLast4,
      stripeCardExpMonth: clients.stripeCardExpMonth,
      stripeCardExpYear: clients.stripeCardExpYear,
    })
    .from(clients)
    .where(eq(clients.id, membership.clientId))
    .limit(1);

  if (!client || !canChargeOffSession(client)) {
    return { ok: false, skipped: true, reason: "No card on file for this client", declineCode: null, viaInvoice: false };
  }
  if (isCardExpired(client, now)) {
    // A real failure, but not one worth an attempt: Stripe would decline it
    // and the client needs to be asked for a new card either way.
    return { ok: false, skipped: false, reason: `${describeCard(client) ?? "The card"} has expired`, declineCode: "expired_card", viaInvoice: false };
  }

  const [lastFailure] = await db
    .select({ stripeInvoiceId: membershipPayments.stripeInvoiceId })
    .from(membershipPayments)
    .where(and(eq(membershipPayments.membershipId, membership.id), eq(membershipPayments.status, "failed")))
    .orderBy(desc(membershipPayments.id))
    .limit(1);

  if (lastFailure?.stripeInvoiceId) {
    const result = await payOpenInvoice(lastFailure.stripeInvoiceId);
    return { ok: result.ok, skipped: false, reason: result.message, declineCode: result.declineCode, viaInvoice: true };
  }

  const result = await chargeSavedCard({
    customerId: client.stripeCustomerId!,
    paymentMethodId: client.stripeDefaultPaymentMethodId!,
    amountDollars: membership.pricePerCycle ?? "0",
    description: `${membership.name ?? "Membership"} - retry`,
    metadata: {
      groomigo_membership_id: String(membership.id),
      membership_id: String(membership.id),
      groomigo_client_id: String(membership.clientId),
      tenant_id: String(membership.tenantId ?? 1),
      payment_kind: "membership_retry",
    },
  });
  return { ok: result.ok, skipped: false, reason: result.message, declineCode: result.declineCode, viaInvoice: false };
}

export async function paymentRetryHandler(req: Request, res: Response) {
  try {
    // Authorised either by the CRON_SECRET bearer token (how an external
    // scheduler such as a Render Cron Job calls this) or, historically, by a
    // Manus cron session.
    //
    // The Manus path cannot succeed on this deployment: verifying a cron
    // session calls getUserInfoWithJwt, which POSTs to the Manus OAuth server,
    // and OAUTH_SERVER_URL is not configured here. Before this check existed,
    // that meant payment retries could never run at all — failed membership
    // payments were never retried. appointmentReminderHandler below already had
    // the CRON_SECRET path; this brings the two into line.
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
        name: memberships.name,
      })
      .from(memberships)
      .where(
        and(
          lte(memberships.paymentRetryScheduledAt, now),
          gt(sql`${memberships.failedPaymentCount}`, 0)
        )
      );

    // A deployment with no Stripe key cannot charge anything. Stop before the
    // loop rather than per membership: every one of them would "fail", and a
    // configuration problem must not cost a single client a strike or send
    // the owner one email per membership.
    const stripeKey = describeStripeKey(process.env.STRIPE_SECRET_KEY);
    if (!stripeKey.configured && dueRetries.length > 0) {
      await notifyOwner({
        title: "⚠️ Membership payment retries did not run",
        content: `${dueRetries.length} membership payment(s) were due for retry, but Stripe is not configured on this deployment. Nothing was charged and no client was suspended. The retries stay scheduled and will run once STRIPE_SECRET_KEY is set.`,
      }).catch(() => undefined);
      return res.json({ ok: true, processed: 0, skipped: "stripe-not-configured", due: dueRetries.length });
    }

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
      // ── Attempt the payment ────────────────────────────────────────────
      const attempt = await attemptMembershipCharge(db, m as any, now);

      if (attempt.skipped) {
        // Nothing was charged and nothing declined. Clear the due date so the
        // job does not re-run this every morning, and tell the owner what is
        // actually blocking it - a strike here would suspend a client over a
        // configuration problem.
        await db
          .update(memberships)
          .set({ paymentRetryScheduledAt: null })
          .where(eq(memberships.id, m.id));
        await notifyOwner({
          title: "⚠️ Membership payment could not be attempted",
          content: `${clientName} (${petName}) — ${membershipName}. ${attempt.reason ?? "Unknown reason"}.`,
        }).catch(() => undefined);
        processed++;
        continue;
      }

      if (attempt.ok) {
        // Clear the failure state either way; the payment row itself is
        // written by the invoice.paid webhook when Stripe settled an invoice,
        // and here when we raised the charge ourselves.
        await db
          .update(memberships)
          .set({
            failedPaymentCount: 0,
            lastFailedPaymentAt: null,
            paymentRetryScheduledAt: null,
            bookingSuspended: false,
            status: "active",
          })
          .where(eq(memberships.id, m.id));

        if (!attempt.viaInvoice) {
          await db.insert(membershipPayments).values({
            membershipId: m.id,
            amount: priceStr,
            status: "paid",
            paidAt: now,
          });
          await db.insert(membershipLedgerEntries).values({
            tenantId: m.tenantId ?? 1,
            membershipId: m.id,
            entryType: "payment",
            amount: priceStr,
            source: "stripe",
            note: "Retry payment on saved card",
          });
        }

        await notifyOwner({
          title: "✅ Membership payment recovered",
          content: `${clientName} (${petName}) — ${membershipName} paid $${priceStr} on retry.`,
        }).catch(() => undefined);
        processed++;
        continue;
      }

      // ── It genuinely declined ──────────────────────────────────────────
      const action = classifyFailure(attempt.declineCode);
      const newFailCount = (m.failedCount ?? 0) + 1;
      const plan = planAfterFailure(newFailCount, action, now);
      const retryDate = plan.retryAt
        ? plan.retryAt.toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane" })
        : "no further automatic attempt";

      await db.insert(membershipPayments).values({
        membershipId: m.id,
        amount: priceStr,
        status: "failed",
        failureReason: attempt.reason ?? plan.reason,
      });

      if (plan.suspend) {
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
          title: "⛔ Membership suspended",
          content: `${clientName} (${petName}) — ${membershipName}. ${plan.reason}`,
        });
      } else {
        // Declined, but worth another go: schedule it for the next business
        // day in Brisbane.
        await db
          .update(memberships)
          .set({
            failedPaymentCount: newFailCount,
            lastFailedPaymentAt: now,
            paymentRetryScheduledAt: plan.retryAt,
            status: "pending_payment",
          })
          .where(eq(memberships.id, m.id));

        // Notify admin
        await notifyOwner({
          title: "⚠️ Payment retry failed",
          content: `${clientName} (${petName}) — ${membershipName}. ${attempt.reason ?? plan.reason} Next retry: ${retryDate}.`,
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
          // Selected so the reminder counts against the right salon's
          // allowance. This job runs for every tenant on the system.
          tenantId: appointments.tenantId,
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

        const result = await sendSms(row.clientPhone, body, { tenantId: row.tenantId });

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
