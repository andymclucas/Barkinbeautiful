/**
 * Workflow board database cost per SALON, not per screen.
 *
 * Every board screen (tablets, phones, the wall display) used to reload the
 * whole day from the database on its own timer, so a salon's cost grew with
 * how many screens were open. With 250 salons that is the difference between
 * a hosting bill and a crisis (TiDB spending limit, 23/11/2026).
 *
 * Two pieces, both per (salon, day):
 *
 * - A shared board cache. The first screen to ask loads the board; every
 *   other screen asking within 60 seconds gets the same result. The PROMISE
 *   is cached, so a dozen screens told "the board changed" at the same
 *   instant share one query instead of racing twelve.
 *
 * - One change watcher. While at least one screen holds a live connection
 *   (/api/board-events), the server asks the database for the day's
 *   fingerprint every 5 seconds — the cheap indexed COUNT + MAX(updated_at)
 *   behind workflow.getBoardVersion — and tells every screen when it moves.
 *   One query per salon however many screens are open, and none at all once
 *   the last screen closes.
 *
 * Mutations made through the app also nudge the salon's boards straight away
 * (server/_core/trpc.ts, broadcastChange). That covers edits that never touch
 * the appointment row — a style note, an add-on, a pickup text — so a
 * screen's own change is never answered from a stale cache.
 *
 * Several server instances need no Redis for this: each runs its own cache
 * and its own watchers against the same database, so a change made through
 * one instance reaches screens on another within one 5-second check. Only
 * the instant nudge is local (compare server/eventBus.ts, whose events would
 * need a shared transport).
 */

export const BOARD_CACHE_TTL_MS = 60_000;
export const BOARD_WATCH_INTERVAL_MS = 5_000;

type CacheEntry = { at: number; promise: Promise<unknown> };

export type VersionLoader = (tenantId: number, date: string) => Promise<string>;

type Watcher = {
  tenantId: number;
  date: string;
  subscribers: Set<() => void>;
  version: string | undefined;
  timer: ReturnType<typeof setInterval> | null;
  checking: boolean;
};

export function createBoardWatch(options: {
  loadVersion: VersionLoader;
  now?: () => number;
  ttlMs?: number;
  intervalMs?: number;
}) {
  const now = options.now ?? (() => Date.now());
  const ttlMs = options.ttlMs ?? BOARD_CACHE_TTL_MS;
  const intervalMs = options.intervalMs ?? BOARD_WATCH_INTERVAL_MS;
  const cache = new Map<string, CacheEntry>();
  const watchers = new Map<string, Watcher>();

  const keyOf = (tenantId: number, date: string) => `${tenantId}|${date}`;

  function getCachedBoard<T>(tenantId: number, date: string, load: () => Promise<T>): Promise<T> {
    const key = keyOf(tenantId, date);
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.promise as Promise<T>;
    const promise = load();
    const entry: CacheEntry = { at: now(), promise };
    cache.set(key, entry);
    // A failed load must not be served to every screen for a minute.
    promise.catch(() => {
      if (cache.get(key) === entry) cache.delete(key);
    });
    return promise;
  }

  function invalidate(tenantId: number, date?: string) {
    if (date !== undefined) {
      cache.delete(keyOf(tenantId, date));
      return;
    }
    const prefix = `${tenantId}|`;
    for (const key of Array.from(cache.keys())) if (key.startsWith(prefix)) cache.delete(key);
  }

  function notify(watcher: Watcher) {
    for (const subscriber of Array.from(watcher.subscribers)) {
      try { subscriber(); } catch { /* one broken connection is not the others' problem */ }
    }
  }

  async function check(watcher: Watcher) {
    if (watcher.checking) return;
    watcher.checking = true;
    try {
      const version = await options.loadVersion(watcher.tenantId, watcher.date);
      const changed = watcher.version !== undefined && version !== watcher.version;
      watcher.version = version;
      if (changed) {
        invalidate(watcher.tenantId, watcher.date);
        notify(watcher);
      }
    } catch (error) {
      // Leave the last known version; the next tick tries again.
      console.error("[boardWatch] version check failed", watcher.tenantId, watcher.date, error);
    } finally {
      watcher.checking = false;
    }
  }

  function watchBoard(tenantId: number, date: string, onChange: () => void): () => void {
    const key = keyOf(tenantId, date);
    let watcher = watchers.get(key);
    if (!watcher) {
      watcher = { tenantId, date, subscribers: new Set(), version: undefined, timer: null, checking: false };
      watchers.set(key, watcher);
      const w = watcher;
      void check(w); // learn the starting fingerprint now, not 5s from now
      w.timer = setInterval(() => { void check(w); }, intervalMs);
    }
    // Wrapped so the same callback registered twice is two subscriptions.
    const subscription = () => onChange();
    watcher.subscribers.add(subscription);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      const current = watchers.get(key);
      if (!current) return;
      current.subscribers.delete(subscription);
      if (current.subscribers.size === 0) {
        if (current.timer) clearInterval(current.timer);
        watchers.delete(key);
      }
    };
  }

  /** Something in this salon changed through the app: drop its cache and tell its screens. */
  function nudgeBoards(tenantId: number) {
    invalidate(tenantId);
    for (const watcher of Array.from(watchers.values())) {
      if (watcher.tenantId === tenantId) notify(watcher);
    }
  }

  function state() {
    return {
      cached: Array.from(cache.keys()),
      watched: Array.from(watchers.entries()).map(([key, w]) => ({ key, subscribers: w.subscribers.size })),
    };
  }

  return { getCachedBoard, invalidate, watchBoard, nudgeBoards, state };
}

export type BoardWatch = ReturnType<typeof createBoardWatch>;
