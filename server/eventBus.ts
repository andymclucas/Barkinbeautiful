import { EventEmitter } from "events";

/**
 * A tiny in-memory pub/sub used to push real-time events (like a new inbound
 * SMS) out to connected browser tabs via Server-Sent Events.
 *
 * This only works correctly because the app runs as a single Node process
 * (Render's default WEB_CONCURRENCY=1 for this instance size). If this ever
 * moves to multiple instances/processes, this in-memory bus would need to be
 * replaced with something shared across processes (e.g. Redis pub/sub),
 * since events emitted on one process wouldn't reach clients connected to
 * another.
 */
export const appEvents = new EventEmitter();
appEvents.setMaxListeners(100); // one per connected browser tab

export type NewMessageEvent = {
  type: "new-message";
  tenantId: number;
};

export function emitNewMessage(tenantId: number) {
  appEvents.emit("app-event", { type: "new-message", tenantId } satisfies NewMessageEvent);
}
