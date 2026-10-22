import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { noteArchiveForPet, petsWithNotes } from "../shared/groomerNoteArchive";

const APPTS = [
  { id: 1, petId: 10, scheduledStart: "2026-08-01T00:00:00Z", notes: "First groom, nervous", staffName: "Megs Graham", serviceType: "classic_groom" },
  { id: 2, petId: 10, scheduledStart: "2026-10-22T00:00:00Z", notes: "very matted in ears, had to demat", staffName: "Brooklyn Cossey", serviceType: "classic_groom" },
  { id: 3, petId: 10, scheduledStart: "2026-09-01T00:00:00Z", notes: null },
  { id: 4, petId: 11, scheduledStart: "2026-10-01T00:00:00Z", notes: "Other dog's note", staffName: "Megs Graham" },
];

describe("noteArchiveForPet", () => {
  it("returns only this dog's notes", () => {
    // The whole point is that the groomer who has Waffle today can read
    // what happened to Waffle last time — not to the dog in the next bay.
    const out = noteArchiveForPet(APPTS, 10);
    expect(out.map((n) => n.key)).toEqual(["appointment:2", "appointment:1"]);
    expect(out.some((n) => n.note.includes("Other dog"))).toBe(false);
  });

  it("puts the most recent first", () => {
    const out = noteArchiveForPet(APPTS, 10);
    expect(out[0].note).toContain("very matted");
    expect(out[0].when.getTime()).toBeGreaterThan(out[1].when.getTime());
  });

  it("skips appointments with no note", () => {
    // A groom where nothing unusual happened is the common case, and
    // padding the archive with blanks is what makes people stop reading it.
    const out = noteArchiveForPet(APPTS, 10);
    expect(out).toHaveLength(2);
    expect(out.some((n) => n.key === "appointment:3")).toBe(false);
  });

  it("treats whitespace as no note", () => {
    const out = noteArchiveForPet([
      { id: 1, petId: 10, scheduledStart: "2026-10-01T00:00:00Z", notes: "   \n  " },
    ], 10);
    expect(out).toEqual([]);
  });

  it("carries the groomer and the service for context", () => {
    const [latest] = noteArchiveForPet(APPTS, 10);
    expect(latest.groomer).toBe("Brooklyn Cossey");
    expect(latest.serviceType).toBe("classic_groom");
  });

  it("copes with a note from a groomer nobody recorded", () => {
    const out = noteArchiveForPet([
      { id: 1, petId: 10, scheduledStart: "2026-10-01T00:00:00Z", notes: "Shaved belly", staffName: null },
    ], 10);
    expect(out[0].groomer).toBeNull();
  });

  it("drops a row with an unparseable date rather than sorting it to the top", () => {
    // new Date("nonsense") is NaN, and NaN comparisons make the sort
    // arbitrary — which would scatter the archive, not just misplace one row.
    const out = noteArchiveForPet([
      ...APPTS,
      { id: 9, petId: 10, scheduledStart: "not a date", notes: "Broken" },
    ], 10);
    expect(out.map((n) => n.key)).toEqual(["appointment:2", "appointment:1"]);
  });

  it("is empty for a dog with no appointments", () => {
    expect(noteArchiveForPet(APPTS, 999)).toEqual([]);
    expect(noteArchiveForPet([], 10)).toEqual([]);
  });
});

describe("petsWithNotes", () => {
  it("names only the dogs that have something written", () => {
    expect(Array.from(petsWithNotes(APPTS)).sort()).toEqual([10, 11]);
  });

  it("ignores blank notes", () => {
    expect(petsWithNotes([{ id: 1, petId: 10, scheduledStart: "2026-10-01T00:00:00Z", notes: "  " }]).size).toBe(0);
  });
});

