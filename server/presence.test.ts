import { describe, it, expect } from "vitest";
import {
  presenceKey, isPresenceFresh, initialsOf, activeViewers, describeViewers,
  PRESENCE_HEARTBEAT_MS, PRESENCE_TTL_MS,
} from "../shared/presence";

const NOW = 1_700_000_000_000;
const at = (msAgo: number) => NOW - msAgo;

describe("presenceKey", () => {
  it("builds the key a record is tracked under", () => {
    expect(presenceKey("appointment", 4821)).toBe("appointment:4821");
  });

  it("returns null rather than registering a half-loaded dialog", () => {
    // A dialog that has not got its id yet must not claim presence on
    // "appointment:undefined", which would collide for every user.
    for (const bad of [null, undefined, 0, -1, NaN, Infinity]) {
      expect(presenceKey("appointment", bad as number), String(bad)).toBeNull();
    }
    expect(presenceKey("", 1)).toBeNull();
  });
});

describe("expiry", () => {
  it("keeps someone who beat within the window", () => {
    expect(isPresenceFresh({ userId: 1, name: "Lauren", lastSeen: at(PRESENCE_TTL_MS - 1) }, NOW)).toBe(true);
  });

  it("drops someone who has gone quiet", () => {
    expect(isPresenceFresh({ userId: 1, name: "Lauren", lastSeen: at(PRESENCE_TTL_MS) }, NOW)).toBe(false);
  });

  it("tolerates two missed heartbeats but not three", () => {
    // One missed beat is a slow request or a sleeping laptop. Flickering
    // on that teaches people to ignore the indicator; holding a ghost for
    // a minute stops the next person working.
    expect(isPresenceFresh({ userId: 1, name: "L", lastSeen: at(PRESENCE_HEARTBEAT_MS * 2) }, NOW)).toBe(true);
    expect(isPresenceFresh({ userId: 1, name: "L", lastSeen: at(PRESENCE_HEARTBEAT_MS * 3) }, NOW)).toBe(false);
  });
});

describe("initialsOf", () => {
  it("takes at most two letters", () => {
    expect(initialsOf("Lauren Romari")).toBe("LR");
    expect(initialsOf("Megs")).toBe("M");
    expect(initialsOf("Akilah McDonell-Taylor")).toBe("AM");
  });

  it("never renders blank", () => {
    for (const nothing of [null, undefined, "", "   "]) {
      expect(initialsOf(nothing)).toBe("?");
    }
  });
});

describe("activeViewers", () => {
  const LAUREN = { userId: 1, name: "Lauren Romari", lastSeen: at(1_000) };
  const MEGS = { userId: 2, name: "Megs Graham", lastSeen: at(2_000) };
  const STALE = { userId: 3, name: "Ghost", lastSeen: at(PRESENCE_TTL_MS + 1) };

  it("leaves you out of your own viewer list", () => {
    // The whole point is "who ELSE is in here".
    const out = activeViewers([LAUREN, MEGS], { now: NOW, excludeUserId: 1 });
    expect(out.map((v) => v.name)).toEqual(["Megs Graham"]);
  });

  it("drops anyone who has gone quiet", () => {
    const out = activeViewers([LAUREN, STALE], { now: NOW });
    expect(out.map((v) => v.name)).toEqual(["Lauren Romari"]);
  });

  it("counts one person once however many tabs they have open", () => {
    const twoTabs = [
      { userId: 1, name: "Lauren Romari", lastSeen: at(5_000) },
      { userId: 1, name: "Lauren Romari", lastSeen: at(500) },
    ];
    const out = activeViewers(twoTabs, { now: NOW });
    expect(out).toHaveLength(1);
  });

  it("sorts by name so the avatars do not reshuffle on every beat", () => {
    // A row of faces that reorders itself reads as activity that is not
    // happening.
    const out = activeViewers([MEGS, LAUREN], { now: NOW });
    expect(out.map((v) => v.name)).toEqual(["Lauren Romari", "Megs Graham"]);
  });

  it("is empty when nobody else is there", () => {
    expect(activeViewers([], { now: NOW })).toEqual([]);
    expect(activeViewers([LAUREN], { now: NOW, excludeUserId: 1 })).toEqual([]);
  });

  it("carries initials for the avatar", () => {
    expect(activeViewers([LAUREN], { now: NOW })[0].initials).toBe("LR");
  });
});

describe("describeViewers", () => {
  const v = (name: string, userId: number) => ({ userId, name, initials: "X" });

  it("says nothing when nobody is there", () => {
    expect(describeViewers([])).toBe("");
  });

  it("names one and two people", () => {
    expect(describeViewers([v("Lauren", 1)])).toBe("Lauren also has this open");
    expect(describeViewers([v("Lauren", 1), v("Megs", 2)]))
      .toBe("Lauren and Megs also have this open");
  });

  it("counts the rest beyond two", () => {
    expect(describeViewers([v("Lauren", 1), v("Megs", 2), v("Zak", 3)]))
      .toBe("Lauren, Megs and 1 other also have this open");
    expect(describeViewers([v("Lauren", 1), v("Megs", 2), v("Zak", 3), v("Ash", 4)]))
      .toBe("Lauren, Megs and 2 others also have this open");
  });

  it("says 'has this open', never 'is editing'", () => {
    // The system knows the dialog is on their screen and nothing more.
    // "Editing" would be a guess, and wrong every time somebody leaves a
    // tab up.
    const text = describeViewers([v("Lauren", 1)]);
    expect(text).not.toMatch(/editing|changing|working on/i);
    expect(text).toContain("has this open");
  });
});
