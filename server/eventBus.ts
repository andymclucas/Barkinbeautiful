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
  id: number;
  fromNumber: string;
  clientName: string | null;
  petNames: string[];
  body: string;
};

/** Fired the instant a call rings in \u2014 before it's even gone to voicemail \u2014
 * so staff can see "someone's calling" live, the same way Messenger/Slack
 * surface an incoming call regardless of what page you're on. */
export type CallRingingEvent = {
  type: "call-ringing";
  tenantId: number;
  callSid: string;
  fromNumber: string;
  clientName: string | null;
  petNames: string[];
};

/** Fired the moment Twilio's <Dial> finishes \u2014 answered, no-answer, busy,
 * or failed \u2014 so the client can immediately dismiss the matching
 * "call-ringing" toast instead of leaving it up until its own timer expires. */
export type CallEndedEvent = {
  type: "call-ended";
  tenantId: number;
  callSid: string;
};

export type MissedCallEvent = {
  type: "missed-call";
  tenantId: number;
  id: number;
  fromNumber: string;
  clientName: string | null;
  petNames: string[];
  transcriptText: string | null;
};

export function emitNewMessage(tenantId: number, details: { id: number; fromNumber: string; clientName: string | null; petNames?: string[]; body: string }) {
  appEvents.emit("app-event", { type: "new-message", tenantId, petNames: [], ...details } satisfies NewMessageEvent);
}

export function emitCallRinging(tenantId: number, callSid: string, fromNumber: string, clientName: string | null, petNames: string[] = []) {
  appEvents.emit("app-event", { type: "call-ringing", tenantId, callSid, fromNumber, clientName, petNames } satisfies CallRingingEvent);
}

export function emitCallEnded(tenantId: number, callSid: string) {
  appEvents.emit("app-event", { type: "call-ended", tenantId, callSid } satisfies CallEndedEvent);
}

export function emitMissedCall(tenantId: number, details: { id: number; fromNumber: string; clientName: string | null; petNames?: string[]; transcriptText: string | null }) {
  appEvents.emit("app-event", { type: "missed-call", tenantId, petNames: [], ...details } satisfies MissedCallEvent);
}
