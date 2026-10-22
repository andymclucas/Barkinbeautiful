/**
 * One EventSource for everything that wants server events.
 *
 * Each `new EventSource("/api/events")` is a held-open HTTP connection.
 * The bell, the incoming-call alert and the query invalidator already
 * open one each; presence can be mounted twice at once (a client record
 * with an appointment dialog over it), so giving every hook its own
 * would put a tab at five or six — and HTTP/1.1 allows six per origin
 * in total. Render serves HTTP/2, where this would merely be wasteful,
 * but any proxy in front that downgrades would make the page hang with
 * no error to read.
 *
 * So subscribers share one connection, opened on the first subscriber
 * and closed after the last one leaves. EventSource handles its own
 * reconnection and backoff, which is why there is none here.
 */

type Listener = (event: Record<string, unknown>) => void;

let source: EventSource | null = null;
const listeners = new Set<Listener>();

function open() {
  if (source) return;
  source = new EventSource("/api/events");
  source.onmessage = (message) => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(message.data);
    } catch {
      return;
    }
    // A throwing listener must not stop the others being called.
    for (const listener of Array.from(listeners)) {
      try { listener(parsed); } catch { /* one bad subscriber is not the rest's problem */ }
    }
  };
}

/** Subscribe to every server event. Returns the unsubscribe, which callers MUST call. */
export function subscribeToAppEvents(listener: Listener): () => void {
  listeners.add(listener);
  open();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && source) {
      source.close();
      source = null;
    }
  };
}

/** Only for tests: how many subscribers and whether the socket is open. */
export function appEventStreamState() {
  return { listeners: listeners.size, open: source !== null };
}
