import { describe, expect, it } from "vitest";
import {
  pushForEvent, isDeadSubscription, PUSH_TTL_SECONDS, PUSH_URGENCY,
  vapidKeyToBytes, pushCapability,
} from "@shared/pushNotification";
import { notificationForEvent } from "@shared/notificationDelivery";

const ringing = {
  type: "call-ringing", callSid: "CA1", fromNumber: "+61400111222",
  clientName: "Simone Yates", clientId: 42,
};

describe("push payloads", () => {
  it("pushes a ringing call, which the in-page path deliberately does not", () => {
    // This is the whole point of the feature: notificationForEvent returns
    // null for a ringing call because an open tab already has a chime, and
    // for a closed app that meant nothing at all arrived.
    expect(notificationForEvent(ringing)).toBeNull();
    const push = pushForEvent(ringing);
    expect(push).not.toBeNull();
    expect(push!.title).toBe("Simone Yates is calling");
  });

  it("sends a ringing call to the client record, where their pets are", () => {
    expect(pushForEvent(ringing)!.url).toBe("/clients/42");
  });

  it("falls back to the number, then to a readable unknown", () => {
    expect(pushForEvent({ type: "call-ringing", fromNumber: "+61400111222" })!.title)
      .toBe("+61400111222 is calling");
    expect(pushForEvent({ type: "call-ringing" })!.title).toBe("Unknown number is calling");
  });

  it("pushes nothing when a call ends", () => {
    // A push per call leg would double the traffic to tell someone whose
    // phone is in their pocket that a call they never saw is over.
    expect(pushForEvent({ type: "call-ended", callSid: "CA1" })).toBeNull();
    expect(pushForEvent({ type: "something-new-later" })).toBeNull();
    expect(pushForEvent({})).toBeNull();
  });

  it("replaces a ringing call with the missed call rather than stacking them", () => {
    // Same tag, so the lock screen ends up saying "Missed call from
    // Simone" instead of holding that and "Simone is calling" at once.
    const ring = pushForEvent(ringing)!;
    const missed = pushForEvent({ ...ringing, type: "missed-call", id: 9, transcriptText: null })!;
    expect(missed.tag).toBe(ring.tag);
    expect(missed.title).toBe("Missed call from Simone Yates");
    expect(missed.body).toBe("No voicemail left.");
    // And it must buzz again — they hung up, which is new information.
    expect(missed.renotify).toBe(true);
    expect(ring.renotify).toBe(false);
  });

  it("uses the same tags as the in-page popup, so the two collapse into one", () => {
    // When Groomigo is open in a background tab both paths fire for the
    // same event. Matching tags are the only thing stopping two
    // notifications for one message.
    for (const event of [
      { type: "missed-call", id: 1, fromNumber: "+61400111222", clientName: "Simone", clientId: 42, transcriptText: null },
      { type: "new-message", id: 2, fromNumber: "+61400111222", clientName: "Simone", clientId: 42, body: "hi" },
    ]) {
      expect(pushForEvent(event)!.tag).toBe(notificationForEvent(event)!.tag);
    }
  });

  it("expires a ringing push with the ring, and keeps the rest", () => {
    // A phone that was out of signal gets its backlog on reconnect. A
    // ringing push arriving twenty minutes late makes someone answer a
    // dead line, so it is told to expire; a missed call is still true.
    expect(PUSH_TTL_SECONDS["call-ringing"]).toBeLessThanOrEqual(60);
    expect(PUSH_TTL_SECONDS["missed-call"]).toBeGreaterThanOrEqual(3600);
    expect(PUSH_TTL_SECONDS["new-message"]).toBeGreaterThanOrEqual(3600);
  });

  it("only spends high urgency on a live call", () => {
    expect(PUSH_URGENCY["call-ringing"]).toBe("high");
    expect(PUSH_URGENCY["missed-call"]).toBe("normal");
    expect(PUSH_URGENCY["new-message"]).toBe("normal");
  });

  it("holds the screen for a live call and nothing else", () => {
    expect(pushForEvent(ringing)!.requireInteraction).toBe(true);
    expect(pushForEvent({ ...ringing, type: "new-message", body: "hi" })!.requireInteraction).toBe(false);
  });

  it("truncates a long voicemail transcript to something a phone will show", () => {
    const push = pushForEvent({ type: "missed-call", id: 1, fromNumber: "+61400111222", transcriptText: "a".repeat(400) })!;
    expect(push.body.length).toBeLessThanOrEqual(120);
    expect(push.body.endsWith("…")).toBe(true);
  });

  it("keeps an unrecognised caller reachable from the notification", () => {
    const push = pushForEvent({ type: "new-message", id: 1, fromNumber: "+61400111222", body: "hello" })!;
    expect(push.url).toBe("/messages?toNumber=%2B61400111222");
  });
});

