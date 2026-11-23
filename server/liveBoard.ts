import { and, eq, gte, lte, sql } from "drizzle-orm";
import { appointments } from "../drizzle/schema";
import { workflowBoardDayBounds, workflowBoardVersion } from "../shared/workflowBoardVersion";
import { appointmentsByDate } from "./appointmentIndexHints";
import { createBoardWatch } from "./boardWatch";
import { getDb } from "./db";

/**
 * The day's fingerprint: how many bookings, and when the newest last changed.
 * Reads only the day's rows through idx_appt_tenant_date. Shared by
 * workflow.getBoardVersion (the polling fallback) and the server's own
 * per-salon watcher (server/boardWatch.ts).
 */
export async function loadBoardVersion(tenantId: number, date: string): Promise<string> {
  const db = await getDb();
  if (!db) return "0:0";
  const { start, end } = workflowBoardDayBounds(date);
  const [row] = await db
    .select({
      bookings: sql<number>`COUNT(*)`,
      lastChanged: sql<Date | string | null>`MAX(${appointments.updatedAt})`,
    })
    .from(appointments, appointmentsByDate)
    .where(and(
      eq(appointments.tenantId, tenantId),
      gte(appointments.scheduledStart, start),
      lte(appointments.scheduledStart, end),
    ));
  return workflowBoardVersion(row?.bookings ?? 0, row?.lastChanged ?? null);
}

/** The one board cache and watcher set for this server process. */
export const liveBoard = createBoardWatch({ loadVersion: loadBoardVersion });
