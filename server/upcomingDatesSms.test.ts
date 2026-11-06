import { describe, expect, it } from "vitest";
import {
  MAX_DATES_IN_SMS, buildUpcomingDatesSms, upcomingDatesShown, upcomingDatesSmsIsGsm7,
} from "../shared/upcomingDatesSms";
import { calculateSmsCost } from "../shared/smsSegments";

/** Bronwyn Waegh's Gizmo, four-weekly from January 2027. */
const BRONWYN_DATES = [
  "Fri 12 Feb", "Fri 12 Mar", "Fri 9 Apr", "Fri 7 May", "Fri 4 Jun",
  "Fri 2 Jul", "Fri 30 Jul", "Fri 27 Aug", "Fri 24 Sep", "Fri 22 Oct",
  "Fri 19 Nov", "Fri 17 Dec", "Fri 14 Jan",
];

describe("the text itself", () => {
  it("names the dog, the salon and every date in order", () => {
    const body = buildUpcomingDatesSms({
      clientFirstName: "Bronwyn", petNames: ["Gizmo"], dates: BRONWYN_DATES,
    });
    expect(body).toContain("Hi Bronwyn!");
    expect(body).toContain("Gizmo's grooming appointments");
    expect(body).toContain("Barkin");
    for (const date of BRONWYN_DATES) expect(body).toContain(date);
    // In order, not just present: a list a client reads top to bottom.
    const positions = BRONWYN_DATES.map((d) => body.indexOf(d));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("speaks of a family as one booking", () => {
    const body = buildUpcomingDatesSms({
      clientFirstName: "Mellissa", petNames: ["Junior", "Neymar", "Alex"], dates: ["Fri 12 Feb"],
    });
    // One text for the family, as everywhere else in this system.
    expect(body).toContain("Junior");
    expect(body).toContain("Alex");
    expect(body).toContain("appointment");
    expect(body).not.toContain("appointments");
  });

  it("falls back on a missing first name rather than greeting nobody", () => {
    const body = buildUpcomingDatesSms({
      clientFirstName: "  ", petNames: ["Gizmo"], dates: ["Fri 12 Feb"],
    });
    expect(body.startsWith("Hi there!")).toBe(true);
  });

  it("says so plainly when nothing is booked", () => {
    // A client asking "when am I next in?" with nothing booked is normal.
    // A body that says so is more use to the person sending than an error.
    const body = buildUpcomingDatesSms({
      clientFirstName: "Bronwyn", petNames: ["Gizmo"], dates: [],
    });
    expect(body).toContain("no grooming appointments");
    expect(body).toContain("Call us");
  });
});

describe("how many dates one text carries", () => {
  it("names up to fourteen and counts the rest", () => {
    const many = Array.from({ length: 20 }, (_, i) => `Fri ${i + 1} Jan`);
    const { shown, omitted } = upcomingDatesShown(many);
    expect(shown).toHaveLength(MAX_DATES_IN_SMS);
    expect(omitted).toBe(20 - MAX_DATES_IN_SMS);
    const body = buildUpcomingDatesSms({
      clientFirstName: "Bronwyn", petNames: ["Gizmo"], dates: many,
    });
    expect(body).toContain(`Plus ${20 - MAX_DATES_IN_SMS} more`);
  });

  it("does not mention extras when there are none", () => {
    const body = buildUpcomingDatesSms({
      clientFirstName: "Bronwyn", petNames: ["Gizmo"], dates: BRONWYN_DATES,
    });
    expect(body).not.toContain("more after that");
  });

  it("drops blanks rather than texting a double comma", () => {
    const { shown, omitted } = upcomingDatesShown(["Fri 12 Feb", "  ", "", "Fri 12 Mar"]);
    expect(shown).toEqual(["Fri 12 Feb", "Fri 12 Mar"]);
    expect(omitted).toBe(0);
  });
});

describe("it must stay in GSM-7, because this is the longest text sent", () => {
  /*
   * One emoji takes the segment size from 153 characters to 67. Thirteen
   * dates is about 160 characters of dates alone, so the paw that every
   * other template ends in would take this message from two segments to
   * four — on every client who gets a year of bookings.
   *
   * These two tests are the only thing stopping a typographic tidy-up —
   * an em-dash, a curly apostrophe, a friendly smiley — from quietly
   * doubling the bill. A previous version of the 4-day reminder shipped
   * with exactly that and nobody noticed until the cost was counted.
   */
  it("uses no character that forces UCS-2", () => {
    for (const dates of [BRONWYN_DATES, ["Fri 12 Feb"], []]) {
      const body = buildUpcomingDatesSms({
        clientFirstName: "Bronwyn", petNames: ["Gizmo"], dates,
      });
      expect(upcomingDatesSmsIsGsm7(body), body).toBe(true);
      expect(calculateSmsCost(body).encoding, body).toBe("GSM-7");
    }
  });

  it("costs two segments for a full year, not four", () => {
    const body = buildUpcomingDatesSms({
      clientFirstName: "Bronwyn", petNames: ["Gizmo"], dates: BRONWYN_DATES,
    });
    expect(calculateSmsCost(body).segments).toBeLessThanOrEqual(2);
  });

  it("notices a character that would force UCS-2", () => {
    // Proves the guard above can fail, rather than passing vacuously.
    expect(upcomingDatesSmsIsGsm7("Hi Bronwyn \u{1F43E}")).toBe(false);
    expect(upcomingDatesSmsIsGsm7("Fri 12 Feb — Fri 12 Mar")).toBe(false);
    expect(upcomingDatesSmsIsGsm7("Gizmo’s appointments")).toBe(false);
  });
});
