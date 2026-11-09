/**
 * Keeping `clients.status` true, every night.
 *
 * Andy, 09/11/2026, looking at a Clients list of 9,695 where most rows
 * read "0 bookings": "A lot of these clients have zero appts, yet the
 * client is still showing as active. The rule should be in place that
 * if zero appts in the last 12 months (or any upcoming), the client
 * goes into Inactive status."
 *
 * **"The rule should be in place"**, not "run a script once. A one-off
 * pass is correct for about a day: the next client who books goes on
 * being inactive, out of every mass text, with their dog on the board.
 * So this is a job, and it moves clients both ways — the rules are in
 * shared/clientActivity.ts, which explains why the two directions are
 * deliberately NOT mirror images.
 *
 * ## One implementation, two callers
 *
 * `scripts/mark-inactive-clients.ts` is how a person runs it and watches
 * what happens. `/api/scheduled/client-status` is how it keeps happening.
 * Both land here, so the nightly job cannot quietly drift from the thing
 * that was reviewed.
 *
 * ## The work is done in SQL
 *
 * One row per client, with the three facts each decision needs, rather
 * than pulling every appointment into memory. That matters on this box:
 * lapsedClients does the latter and ran the 512MB instance out of memory
 * three times on 05/11/2026. The correlated subqueries ride
 * idx_appt_tenant_client and idx_membership_client, so none of them is a
 * scan.
 *
 * ## The blast-radius ceiling stays
 *
 * `MAX_SHARE_OF_ACTIVE` refuses a run that would restatus more than half
 * the active book. After the first catch-up a nightly delta is a handful
 * of clients, so the ceiling should never be reached again — and if it
 * is, something is wrong and stopping is the right answer. It bounds the
 * damage whatever the cause, which the first version of this gate did
 * not: that one measured "how many clients have never had a completed
 * appointment", a figure that is legitimately high here.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { clients } from "../drizzle/schema";
import {
  INACTIVE_SKIP_LABEL, LIVE_MEMBERSHIP_STATUSES, NON_VISIT_STATES,
  REACTIVATE_SKIP_LABEL, decideInactive, decideReactivate, inactiveCutoffDay,
  type InactiveSkipReason, type ReactivateSkipReason,
} from "@shared/clientActivity";

export const SALON_ZONE = "Australia/Brisbane";

/** Refuse a run that would restatus more than this share of the book. */
export const MAX_SHARE_OF_ACTIVE = 0.5;

/** Written in chunks, so a failure part-way is partial rather than total. */
const WRITE_CHUNK = 200;

export type SweepRow = {
  id: number;
  tenantId: number;
  name: string;
  status: string;
  lastVisitDay: string | null;
  hasFutureBooking: boolean;
  hasLiveMembership: boolean;
};

export type SweepPlan = {
  cutoffDay: string;
  considered: number;
  activeCount: number;
  toDeactivate: SweepRow[];
  toReactivate: SweepRow[];
  deactivateSkips: Record<InactiveSkipReason, number>;
  reactivateSkips: Record<ReactivateSkipReason, number>;
  /** Set when the ceiling refuses the run. Nothing is written. */
  refusedReason: string | null;
};

