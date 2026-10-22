import { describe, it, expect, beforeEach } from "vitest";
import { heartbeat, leave, sweep, viewersOf, resetPresence } from "./presenceRegistry";
import { PRESENCE_TTL_MS } from "../shared/presence";

const NOW = 1_700_000_000_000;
const LAUREN = { tenantId: 1, recordKey: "appointment:4821", userId: 1, name: "Lauren Romari" };
const MEGS = { tenantId: 1, recordKey: "appointment:4821", userId: 2, name: "Megs Graham" };

beforeEach(resetPresence);

describe("heartbeat", () => {
  it("returns everyone except the caller", () => {
    heartbeat({ ...LAUREN, now: NOW });
    const seenByMegs = heartbeat({ ...MEGS, now: NOW });
    expect(seenByMegs.map((v) => v.name)).toEqual(["Lauren Romari"]);
  });

  it("shows nobody when you are the only one in there", () => {
    expect(heartbeat({ ...LAUREN, now: NOW })).toEqual([]);
  });

  it("keeps somebody alive across repeated beats", () => {
    heartbeat({ ...LAUREN, now: NOW });
    heartbeat({ ...LAUREN, now: NOW + PRESENCE_TTL_MS - 1 });
    const later = NOW + PRESENCE_TTL_MS + 10;
    // Beat refreshed lastSeen, so Lauren survives past the original TTL.
    expect(heartbeat({ ...MEGS, now: later - 1 }).map((v) => v.name)).toEqual(["Lauren Romari"]);
  });
});

describe("tenant isolation", () => {
  it("does not show one salon's viewers to another", () => {
    // Same record id in two salons is not the same record.
    heartbeat({ ...LAUREN, tenantId: 1, now: NOW });
    const otherSalon = heartbeat({ tenantId: 2, recordKey: "appointment:4821", userId: 9, name: "Someone Else", now: NOW });
    expect(otherSalon).toEqual([]);
    expect(viewersOf(1, "appointment:4821", NOW)).toHaveLength(1);
    expect(viewersOf(2, "appointment:4821", NOW)).toHaveLength(1);
  });
});

describe("leave", () => {
  it("removes the person immediately", () => {
    heartbeat({ ...LAUREN, now: NOW });
    heartbeat({ ...MEGS, now: NOW });
    leave({ ...LAUREN, now: NOW });
    expect(viewersOf(1, "appointment:4821", NOW).map((v) => v.name)).toEqual(["Megs Graham"]);
  });

  it("is idempotent — leaving twice is not an error", () => {
    heartbeat({ ...LAUREN, now: NOW });
    leave({ ...LAUREN, now: NOW });
    expect(() => leave({ ...LAUREN, now: NOW })).not.toThrow();
    expect(viewersOf(1, "appointment:4821", NOW)).toEqual([]);
  });

  it("copes with leaving a record nobody was on", () => {
    expect(() => leave({ tenantId: 1, recordKey: "appointment:999", userId: 1, now: NOW })).not.toThrow();
  });
});

describe("sweep", () => {
  it("drops a browser that crashed without saying goodbye", () => {
    // No `leave` ever arrives from a tab that is killed, a laptop that
    // sleeps, or a network that drops. Without the sweep that person
    // sits on the record for ever.
    heartbeat({ ...LAUREN, now: NOW });
    expect(viewersOf(1, "appointment:4821", NOW)).toHaveLength(1);
    const removed = sweep(NOW + PRESENCE_TTL_MS + 1);
    expect(removed).toBe(1);
    expect(viewersOf(1, "appointment:4821", NOW + PRESENCE_TTL_MS + 1)).toEqual([]);
  });

  it("leaves a live viewer alone", () => {
    heartbeat({ ...LAUREN, now: NOW });
    expect(sweep(NOW + 1_000)).toBe(0);
    expect(viewersOf(1, "appointment:4821", NOW + 1_000)).toHaveLength(1);
  });

  it("sweeps across several records and salons at once", () => {
    heartbeat({ ...LAUREN, now: NOW });
    heartbeat({ ...MEGS, recordKey: "appointment:9", now: NOW });
    heartbeat({ tenantId: 2, recordKey: "client:3", userId: 7, name: "Other", now: NOW });
    expect(sweep(NOW + PRESENCE_TTL_MS + 1)).toBe(3);
  });

  it("does not throw on an empty registry", () => {
    expect(sweep(NOW)).toBe(0);
  });
});

describe("several tabs", () => {
  it("counts one person once", () => {
    heartbeat({ ...LAUREN, now: NOW });
    heartbeat({ ...LAUREN, now: NOW + 100 });   // second tab, same user
    expect(viewersOf(1, "appointment:4821", NOW + 100)).toHaveLength(1);
  });
});
