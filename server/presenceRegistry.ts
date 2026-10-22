/**
 * Who is looking at what, held in memory.
 *
 * In memory is correct here for the same reason the event bus is: Render
 * runs this as a single Node process (`WEB_CONCURRENCY=1`, confirmed in
 * the boot log on 22/10/2026). On two instances a viewer on one would be
 * invisible to a tab on the other, and nothing would say so. The fix is
 * the same fix — see the note at the top of server/eventBus.ts — and
 * this registry is deliberately small so it can move behind the same
 * interface when that day comes.
 *
 * Losing the whole map on a deploy is fine and needs no persistence: the
 * worst case is that every open dialog shows nobody for up to one
 * heartbeat, then repopulates.
 */

import { eventTransport } from "./eventBus";
import {
  activeViewers, isPresenceFresh, PRESENCE_TTL_MS,
  type PresenceEntry, type PresenceViewer,
} from "../shared/presence";

/** recordKey -> userId -> entry. Scoped by tenant in the key. */
const byRecord = new Map<string, Map<number, PresenceEntry>>();

/** Tenant is part of the stored key so two salons cannot collide. */
function scoped(tenantId: number, recordKey: string): string {
  return `${tenantId}/${recordKey}`;
}

function publish(tenantId: number, recordKey: string, viewers: PresenceViewer[]) {
  // The SSE endpoint already drops events whose tenantId is not the
  // viewer's, so this cannot leak across salons.
  eventTransport.publish({ type: "presence-changed", tenantId, recordKey, viewers });
}

/** Everyone currently on a record, including the caller. */
export function viewersOf(tenantId: number, recordKey: string, now = Date.now()): PresenceViewer[] {
  const entries = byRecord.get(scoped(tenantId, recordKey));
  if (!entries) return [];
  return activeViewers(Array.from(entries.values()), { now });
}

/**
 * "I am looking at this." Returns everyone EXCEPT the caller, which is
 * what the caller's own screen wants to show.
 */
export function heartbeat(input: {
  tenantId: number;
  recordKey: string;
  userId: number;
  name: string;
  now?: number;
}): PresenceViewer[] {
  const now = input.now ?? Date.now();
  const key = scoped(input.tenantId, input.recordKey);
  const entries = byRecord.get(key) ?? new Map<number, PresenceEntry>();
  const wasThere = entries.has(input.userId) && isPresenceFresh(entries.get(input.userId)!, now);
  entries.set(input.userId, { userId: input.userId, name: input.name, lastSeen: now });
  byRecord.set(key, entries);

  // Only tell everyone else when the set actually changed. A heartbeat
  // from somebody already on the list is the common case by far, and
  // fanning that out every 20 seconds per open dialog is noise that
  // would arrive at every connected tab in the salon.
  if (!wasThere) publish(input.tenantId, input.recordKey, viewersOf(input.tenantId, input.recordKey, now));

  return activeViewers(Array.from(entries.values()), { now, excludeUserId: input.userId });
}

/** "I have closed it." Idempotent: leaving twice is not an error. */
export function leave(input: { tenantId: number; recordKey: string; userId: number; now?: number }): void {
  const now = input.now ?? Date.now();
  const key = scoped(input.tenantId, input.recordKey);
  const entries = byRecord.get(key);
  if (!entries?.delete(input.userId)) return;
  if (entries.size === 0) byRecord.delete(key);
  publish(input.tenantId, input.recordKey, viewersOf(input.tenantId, input.recordKey, now));
}

/**
 * Drop everyone who has gone quiet, and tell the rooms that changed.
 *
 * Needed because a browser that crashes, sleeps or loses its network
 * never sends `leave`, and without a sweep its owner would sit on the
 * record for ever. Returns the number of entries removed, for the test
 * and for a log line.
 */
export function sweep(now = Date.now()): number {
  let removed = 0;
  for (const [key, entries] of Array.from(byRecord.entries())) {
    const before = entries.size;
    for (const [userId, entry] of Array.from(entries.entries())) {
      if (!isPresenceFresh(entry, now)) entries.delete(userId);
    }
    if (entries.size === before) continue;
    removed += before - entries.size;
    const [tenantPart, ...rest] = key.split("/");
    const tenantId = Number(tenantPart);
    const recordKey = rest.join("/");
    if (entries.size === 0) byRecord.delete(key);
    publish(tenantId, recordKey, viewersOf(tenantId, recordKey, now));
  }
  return removed;
}

/** Only for tests: forget everything. */
export function resetPresence(): void {
  byRecord.clear();
}

/**
 * Sweeps on a timer. Started once from the Express boot.
 *
 * `unref` so an idle sweep timer never keeps the process alive — without
 * it a graceful shutdown waits on a 25-second interval for no reason.
 */
let sweeper: ReturnType<typeof setInterval> | null = null;
export function startPresenceSweeper(intervalMs = PRESENCE_TTL_MS / 2): () => void {
  if (sweeper) return () => {};
  sweeper = setInterval(() => {
    try { sweep(); } catch (err) { console.error("[presence] sweep failed", err); }
  }, intervalMs);
  sweeper.unref?.();
  return () => { if (sweeper) { clearInterval(sweeper); sweeper = null; } };
}