/** Every client, with the three facts the two rules need. */
export async function readSweepRows(
  db: any,
  tenantId?: number,
): Promise<SweepRow[]> {
  const nonVisit = NON_VISIT_STATES.map((s) => `'${s}'`).join(",");
  const liveMember = LIVE_MEMBERSHIP_STATUSES.map((s) => `'${s}'`).join(",");
  /*
   * The states are interpolated as literals rather than bound, which is
   * safe ONLY because both lists are compile-time constants in shared/
   * — no value here comes from a request. A bound parameter cannot be
   * used inside a sql`` IN-list without rebuilding the fragment per
   * call, and the tenant filter below, which IS variable, is bound.
   */
  const rows = await db.execute(sql`
    SELECT c.id,
           c.tenant_id AS tenantId,
           TRIM(CONCAT(COALESCE(c.first_name,''), ' ', COALESCE(c.last_name,''))) AS name,
           c.status,
           (SELECT DATE_FORMAT(CONVERT_TZ(MAX(a.scheduled_start), '+00:00', '+10:00'), '%Y-%m-%d')
              FROM appointments a
             WHERE a.client_id = c.id AND a.tenant_id = c.tenant_id
               AND a.scheduled_start < UTC_TIMESTAMP()
               AND a.workflow_state NOT IN (${sql.raw(nonVisit)}))        AS lastVisitDay,
           EXISTS (SELECT 1 FROM appointments f
                    WHERE f.client_id = c.id AND f.tenant_id = c.tenant_id
                      AND f.scheduled_start >= UTC_TIMESTAMP()
                      AND f.workflow_state NOT IN (${sql.raw(nonVisit)})) AS hasFutureBooking,
           EXISTS (SELECT 1 FROM memberships m
                    WHERE m.client_id = c.id AND m.tenant_id = c.tenant_id
                      AND m.status IN (${sql.raw(liveMember)}))           AS hasLiveMembership
      FROM clients c
     ${tenantId === undefined ? sql`` : sql`WHERE c.tenant_id = ${tenantId}`}
  `);
  // mysql2 returns [rows, fields]; drizzle's execute passes that through.
  const list: any[] = Array.isArray(rows) ? (rows[0] ?? rows) : (rows as any).rows ?? [];
  return list.map((r: any) => ({
    id: Number(r.id),
    tenantId: Number(r.tenantId),
    name: String(r.name || `client ${r.id}`),
    status: String(r.status),
    lastVisitDay: r.lastVisitDay ?? null,
    // EXISTS comes back as 1/0.
    hasFutureBooking: Boolean(Number(r.hasFutureBooking)),
    hasLiveMembership: Boolean(Number(r.hasLiveMembership)),
  }));
}

/** What the sweep would do. Pure, given the rows — so it is testable. */
export function planSweep(rows: readonly SweepRow[], now: Date): SweepPlan {
  const cutoffDay = inactiveCutoffDay(now, SALON_ZONE);
  if (!cutoffDay) throw new Error("could not work out the cutoff day");

  const toDeactivate: SweepRow[] = [];
  const toReactivate: SweepRow[] = [];
  const deactivateSkips: Record<InactiveSkipReason, number> = {
    not_active_status: 0, has_future_booking: 0, has_live_membership: 0,
    never_visited: 0, visited_inside_window: 0,
  };
  const reactivateSkips: Record<ReactivateSkipReason, number> = {
    not_inactive: 0, nothing_booked: 0,
  };

  for (const row of rows) {
    const down = decideInactive({
      status: row.status,
      lastVisitDay: row.lastVisitDay,
      hasFutureBooking: row.hasFutureBooking,
      hasLiveMembership: row.hasLiveMembership,
      cutoffDay,
    });
    if (down.markInactive) { toDeactivate.push(row); continue; }
    deactivateSkips[down.reason] += 1;

    const up = decideReactivate({
      status: row.status,
      hasFutureBooking: row.hasFutureBooking,
    });
    if (up.markActive) toReactivate.push(row);
    else reactivateSkips[up.reason] += 1;
  }

  const activeCount = rows.filter((r) => r.status === "active").length;
  const share = activeCount ? toDeactivate.length / activeCount : 0;
  const refusedReason = share > MAX_SHARE_OF_ACTIVE
    ? `${(share * 100).toFixed(1)}% of the active book is above the`
      + ` ${(MAX_SHARE_OF_ACTIVE * 100).toFixed(0)}% ceiling`
    : null;

  return {
    cutoffDay, considered: rows.length, activeCount,
    toDeactivate, toReactivate, deactivateSkips, reactivateSkips, refusedReason,
  };
}

