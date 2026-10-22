import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { PRESENCE_HEARTBEAT_MS, type PresenceViewer } from "@shared/presence";
import { subscribeToAppEvents } from "@/lib/appEventStream";

/**
 * Who else has this record open, live.
 *
 * Pass a `recordKey` from `presenceKey("appointment", id)` while the
 * dialog is open, and null when it is not — null is how you leave. The
 * hook heartbeats on a timer, listens on the SSE channel that already
 * exists for the notification bell, and tells the server on unmount.
 *
 * Three things it deliberately does:
 *
 * - **Leaves on unmount AND on pagehide.** React's cleanup runs when the
 *   dialog closes, but not when the tab is closed or the phone is locked,
 *   and a groomer closing a laptop lid is the common case. The sweep
 *   would eventually clear them; `pagehide` clears them now.
 * - **Keeps beating while the tab is hidden.** Someone who switches to
 *   their email for a minute still has the dialog open and still has
 *   the record. Stopping would make them flicker out and back.
 * - **Never surfaces its own errors.** A failed heartbeat means the
 *   indicator is briefly wrong, which is not worth a toast on a screen
 *   where somebody is trying to work.
 */
export function usePresence(recordKey: string | null): PresenceViewer[] {
  const [viewers, setViewers] = useState<PresenceViewer[]>([]);
  const heartbeat = trpc.presence.heartbeat.useMutation();
  const leave = trpc.presence.leave.useMutation();

  // Held in refs so the effect below can depend on `recordKey` alone.
  // Without this the tRPC mutation objects, which are new on every
  // render, would tear down and rebuild the timer constantly.
  const beatRef = useRef(heartbeat);
  const leaveRef = useRef(leave);
  beatRef.current = heartbeat;
  leaveRef.current = leave;

  useEffect(() => {
    if (!recordKey) {
      setViewers([]);
      return;
    }
    let cancelled = false;

    const beat = () => {
      beatRef.current
        .mutateAsync({ recordKey })
        .then((others) => { if (!cancelled) setViewers(others); })
        .catch(() => { /* see the note above: a missed beat is not an error worth showing */ });
    };
    beat();
    const timer = setInterval(beat, PRESENCE_HEARTBEAT_MS);

    // Everyone else's arrival or departure arrives here, so the avatars
    // change the moment it happens rather than on the next beat. Shared
    // connection: a client record with an appointment dialog over it
    // mounts this hook twice, and a tab only gets six HTTP/1.1
    // connections in total. See lib/appEventStream.ts.
    const unsubscribe = subscribeToAppEvents((event) => {
      if (event.type !== "presence-changed" || event.recordKey !== recordKey) return;
      // The broadcast is the whole room, and this screen wants everyone
      // but itself. Re-beating is what tells us who that is, rather than
      // tracking our own id here and getting it wrong once.
      beat();
    });

    const sayGoodbye = () => {
      leaveRef.current.mutate({ recordKey });
    };
    window.addEventListener("pagehide", sayGoodbye);

    return () => {
      cancelled = true;
      clearInterval(timer);
      unsubscribe();
      window.removeEventListener("pagehide", sayGoodbye);
      sayGoodbye();
    };
  }, [recordKey]);

  return viewers;
}
