import { useEffect, useRef } from "react";
import { Phone, PhoneMissed, X } from "lucide-react";
import { toast } from "sonner";

/**
 * App-wide "someone's calling" popup, mounted once in DashboardLayout so it
 * fires no matter which page the person is on (Appointments, Messages,
 * Analytics, etc.) — the same idea as a Messenger/Slack incoming-call toast.
 *
 * Three moments matter, all pushed over the shared /api/events SSE stream
 * that NotificationBell also listens on:
 *  - "call-ringing": the instant a call starts ringing in, before it's even
 *    gone to voicemail. Shown until the call's outcome is known.
 *  - "call-ended": Twilio's <Dial> has finished (answered, no-answer, busy,
 *    or failed) — dismisses the matching "call-ringing" toast immediately
 *    rather than leaving it up until an arbitrary timer runs out.
 *  - "missed-call": once a voicemail has been recorded and transcribed.
 *    Auto-dismisses well within 30 seconds; can also be closed manually.
 *
 * Both toasts use the same friendly synthesised dog-bark sound (a guitar
 * strum was tried first but felt too much for a frequent notification).
 */
const RINGING_TOAST_ID = (callSid: string) => `call-ringing-${callSid}`;

export default function IncomingCallAlert() {
  const audioUnlocked = useRef(false);

  useEffect(() => {
    // Browsers block audio playback until the user has interacted with the
    // page at least once. Any click/keypress anywhere unlocks it for the
    // rest of the session.
    const unlock = () => { audioUnlocked.current = true; };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const playSound = (src: string) => {
    if (!audioUnlocked.current) return;
    const audio = new Audio(src);
    audio.volume = 0.55;
    audio.play().catch(() => {
      // Autoplay can still be blocked in some browsers/tabs — a missed
      // sound is a minor annoyance, not worth surfacing an error for.
    });
  };

  useEffect(() => {
    const source = new EventSource("/api/events");
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type === "call-ringing") {
          playSound("/sounds/dog-bark.wav");
          const id = RINGING_TOAST_ID(payload.callSid);
          toast.custom(
            (t) => (
              <div className="relative flex items-center gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 pr-8 shadow-lg">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                  <Phone className="h-5 w-5 animate-pulse text-emerald-600" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Incoming call{payload.clientName ? ` — ${payload.clientName}` : ""}</p>
                  <p className="text-xs text-gray-500">{payload.fromNumber}</p>
                </div>
                <button
                  className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  onClick={() => toast.dismiss(t)}
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ),
            // 25s safety net in case Twilio's dial-result webhook never
            // arrives (e.g. a dropped webhook) — the "call-ended" event
            // below normally dismisses this well before then.
            { duration: 25000, id }
          );
        } else if (payload?.type === "call-ended") {
          toast.dismiss(RINGING_TOAST_ID(payload.callSid));
        } else if (payload?.type === "missed-call") {
          playSound("/sounds/dog-bark.wav");
          const id = `missed-call-${payload.id}`;
          toast.custom(
            (t) => (
              <div className="relative flex items-start gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 pr-8 shadow-lg">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                  <PhoneMissed className="h-5 w-5 text-amber-600" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Missed call{payload.clientName ? ` — ${payload.clientName}` : ""}</p>
                  <p className="text-xs text-gray-500">{payload.fromNumber}</p>
                  {payload.transcriptText && (
                    <p className="mt-1 max-w-xs truncate text-xs italic text-gray-600">"{payload.transcriptText}"</p>
                  )}
                </div>
                <button
                  className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  onClick={() => toast.dismiss(t)}
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ),
            { duration: 15000, id }
          );
        }
      } catch {
        // ignore malformed events
      }
    };
    return () => source.close();
  }, []);

  return null;
}
