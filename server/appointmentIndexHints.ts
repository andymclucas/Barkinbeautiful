/**
 * Pin a query on appointments to the (tenant_id, scheduled_start) index.
 *
 * TiDB's planner chose a full scan of the whole appointments table for the
 * Dashboard's month figures — every booking ever made, ~950 request units a
 * query — while the index answers the same question in ~5 (measured
 * 23/11/2026 with EXPLAIN ANALYZE). Its statistics go stale between
 * auto-analyze runs, and the cost of the mistake grows with every salon on
 * the platform, because a full scan reads every salon's bookings.
 *
 * Use it ONLY on queries whose filter is the salon plus a scheduled_start
 * range. A query that also narrows by pet, client or staff may be better
 * served by another index; leave those to the planner.
 *
 * appointmentIndexHints.test.ts fails if the index is renamed, because a USE
 * INDEX naming an index that does not exist is an error, not a no-op.
 */
export const APPOINTMENTS_TENANT_DATE_INDEX = "idx_appt_tenant_date";
export const appointmentsByDate = { useIndex: APPOINTMENTS_TENANT_DATE_INDEX };
