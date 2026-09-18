import { useEffect, useRef } from "react";
import { Phone, PhoneMissed } from "lucide-react";
import { toast } from "sonner";

/**
 * App-wide "someone's calling" popup, mounted once in DashboardLayout so it
 * fires no matter which page the person is on (Appointments, Messages,
 * Analytics, etc.) — the same idea as a Messenger/Slack incoming-call toast.
 *
 * Two moments trigger it, both pushed over the shared /api/events SSE
 * stream that NotificationBell also listens on:
 *  - "call-ringing": the instant a call starts ringing in, before it's even
 *    gone to voicemail.
 *  - "missed-call": once a voicemail has been recorded and transcribed.
 *
 * Each plays a distinct sound (synthesised, brand-appropriate — a warm
 * guitar strum for a missed-call voicemail, a friendly double-bark while
 * the phone is actively ringing) so staff can tell the two apart without
 * looking at the screen.
 */
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
          toast.custom(
            () => (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 shadow-lg">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                  <Phone className="h-5 w-5 animate-pulse text-emerald-600" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">Incoming call{payload.clientName ? ` — ${payload.clientName}` : ""}</p>
                  <p className="text-xs text-gray-500">{payload.fromNumber}</p>
                </div>
              </div>
            ),
            { duration: 12000, id: `call-ringing-${payload.fromNumber}-${Date.now()}` }
          );
        } else if (payload?.type === "missed-call") {
          playSound("/sounds/guitar-strum.wav");
          toast.custom(
            () => (
              <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3 shadow-lg">
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
              </div>
            ),
            { duration: 10000, id: `missed-call-${payload.id}` }
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
