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
    expect(out.map((n) => n.appointmentId)).toEqual([2, 1]);
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
    expect(out.some((n) => n.appointmentId === 3)).toBe(false);
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
    expect(out.map((n) => n.appointmentId)).toEqual([2, 1]);
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
  });
});
