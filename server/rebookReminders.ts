import type { Request, Response } from "express";
import { and, desc, eq, gt, inArray, isNotNull, isNull, lte, notInArray } from "drizzle-orm";
import { getDb } from "./db";
import { appointments, clients, memberships, pets, smsLogs, tenants } from "../drizzle/schema";
import { sendSms } from "./sms";
import { getAppBaseUrl } from "./appUrl";
import { intervalWeeksForTier } from "../shared/membershipPackages";
import { gapsBetween, rebookInterval } from "../shared/rebook";
import { dayInZone } from "../shared/calendarDay";
import { automatedSmsAllowed } from "../shared/automatedSms";
import {
  decideRebookReminder, buildRebookReminderSms,
  REBOOK_REMINDER_MAX_PER_RUN, REBOOK_SKIP_LABEL,
  type RebookReminderSkipReason,
} from "../shared/rebookReminder";

/**
 * The daily job that nudges households to book their next groom.
 *
 * Andy, 07/11/2026: "Build this into the text message workflow."
 *
 * Everything about WHETHER to send lives in shared/rebookReminder.ts
 * with its own tests. This file is the part that needs a database: find
 * the households, work out each one's cadence, and send at most one
 * message to each.
 *
 * ## Why it starts from appointments and not from clients
 *
 * Asking 10,113 clients "when were you last in" one at a time is 10,113
 * queries. One scan of the last year of appointments answers it for
 * everybody at once, and a year is plenty: a household that has not been
 * in for twelve months is not someone to nudge, they are someone to ring,
 * which is what shared/lapsedClients.ts is for.
 *
 * ## A visit is a DAY
 *
 * shared/lapsedClients.ts learned this and it matters twice here. A
 * two-dog household books two appointments and makes one trip, so
 * counting appointments makes their gaps alternate between zero and six
 * weeks and the median collapses to nearly nothing — they would read as
 * due constantly. And they must get ONE text naming both dogs, not two.
 */

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/** Not a real booking for cadence or for "they already rebooked". */
const DEAD_STATES = ["cancelled", "no_show"] as const;

type Candidate = {
  clientId: number;
  firstName: string | null;
  phone: string | null;
  smsOptedOutAt: Date | null;
  rebookReminderFor: string | null;
  /** Most recent first, one entry per DAY they came in. */
  visitDays: Date[];
  petNames: string[];
  membershipTierWeeks: number | null;
};

/**
 * Everything the decision needs, for one salon, in four queries.
 *
 * Exported so it can be read on its own; the handler below is the only
 * caller.
 */
export async function gatherRebookCandidates(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  tenantId: number,
  now: Date,
  timeZone: string,
): Promise<Candidate[]> {
  // Anyone already in the diary is out, whatever their cadence says: the
  // message's own premise is that we do not have a booking for them.
  const futureRows = await db
    .select({ clientId: appointments.clientId })
    .from(appointments)
    .where(and(
      eq(appointments.tenantId, tenantId),
      gt(appointments.scheduledStart, now),
      notInArray(appointments.workflowState, [...DEAD_STATES]),
    ));
  const alreadyBooked = new Set<number>(futureRows.map((r: { clientId: number }) => r.clientId));

  const since = new Date(now.getTime() - YEAR_MS);
  const visits = await db
    .select({
      clientId: appointments.clientId,
      start: appointments.scheduledStart,
      petName: pets.name,
    })
    .from(appointments)
    .leftJoin(pets, eq(pets.id, appointments.petId))
    .where(and(
      eq(appointments.tenantId, tenantId),
      lte(appointments.scheduledStart, now),
      gt(appointments.scheduledStart, since),
      notInArray(appointments.workflowState, [...DEAD_STATES]),
    ))
    .orderBy(desc(appointments.scheduledStart));

  const byClient = new Map<number, { days: Map<string, Date>; pets: Set<string> }>();
  for (const row of visits as { clientId: number; start: Date; petName: string | null }[]) {
    if (alreadyBooked.has(row.clientId)) continue;
    const day = dayInZone(row.start, timeZone);
    if (!day) continue;
    const entry = byClient.get(row.clientId) ?? { days: new Map(), pets: new Set() };
    // Rows arrive newest first, so the first one for a day wins and the
    // insertion order stays most-recent-first.
    if (!entry.days.has(day)) entry.days.set(day, new Date(row.start));
    if (row.petName) entry.pets.add(row.petName);
    byClient.set(row.clientId, entry);
  }
  if (byClient.size === 0) return [];

  const clientIds = Array.from(byClient.keys());
  const clientRows = await db
    .select({
      id: clients.id,
      firstName: clients.firstName,
      phone: clients.phone,
      smsOptedOutAt: clients.smsOptedOutAt,
      rebookReminderFor: clients.rebookReminderFor,
    })
    .from(clients)
    .where(and(
      eq(clients.tenantId, tenantId),
      inArray(clients.id, clientIds),
      // Both re-checked per row by decideRebookReminder, because an
      // automated text to somebody who opted out is never excusable and
      // this filter sits among others that somebody may edit.
      isNotNull(clients.phone),
      isNull(clients.smsOptedOutAt),
    ));

  const membershipRows = await db
    .select({ clientId: memberships.clientId, tier: memberships.tier })
    .from(memberships)
    .where(and(
      eq(memberships.tenantId, tenantId),
      eq(memberships.status, "active"),
      inArray(memberships.clientId, clientIds),
    ));
  const tierByClient = new Map<number, string>();
  for (const row of membershipRows as { clientId: number; tier: string }[]) {
    if (!tierByClient.has(row.clientId)) tierByClient.set(row.clientId, row.tier);
  }

  return (clientRows as {
    id: number; firstName: string | null; phone: string | null;
    smsOptedOutAt: Date | null; rebookReminderFor: string | null;
  }[]).map((client) => {
    const entry = byClient.get(client.id)!;
    const tier = tierByClient.get(client.id);
    return {
      clientId: client.id,
      firstName: client.firstName,
      phone: client.phone,
      smsOptedOutAt: client.smsOptedOutAt,
      rebookReminderFor: client.rebookReminderFor,
      visitDays: Array.from(entry.days.values()),
      petNames: Array.from(entry.pets),
      membershipTierWeeks: tier ? intervalWeeksForTier(tier) : null,
    };
  });
}

