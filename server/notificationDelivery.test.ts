import { describe, expect, it } from "vitest";
import { chooseDelivery, canAskForPermission, notificationBody, notificationForEvent, badgeCountFor } from "../shared/notificationDelivery";

const base = { supported: true, permission: "granted", enabled: true, documentHidden: true } as const;

describe("chooseDelivery", () => {
  it("pops an OS notification when the tab is in the background", () => {
    expect(chooseDelivery({ ...base })).toBe("os");
  });

  it("stays in the page when the tab is in front", () => {
    // A popup over the page they are already reading is noise.
    expect(chooseDelivery({ ...base, documentHidden: false })).toBe("in_app");
  });

  it("falls back to the page where the browser has no notifications", () => {
    // A plain Safari tab on iOS: window.Notification does not exist.
    expect(chooseDelivery({ ...base, supported: false })).toBe("in_app");
  });

  it("falls back to the page when permission was never given", () => {
    expect(chooseDelivery({ ...base, permission: "default" })).toBe("in_app");
    expect(chooseDelivery({ ...base, permission: "denied" })).toBe("in_app");
  });

  it("says nothing at all when the staff member switched it off", () => {
    // Off means off, not a quieter version.
    for (const hidden of [true, false]) {
      for (const permission of ["granted", "denied", "default"] as const) {
        expect(chooseDelivery({ supported: true, permission, enabled: false, documentHidden: hidden })).toBe("none");
      }
    }
  });

  it("never returns none while it is switched on", () => {
    // Silence with the switch on is the failure nobody reports; they just
    // stop trusting it.
    for (const supported of [true, false]) {
      for (const hidden of [true, false]) {
        for (const permission of ["granted", "denied", "default"] as const) {
          expect(chooseDelivery({ supported, permission, enabled: true, documentHidden: hidden })).not.toBe("none");
        }
      }
    }
  });
});

describe("canAskForPermission", () => {
  it("only asks when the browser has not been asked", () => {
    expect(canAskForPermission({ supported: true, permission: "default" })).toBe(true);
  });

  it("does not offer a button that cannot work", () => {
    // Asking after a refusal resolves "denied" without showing anything.
    expect(canAskForPermission({ supported: true, permission: "denied" })).toBe(false);
    expect(canAskForPermission({ supported: true, permission: "granted" })).toBe(false);
    expect(canAskForPermission({ supported: false, permission: "default" })).toBe(false);
  });
});

describe("notificationBody", () => {
  it("collapses the whitespace a pasted message arrives with", () => {
    expect(notificationBody("Hi   there\n\nis  Reggie ready?")).toBe("Hi there is Reggie ready?");
  });

  it("truncates rather than letting the browser cut mid-word", () => {
    const body = notificationBody("x".repeat(200));
    expect(body.length).toBe(120);
    expect(body.endsWith("…")).toBe(true);
  });

  it("leaves a short message alone", () => {
    expect(notificationBody("Running 10 minutes late")).toBe("Running 10 minutes late");
  });
});

describe("notificationForEvent", () => {
  it("names the client when we know them", () => {
    const n = notificationForEvent({ type: "new-message", clientId: 258, clientName: "Holly Lucas", fromNumber: "+61401028405", body: "Is Reggie ready?" });
    expect(n?.title).toBe("Message from Holly Lucas");
    expect(n?.body).toBe("Is Reggie ready?");
    expect(n?.url).toBe("/messages?clientId=258");
  });

  it("falls back to the number for someone we do not know", () => {
    const n = notificationForEvent({ type: "new-message", clientName: null, fromNumber: "+61400000000", body: "hi" });
    expect(n?.title).toBe("Message from +61400000000");
    expect(n?.url).toContain("toNumber=");
  });

  it("tags per conversation so a burst collapses to one", () => {
    // Twenty texts from one client on a locked screen should leave one
    // notification, not twenty to dismiss.
    const a = notificationForEvent({ type: "new-message", fromNumber: "+61401028405", body: "one" });
    const b = notificationForEvent({ type: "new-message", fromNumber: "+61401028405", body: "two" });
    expect(a?.tag).toBe(b?.tag);
  });

  it("keeps calls and texts from the same number apart", () => {
    const sms = notificationForEvent({ type: "new-message", fromNumber: "+61401028405", body: "x" });
    const call = notificationForEvent({ type: "missed-call", fromNumber: "+61401028405", transcriptText: null });
    expect(sms?.tag).not.toBe(call?.tag);
  });

  it("says so when a missed call left no voicemail", () => {
    // An empty body renders as a title with a blank line under it.
    const n = notificationForEvent({ type: "missed-call", clientName: "Toni", fromNumber: "+61411546376", transcriptText: null });
    expect(n?.body).toBe("No voicemail left.");
  });

  it("sends a missed call to the client record, not the thread", () => {
    const n = notificationForEvent({ type: "missed-call", clientId: 15, clientName: "Toni", fromNumber: "+61411546376", transcriptText: "call me" });
    expect(n?.url).toBe("/clients/15");
  });

  it("stays quiet about a ringing call and anything unrecognised", () => {
    // It has its own alert, and a popup usually lands after someone
    // has already picked up.
    expect(notificationForEvent({ type: "call-ringing", fromNumber: "+61400000000" })).toBeNull();
    expect(notificationForEvent({ type: "something-new" })).toBeNull();
    expect(notificationForEvent({})).toBeNull();
  });
});

describe("badgeCountFor", () => {
  it("shows the count", () => {
    expect(badgeCountFor(1)).toBe(1);
    expect(badgeCountFor(7)).toBe(7);
  });

  it("clears rather than badging a zero", () => {
    // setAppBadge(0) draws a dot on some platforms instead of removing
    // the badge, leaving a mark when there is nothing to see.
    expect(badgeCountFor(0)).toBeNull();
    expect(badgeCountFor(-3)).toBeNull();
  });

  it("caps at 99 rather than drawing a four-digit badge", () => {
    expect(badgeCountFor(100)).toBe(99);
    expect(badgeCountFor(14000)).toBe(99);
  });

  it("clears on anything unreadable rather than throwing", () => {
    // A badge is decoration; it must never take the page down.
    for (const bad of [NaN, Infinity, null, undefined, "", "abc", {}, []]) {
      expect(badgeCountFor(bad)).toBeNull();
    }
  });

  it("floors a fraction", () => {
    expect(badgeCountFor(3.7)).toBe(3);
  });
});
