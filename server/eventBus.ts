import { EventEmitter } from "events";

/**
 * Pub/sub for the real-time events pushed to browser tabs over SSE.
 *
 * ── Why there is an interface here ─────────────────────────────────────────
 * The implementation below is an in-memory EventEmitter, which is correct
 * only because the app runs as a single Node process (Render's default
 * WEB_CONCURRENCY=1 at this instance size). On two instances an event
 * published on one would never reach a tab connected to the other, and
 * nothing would say so — the feature would simply stop working for about half
 * the salon, silently.
 *
 * That is a real risk rather than a theoretical one, so the transport is named
 * and injectable. A Redis implementation is two methods: publish to a channel,
 * and subscribe returning an unsubscribe. Nothing else in the codebase has to
 * change, because everything goes through `eventTransport`.
 */
export interface EventTransport {
  /** Fan an event out to every subscriber, here and on any other instance. */
  publish(event: AppEvent): void;
  /** Receive events. Returns the unsubscribe, which callers MUST call. */
  subscribe(handler: (event: AppEvent) => void): () => void;
  /** Named for logs and for the boot line that says which one is running. */
  readonly name: string;
}

/**
 * The single-process implementation.
 *
 * setMaxListeners is raised because there is one subscriber per connected
 * browser tab, and Node warns at ten.
 */
export function createInMemoryTransport(): EventTransport {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(200);
  return {
    name: "in-memory (single process)",
    publish(event) { emitter.emit("app-event", event); },
    subscribe(handler) {
      emitter.on("app-event", handler);
      return () => { emitter.off("app-event", handler); };
    },
  };
}

export const eventTransport: EventTransport = createInMemoryTransport();

/**
 * Kept so the existing call sites and tests still work. New code should use
 * `eventTransport` — this is the same bus, exposed the old way.
 */
export const appEvents = {
  on: (_: "app-event", handler: (event: AppEvent) => void) => { eventTransport.subscribe(handler); },
  off: () => { /* use the unsubscribe returned by eventTransport.subscribe */ },
  emit: (_: "app-event", event: AppEvent) => { eventTransport.publish(event); },
};

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
  eventTransport.publish({ type: "new-message", tenantId, petNames: [], ...details } satisfies NewMessageEvent);
}

export function emitCallRinging(tenantId: number, callSid: string, fromNumber: string, clientName: string | null, petNames: string[] = []) {
  eventTransport.publish({ type: "call-ringing", tenantId, callSid, fromNumber, clientName, petNames } satisfies CallRingingEvent);
}

export function emitCallEnded(tenantId: number, callSid: string) {
  eventTransport.publish({ type: "call-ended", tenantId, callSid } satisfies CallEndedEvent);
}

export function emitMissedCall(tenantId: number, details: { id: number; fromNumber: string; clientName: string | null; petNames?: string[]; transcriptText: string | null }) {
  eventTransport.publish({ type: "missed-call", tenantId, petNames: [], ...details } satisfies MissedCallEvent);
}

/**
 * Something in the data changed and these screens should reread.
 *
 * Carries topics rather than rows on purpose: the client already knows how to
 * fetch, and shipping the new row would mean every event becoming a second
 * copy of an API, with its own authorisation to get wrong. A topic tells a tab
 * what is stale; the tab refetches through the endpoints it already uses, with
 * the permissions it already has.
 */
export type DataChangedEvent = {
  type: "data-changed";
  tenantId: number;
  topics: string[];
  /** The mutation that caused it, for debugging a surprising refetch. */
  source: string;
};

/**
 * Who is looking at a record. Fanned out so everyone else's open dialog
 * updates the moment somebody arrives or leaves, rather than on their
 * next heartbeat. See server/presenceRegistry.ts.
 */
export type PresenceChangedEvent = {
  type: "presence-changed";
  tenantId: number;
  recordKey: string;
  viewers: { userId: number; name: string; initials: string }[];
};

export type AppEvent =
  | NewMessageEvent
  | PresenceChangedEvent
  | CallRingingEvent
  | CallEndedEvent
  | MissedCallEvent
  | DataChangedEvent
  | { type: "connected" };

export function emitDataChanged(tenantId: number, topics: string[], source: string) {
  if (topics.length === 0) return;
  eventTransport.publish({ type: "data-changed", tenantId, topics, source });
}
