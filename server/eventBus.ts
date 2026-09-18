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

/** Fired the instant a call rings in \u2014 before it's even gone to voicemail \u2014
 * so staff can see "someone's calling" live, the same way Messenger/Slack
 * surface an incoming call regardless of what page you're on. */
export type CallRingingEvent = {
  type: "call-ringing";
  tenantId: number;
  fromNumber: string;
  clientName: string | null;
};

export type MissedCallEvent = {
  type: "missed-call";
  tenantId: number;
  id: number;
  fromNumber: string;
  clientName: string | null;
  transcriptText: string | null;
};

export function emitNewMessage(tenantId: number) {
  appEvents.emit("app-event", { type: "new-message", tenantId } satisfies NewMessageEvent);
}

export function emitCallRinging(tenantId: number, fromNumber: string, clientName: string | null) {
  appEvents.emit("app-event", { type: "call-ringing", tenantId, fromNumber, clientName } satisfies CallRingingEvent);
}

export function emitMissedCall(tenantId: number, details: { id: number; fromNumber: string; clientName: string | null; transcriptText: string | null }) {
  appEvents.emit("app-event", { type: "missed-call", tenantId, ...details } satisfies MissedCallEvent);
}