describe("pruning dead subscriptions", () => {
  it("deletes a subscription the push service says is gone", () => {
    expect(isDeadSubscription(404)).toBe(true);
    expect(isDeadSubscription(410)).toBe(true);
  });

  it("KEEPS a subscription that merely failed", () => {
    // The dangerous direction. Treating a 500 at Google or a 429 as
    // "gone" would unsubscribe the whole salon over one bad afternoon,
    // silently, and nobody would notice until a call was missed.
    for (const code of [429, 500, 502, 503, 400, 401, undefined]) {
      expect(isDeadSubscription(code), `status ${code} must not prune`).toBe(false);
    }
  });
});

describe("decoding the VAPID key", () => {
  const decode = (s: string) => Buffer.from(s, "base64").toString("binary");

  it("decodes the real key we generated, to the 65 bytes a P-256 point is", () => {
    // An uncompressed P-256 public key is 65 bytes starting with 0x04.
    // Anything else and pushManager.subscribe rejects it.
    const key = "BLAyJZPxZt3aMNMAqHvbFupOT1LisBzafyUTiNH2w-Pz-yxpAFdAT9yHJTi2IA5W_II0GPOi5xnbGslCGGQr2_U";
    const bytes = vapidKeyToBytes(key, decode);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(0x04);
  });

  it("handles base64url's - and _ and its missing padding", () => {
    // The failure here is silent: a mis-decoded key subscribes fine and
    // then simply never delivers, which looks like a broken phone.
    expect(Array.from(vapidKeyToBytes("-_8", decode))).toEqual([0xfb, 0xff]);
    expect(Array.from(vapidKeyToBytes("AAAA", decode))).toEqual([0, 0, 0]);
    expect(Array.from(vapidKeyToBytes("AQ", decode))).toEqual([1]);
  });
});

describe("what this device can do", () => {
  const base = {
    hasServiceWorker: true, hasPushManager: true, isIos: false,
    isStandalone: false, permission: "granted" as const, serverConfigured: true,
  };

  it("says yes when everything is in place", () => {
    expect(pushCapability(base)).toEqual({ usable: true });
  });

  it("tells an iPhone in a Safari tab to install, not that it is unsupported", () => {
    // The whole reason this is a function. iOS exposes no PushManager in
    // an ordinary tab, so the naive check reports "unsupported" — a dead
    // end — when the real answer is Share → Add to Home Screen.
    expect(pushCapability({ ...base, isIos: true, isStandalone: false, hasPushManager: false }))
      .toEqual({ usable: false, reason: "ios_needs_install" });
  });

  it("lets an installed iPhone through", () => {
    expect(pushCapability({ ...base, isIos: true, isStandalone: true })).toEqual({ usable: true });
  });

  it("distinguishes a blocked browser from an incapable one", () => {
    expect(pushCapability({ ...base, permission: "denied" }))
      .toEqual({ usable: false, reason: "permission_denied" });
    expect(pushCapability({ ...base, hasServiceWorker: false }))
      .toEqual({ usable: false, reason: "unsupported" });
  });

  it("reports an unconfigured server separately from a limited device", () => {
    // Otherwise a missing VAPID key on Render looks like every staff
    // phone being broken at once.
    expect(pushCapability({ ...base, serverConfigured: false }))
      .toEqual({ usable: false, reason: "server_not_configured" });
  });
});