describe("the notes stay out of the client portal", () => {
  it("is not selected by the portal payload", () => {
    /**
     * Andy, 22/10/2026: "Not for client to be able to view in their
     * portal, just for groomers reference."
     *
     * This holds today by omission — buildClientPortalPayload simply
     * does not select appointments.notes — which is a safer shape than a
     * visible-to-client flag somebody could flip. This test is what
     * stops the column being added to that query later by someone
     * filling in a payload and not knowing.
     */
    const src = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    const start = src.indexOf("async function buildClientPortalPayload");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("async function resolvePortalClient", start);
    const body = src.slice(start, end);
    expect(body).not.toContain("notes: appointments.notes");
    // Style notes join the same archive and carry the same promise.
    expect(body).not.toContain("groomStyleNotes");
  });
});

const STYLE = [
  {
    id: 100, petId: 10, createdAt: "2026-10-22T01:00:00Z",
    note: "Owner wants it shorter next time",
    bladeSize: "#4", faceStyle: "Teddy bear", tailStyle: "Rounded",
    warnings: "Hates the dryer on his face",
    staffName: "Brooklyn Cossey", serviceType: "classic_groom",
  },
  { id: 101, petId: 11, createdAt: "2026-10-22T01:00:00Z", note: "Another dog" },
  // A row somebody opened and never filled in.
  { id: 102, petId: 10, createdAt: "2026-07-01T00:00:00Z", note: "   ", warnings: null },
];

describe("style notes in the archive", () => {
  it("merges them into one timeline with the appointment notes", () => {
    const out = noteArchiveForPet(APPTS, 10, STYLE);
    expect(out.map((n) => n.kind)).toEqual(["style", "appointment", "appointment"]);
  });

  it("keeps the two kinds distinguishable", () => {
    const out = noteArchiveForPet(APPTS, 10, STYLE);
    expect(out.find((n) => n.kind === "style")?.key).toBe("style:100");
    expect(out.find((n) => n.kind === "appointment")?.key).toBe("appointment:2");
  });

  it("summarises the styling fields with labels", () => {
    // "#4 · Teddy bear · Rounded" out of context says nothing about
    // which part of the dog each applies to.
    const style = noteArchiveForPet(APPTS, 10, STYLE).find((n) => n.kind === "style");
    expect(style?.styleSummary).toBe("Blade #4 · Face Teddy bear · Tail Rounded");
  });

  it("carries the groomer's warning separately from the note", () => {
    const style = noteArchiveForPet(APPTS, 10, STYLE).find((n) => n.kind === "style");
    expect(style?.warnings).toBe("Hates the dryer on his face");
    expect(style?.note).toBe("Owner wants it shorter next time");
  });

  it("drops a style row with no text in any field", () => {
    const out = noteArchiveForPet([], 10, STYLE);
    expect(out.map((n) => n.key)).toEqual(["style:100"]);
  });

  it("keeps another dog's style notes out", () => {
    const out = noteArchiveForPet([], 10, STYLE);
    expect(out.some((n) => n.note.includes("Another dog"))).toBe(false);
  });

  it("keeps a style note whose only content is the styling itself", () => {
    // A groomer who set the blade and typed nothing still recorded
    // something worth reading next time.
    const out = noteArchiveForPet([], 10, [
      { id: 7, petId: 10, createdAt: "2026-10-01T00:00:00Z", note: null, bladeSize: "#7" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].styleSummary).toBe("Blade #7");
  });

  it("orders a style note and its groom stably when they share a timestamp", () => {
    // Identical timestamps must not let the list reshuffle between renders.
    const same = "2026-10-22T00:00:00Z";
    const a = noteArchiveForPet(
      [{ id: 2, petId: 10, scheduledStart: same, notes: "On the day" }],
      10,
      [{ id: 5, petId: 10, createdAt: same, note: "How it was cut" }],
    );
    const b = noteArchiveForPet(
      [{ id: 2, petId: 10, scheduledStart: same, notes: "On the day" }],
      10,
      [{ id: 5, petId: 10, createdAt: same, note: "How it was cut" }],
    );
    expect(a.map((n) => n.key)).toEqual(b.map((n) => n.key));
  });

  it("counts dogs that have only style notes as having notes", () => {
    expect(Array.from(petsWithNotes([], STYLE)).sort()).toEqual([10, 11]);
  });
});
