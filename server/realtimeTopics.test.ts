import { describe, expect, it } from "vitest";
import { shouldBroadcast, staleTopicsFor, topicForPath } from "@shared/realtimeTopics";

describe("topicForPath", () => {
  it("takes the router namespace", () => {
    expect(topicForPath("workflow.updateState")).toBe("workflow");
    expect(topicForPath("clients.updateClient")).toBe("clients");
  });

  it("copes with a bare name and with nothing", () => {
    expect(topicForPath("workflow")).toBe("workflow");
    expect(topicForPath("")).toBe("");
    expect(topicForPath(null)).toBe("");
    expect(topicForPath(undefined)).toBe("");
  });
});

describe("staleTopicsFor", () => {
  it("always includes the topic itself", () => {
    expect(staleTopicsFor("settings")).toContain("settings");
    expect(staleTopicsFor("somethingNew")).toEqual(["somethingNew"]);
  });

  it("moving a dog on the board also restales the diary and the tracker", () => {
    // The failure this exists to stop: a groomer advances a dog, the calendar
    // still shows it waiting, and someone books over the slot.
    const stale = staleTopicsFor("workflow");
    expect(stale).toContain("calendar");
    expect(stale).toContain("tracker");
  });

  it("is symmetric where the screens are two views of one thing", () => {
    expect(staleTopicsFor("calendar")).toContain("workflow");
    expect(staleTopicsFor("workflow")).toContain("calendar");
  });

  it("money reaches the appointment, the client and the numbers", () => {
    const stale = staleTopicsFor("payments");
    for (const t of ["calendar", "clients", "analytics"]) expect(stale).toContain(t);
  });

  it("renaming a dog restales every screen that names one", () => {
    const stale = staleTopicsFor("pets");
    for (const t of ["calendar", "workflow", "tracker", "clients"]) expect(stale).toContain(t);
  });

  it("deduplicates and sorts, so two callers agree", () => {
    const stale = staleTopicsFor("workflow");
    expect(stale).toEqual([...new Set(stale)]);
    expect(stale).toEqual([...stale].sort());
  });

  it("is empty for nothing, rather than inventing a topic", () => {
    expect(staleTopicsFor("")).toEqual([]);
    expect(staleTopicsFor(null)).toEqual([]);
  });
});

describe("shouldBroadcast", () => {
  it("broadcasts ordinary salon changes", () => {
    for (const p of ["workflow.updateState", "clients.update", "payments.take"]) {
      expect(shouldBroadcast(p)).toBe(true);
    }
  });

  it("stays quiet for per-caller things", () => {
    // Nobody else's screen goes stale because one person signed in, and
    // waking every tab in the salon for it would be pure noise.
    for (const p of ["auth.login", "auth.logout", "system.health"]) {
      expect(shouldBroadcast(p)).toBe(false);
    }
  });

  it("stays quiet for an unparseable path", () => {
    expect(shouldBroadcast("")).toBe(false);
    expect(shouldBroadcast(null)).toBe(false);
  });
});
