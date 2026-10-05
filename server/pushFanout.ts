/**
 * Turning an app event into a push on everybody's phone.
 *
 * Hooked onto the event bus rather than into the Twilio webhooks,
 * because every event already funnels through emitNewMessage /
 * emitCallRinging / emitMissedCall in eventBus.ts. One listener covers
 * all of them, and a new event type added later pushes automatically if
 * pushForEvent decides it should.
 *
 * Nothing in here may throw. An EventEmitter listener that throws
 * synchronously takes the process with it, and a rejected promise in a
 * listener is an unhandled rejection — either would mean an incoming
 * call could crash the server. So the whole body is wrapped and failures
 * are logged and dropped.
 */
import { appEvents } from "./eventBus";
import { pushForEvent } from "../shared/pushNotification";
import { sendPushToTenant, isPushConfigured } from "./webPush";

let attached = false;

export function startPushFanout() {
  // Boot is idempotent in dev (vite restarts) and attaching twice would
  // send every notification twice.
  if (attached) return;
  attached = true;

  appEvents.on("app-event", (event: unknown) => {
    try {
      const e = (event ?? {}) as { type?: string; tenantId?: number };
      const payload = pushForEvent(e as Parameters<typeof pushForEvent>[0]);
      // call-ended and anything unrecognised: nothing to say.
      if (!payload) return;

      const tenantId = typeof e.tenantId === "number" ? e.tenantId : 1;

      void sendPushToTenant(tenantId, payload)
        .then((result) => {
          if (result.skipped) return; // unconfigured or nobody subscribed
          if (result.sent > 0 || result.pruned > 0 || result.failed > 0) {
            console.log(
              `[push] ${payload.kind}: sent ${result.sent}`
              + `${result.pruned ? `, pruned ${result.pruned}` : ""}`
              + `${result.failed ? `, failed ${result.failed}` : ""}`,
            );
          }
        })
        .catch((error) => {
          console.error("[push] fanout failed:", error);
        });
    } catch (error) {
      console.error("[push] fanout threw:", error);
    }
  });

  console.log(
    isPushConfigured()
      ? "[push] fanout attached — calls and messages will reach closed devices"
      : "[push] fanout attached but VAPID is unconfigured — nothing will be sent",
  );
}