/** Apply a plan. Returns how many rows each half actually moved. */
export async function applySweep(
  db: any,
  plan: SweepPlan,
): Promise<{ deactivated: number; reactivated: number }> {
  if (plan.refusedReason) throw new Error(`refusing to apply: ${plan.refusedReason}`);

  let deactivated = 0;
  for (let i = 0; i < plan.toDeactivate.length; i += WRITE_CHUNK) {
    const batch = plan.toDeactivate.slice(i, i + WRITE_CHUNK);
    /* `status = 'active'` restated at the write: a client somebody
       blocked between the read and the write must not be quietly
       demoted to inactive, which would lift the block. */
    const res: any = await db.update(clients)
      .set({ status: "inactive" })
      .where(and(
        inArray(clients.id, batch.map((r) => r.id)),
        eq(clients.status, "active"),
      ));
    deactivated += Number(res?.rowsAffected ?? res?.[0]?.affectedRows ?? batch.length);
  }

  let reactivated = 0;
  for (let i = 0; i < plan.toReactivate.length; i += WRITE_CHUNK) {
    const batch = plan.toReactivate.slice(i, i + WRITE_CHUNK);
    /* And `status = 'inactive'` here, for the same reason in the other
       direction: nothing automatic may lift a block. */
    const res: any = await db.update(clients)
      .set({ status: "active" })
      .where(and(
        inArray(clients.id, batch.map((r) => r.id)),
        eq(clients.status, "inactive"),
      ));
    reactivated += Number(res?.rowsAffected ?? res?.[0]?.affectedRows ?? batch.length);
  }

  return { deactivated, reactivated };
}

/** One line per reason, for a log or a console. */
export function describeSweep(plan: SweepPlan): string[] {
  const out = [
    `cutoff ${plan.cutoffDay} — ${plan.considered} clients, ${plan.activeCount} active`,
    `to mark inactive: ${plan.toDeactivate.length}`,
    `to bring back:    ${plan.toReactivate.length}`,
  ];
  for (const [reason, n] of Object.entries(plan.deactivateSkips)) {
    if (n > 0) out.push(`  ${String(n).padStart(6)}  ${INACTIVE_SKIP_LABEL[reason as InactiveSkipReason]}`);
  }
  for (const [reason, n] of Object.entries(plan.reactivateSkips)) {
    if (n > 0 && reason !== "not_inactive") {
      out.push(`  ${String(n).padStart(6)}  ${REACTIVATE_SKIP_LABEL[reason as ReactivateSkipReason]}`);
    }
  }
  if (plan.refusedReason) out.push(`REFUSED: ${plan.refusedReason}`);
  return out;
}

/**
 * The nightly pass.
 *
 * Guarded by CRON_SECRET like the other three scheduled endpoints.
 * Daily is right: a client only crosses the twelve-month line once, and
 * a missed run catches up the next night with no gap, because the rule
 * reads the book rather than a cursor.
 */
export async function clientStatusSweepHandler(req: any, res: any) {
  try {
    const authHeader = req.headers.authorization;
    const hasValidCronSecret =
      !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`;
    if (!hasValidCronSecret) return res.status(403).json({ error: "cron-only" });

    const { getDb } = await import("./db");
    const db = await getDb();
    if (!db) return res.json({ ok: true, skipped: "no-db" });

    const rows = await readSweepRows(db);
    const plan = planSweep(rows, new Date());
    for (const line of describeSweep(plan)) console.log(`[client-status] ${line}`);

    if (plan.refusedReason) {
      /*
       * Loud, and a 200. A cron that 500s gets retried, and retrying a
       * refusal just produces the same refusal at the same volume. The
       * run is reported as skipped with the reason, which is what wants
       * reading in the Render log.
       */
      console.error(`[client-status] REFUSED — ${plan.refusedReason}.`
        + ` Nothing was written. Run scripts/mark-inactive-clients.ts and look.`);
      return res.json({ ok: true, skipped: "ceiling", reason: plan.refusedReason });
    }

    const applied = await applySweep(db, plan);
    console.log(`[client-status] marked ${applied.deactivated} inactive,`
      + ` brought ${applied.reactivated} back`);
    return res.json({ ok: true, cutoffDay: plan.cutoffDay, ...applied });
  } catch (err) {
    console.error("[client-status] Error:", err);
    return res.status(500).json({ error: String(err), timestamp: new Date().toISOString() });
  }
}