export async function rebookReminderHandler(req: Request, res: Response) {
  try {
    // Same shared-secret shape as the other two scheduled endpoints.
    const authHeader = req.headers.authorization;
    const hasValidCronSecret =
      !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
    if (!hasValidCronSecret) return res.status(403).json({ error: "cron-only" });

    const db = await getDb();
    if (!db) return res.json({ ok: true, skipped: "no-db" });

    const automationEnabled = process.env.SMS_AUTOMATION_ENABLED === "true";
    const policyAllows = automatedSmsAllowed("rebook");
    // Answered before any query: there is no point reading the book to
    // decide nobody may be texted.
    if (!policyAllows) return res.json({ ok: true, skipped: "policy-off" });
    if (!automationEnabled) return res.json({ ok: true, skipped: "automation-disabled" });

    const salons = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        phone: tenants.phone,
        timezone: tenants.timezone,
        weeksBefore: tenants.rebookReminderWeeksBefore,
        onlineBookingEnabled: tenants.onlineBookingEnabled,
      })
      .from(tenants)
      .where(eq(tenants.rebookReminderEnabled, true));
    if (salons.length === 0) return res.json({ ok: true, skipped: "no-salon-enabled" });

    const now = new Date();
    let sent = 0;
    let held = 0;
    const skipped: Partial<Record<RebookReminderSkipReason, number>> = {};

    for (const salon of salons as {
      id: number; name: string; phone: string | null; timezone: string | null;
      weeksBefore: number; onlineBookingEnabled: boolean;
    }[]) {
      const timeZone = salon.timezone || "Australia/Brisbane";
      const localHour = Number(
        new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(now),
      );
      // A link to a page that refuses bookings is the dead-link failure
      // client-messaging-safety exists to prevent, so it is only included
      // when the salon's online booking is actually on.
      const bookingUrl = salon.onlineBookingEnabled ? `${getAppBaseUrl()}/book` : null;

      const candidates = await gatherRebookCandidates(db, salon.id, now, timeZone);

      for (const candidate of candidates) {
        const interval = rebookInterval({
          membershipTierWeeks: candidate.membershipTierWeeks,
          recentGapWeeks: gapsBetween(candidate.visitDays),
        });

        const decision = decideRebookReminder({
          policyAllows,
          automationEnabled,
          salonEnabled: true, // only enabled salons were selected
          smsOptedOutAt: candidate.smsOptedOutAt,
          clientPhone: candidate.phone,
          hasFutureBooking: false, // excluded in gatherRebookCandidates
          lastVisitOn: candidate.visitDays[0] ?? null,
          intervalWeeks: interval.weeks,
          alreadySentForDay: candidate.rebookReminderFor,
          weeksBefore: salon.weeksBefore,
          localHour,
          timeZone,
          now,
        });

        if (!decision.send) {
          skipped[decision.reason] = (skipped[decision.reason] ?? 0) + 1;
          if (decision.reason === "opted_out") {
            console.warn(`[rebook] skipped client ${candidate.clientId}: ${REBOOK_SKIP_LABEL.opted_out}`);
          }
          continue;
        }

        /*
         * The cap, and why it is counted rather than enforced by the
         * query. Held-back households are still inside the window
         * tomorrow, so this delays them rather than dropping them — and
         * the number comes back in the response, so a run that wanted to
         * send two hundred says so instead of doing it.
         */
        if (sent >= REBOOK_REMINDER_MAX_PER_RUN) { held++; continue; }

        const body = buildRebookReminderSms({
          salonName: salon.name,
          clientFirstName: candidate.firstName,
          petNames: candidate.petNames,
          weeksSinceLastVisit: decision.weeksSinceLastVisit,
          bookingUrl,
          salonPhone: salon.phone,
        });

        const phone = candidate.phone!;
        const result = await sendSms(phone, body, {
          tenantId: salon.id, trigger: "automated", type: "rebook",
        });

        if (!result.success) {
          // A blocked send is NOT a failure and must not spend the claim
          // or write a log row: smsLogs IS the Messages thread staff
          // read, and a row for a text nobody attempted shows as a
          // phantom message.
          skipped.policy_off = (skipped.policy_off ?? 0) + 1;
          continue;
        }

        await db
          .update(clients)
          .set({ rebookReminderSentAt: new Date(), rebookReminderFor: decision.expectedDay })
          .where(eq(clients.id, candidate.clientId));
        await db.insert(smsLogs).values({
          tenantId: salon.id,
          clientId: candidate.clientId,
          toNumber: phone,
          body,
          twilioSid: result.sid,
          status: "sent",
          type: "rebook",
          direction: "outbound",
        });
        sent++;
      }
    }

    return res.json({ ok: true, sent, held, skipped });
  } catch (err) {
    console.error("[rebookReminderHandler] Error:", err);
    return res.status(500).json({ error: String(err), timestamp: new Date().toISOString() });
  }
}
