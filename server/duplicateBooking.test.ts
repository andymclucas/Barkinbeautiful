import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  dogsAlreadyBookedThatDay,
  duplicateBookingMessage,
  type SameDayBooking,
} from "@shared/duplicateBooking";
import { brisbaneDayBounds, brisbaneDayBoundsForKey } from "@shared/localDateTime";

const booking = (petId: number, petName: string, state = "scheduled"): SameDayBooking => ({
  petId,
  petName,
  workflowState: state,
  status: state === "cancelled" ? "cancelled" : "confirmed",
});

/**
 * Tanya Leek, 14/01/2027. Bonnie and Chester booked at 12:30 on 6
 * November and again at 11:30 on the 8th, by somebody who meant to move
 * the first booking. Both confirmations went out and she said yes to
 * both, so two groomers each held a dog promised elsewhere.
 */
describe("one booking per dog per day", () => {
  const bonnie = booking(1, "Bonnie");
  const chester = booking(2, "Chester");

  it("catches the dog that is already in that day", () => {
    expect(dogsAlreadyBookedThatDay([1, 2], [chester])).toEqual([
      { petId: 2, petName: "Chester" },
    ]);
  });

  it("catches both dogs of a family booked twice", () => {
    expect(dogsAlreadyBookedThatDay([1, 2], [bonnie, chester]).map((c) => c.petName))
      .toEqual(["Bonnie", "Chester"]);
  });

  it("names a dog once however many bookings it has", () => {
    expect(dogsAlreadyBookedThatDay([2], [chester, booking(2, "Chester")])).toHaveLength(1);
  });

  it("ignores dogs that are not being booked", () => {
    expect(dogsAlreadyBookedThatDay([1], [chester])).toEqual([]);
  });

  it("does not count a cancelled booking", () => {
    /*
     * rebook's own copy of this guard counted every row "whatever state
     * it is in", so a client who cancelled in the morning was told to
     * "pick another date" for an afternoon whose diary was empty. A dog
     * that is not coming is not booked — the same isDeadAppointment rule
     * the calendar draws by.
     */
    expect(dogsAlreadyBookedThatDay([2], [booking(2, "Chester", "cancelled")])).toEqual([]);
  });

  it("does not count a no-show", () => {
    expect(dogsAlreadyBookedThatDay([2], [
      { petId: 2, petName: "Chester", workflowState: "no_show", status: "no_show" },
    ])).toEqual([]);
  });

  it("still catches a dog mid-groom, which is as booked as it gets", () => {
    expect(dogsAlreadyBookedThatDay([2], [booking(2, "Chester", "bathing")])).toHaveLength(1);
  });
});

describe("what the person booking is told", () => {
  it("names the dog, so nobody has to check four diaries by hand", () => {
    expect(duplicateBookingMessage([{ petId: 2, petName: "Chester" }]))
      .toBe("Chester is already booked in that day — pick another date, or move the booking that exists");
  });

  it("lists a family", () => {
    expect(duplicateBookingMessage([
      { petId: 1, petName: "Bonnie" },
      { petId: 2, petName: "Chester" },
    ])).toBe("Bonnie and Chester are already booked in that day — pick another date, or move the booking that exists");
  });

  it("reads as a list for three", () => {
    expect(duplicateBookingMessage([
      { petId: 1, petName: "Pepsi" },
      { petId: 2, petName: "Ginger" },
      { petId: 3, petName: "Coco" },
    ])).toMatch(/^Pepsi, Ginger and Coco are already booked/);
  });

  it("still says something useful for a dog with no name on file", () => {
    expect(duplicateBookingMessage([{ petId: 2, petName: null }]))
      .toMatch(/^That dog is already booked in that day/);
  });

  it("says nothing when there is no clash", () => {
    expect(duplicateBookingMessage([])).toBe("");
  });
});

/**
 * Both guards that existed hand-rolled their day window as
 *
 *   Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()) - 10 * 3600_000
 *
 * which reads the UTC calendar date and then shifts it. Brisbane is
 * UTC+10, so anything in the local 00:00–10:00 band has a UTC date one
 * day earlier — and the salon opens at 07:30.
 */
describe("the Brisbane day containing an instant", () => {
  const brokenBounds = (at: Date) => {
    const start = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()) - 10 * 3600_000);
    return { start, end: new Date(start.getTime() + 86_400_000) };
  };

  it("covers an 8am booking's own day, which the old formula did not", () => {
    // Minnie Condon's slot: 2026-11-11 08:00 Brisbane is 2026-11-10 22:00 UTC.
    const at = new Date("2026-11-10T22:00:00Z");
    expect(brisbaneDayBounds(at)).toEqual(brisbaneDayBoundsForKey("2026-11-11"));
    expect(brokenBounds(at).start.toISOString()).not.toBe(brisbaneDayBounds(at).start.toISOString());
    // The old window named the 10th for a booking on the 11th.
    expect(brokenBounds(at).start.toISOString()).toBe("2026-11-09T14:00:00.000Z");
  });

  it("agrees with the old formula from 10am Brisbane onwards", () => {
    const at = new Date("2026-11-11T02:00:00Z"); // 12:00 Brisbane
    expect(brokenBounds(at).start.toISOString()).toBe(brisbaneDayBounds(at).start.toISOString());
  });

  it("puts the salon's first and last slot in the same day", () => {
    const open = new Date("2026-11-10T21:30:00Z"); // 07:30 Brisbane 11/11
    const close = new Date("2026-11-11T04:00:00Z"); // 14:00 Brisbane 11/11
    expect(brisbaneDayBounds(open)).toEqual(brisbaneDayBounds(close));
  });

  it("is half-open, so midnight belongs to the day it starts", () => {
    const midnight = new Date("2026-11-10T14:00:00Z"); // 00:00 Brisbane 11/11
    const { start, end } = brisbaneDayBounds(midnight);
    expect(start.toISOString()).toBe("2026-11-10T14:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-11T14:00:00.000Z");
    // The last instant of the day is inside; the next midnight is not.
    expect(brisbaneDayBounds(new Date(end.getTime() - 1)).start).toEqual(start);
    expect(brisbaneDayBounds(end).start).not.toEqual(start);
  });

  it("does not read the machine's own timezone", () => {
    // Pinned because e6a4662 was exactly this bug one layer up.
    const at = new Date("2027-01-14T01:30:00Z"); // Leek's 11:30
    expect(brisbaneDayBounds(at)).toEqual(brisbaneDayBoundsForKey("2027-01-14"));
  });
});

/**
 * Which booking paths carry the guard, counted from the source rather
 * than spot-checked — the same shape as membershipBookingCoverage, and
 * for the same reason: a NEW booking path must declare its decision
 * here rather than quietly joining the two that are exempt.
 */
const EXEMPT: Record<string, string> = {
  // A counter walk-in for a dog that is already in today is usually a
  // mistake and occasionally deliberate — an extra service logged as its
  // own row while the dog is on site. Refusing it would stop the floor
  // mid-morning, which is worse than the duplicate it would prevent.
  // Andy's call to make; left unguarded and recorded here, 09/11/2026.
  createQuickAppointment: "a counter walk-in may legitimately be a second row",
  // Puts back rows that already existed, so of course they clash.
  undoDeleteAppointment: "restores, does not book",
};

function read(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), "utf8");
}

function bookingProceduresIn(source: string): string[] {
  const declaration = /^ {2}([a-zA-Z][a-zA-Z0-9_]*): (?:public|protected|operational|admin)Procedure/gm;
  const declarations: { name: string; at: number }[] = [];
  for (let m = declaration.exec(source); m; m = declaration.exec(source)) {
    declarations.push({ name: m[1], at: m.index });
  }
  const guarded = new Set<string>();
  const all = new Set<string>();
  const insert = /insert\(appointments\)/g;
  for (let m = insert.exec(source); m; m = insert.exec(source)) {
    const owner = declarations.filter((d) => d.at < m!.index).pop();
    if (!owner) continue;
    all.add(owner.name);
    const next = declarations.find((d) => d.at > owner.at);
    const body = source.slice(owner.at, next ? next.at : source.length);
    if (/(?:assert|find)Dogs\w*BookedThatDay\(/.test(body)) guarded.add(owner.name);
  }
  return [...all].map((name) => `${name}:${guarded.has(name) ? "guarded" : "unguarded"}`).sort();
}

describe("every booking path has declared a duplicate-guard decision", () => {
  it("guards every path in routers.ts except the two recorded above", () => {
    const found = bookingProceduresIn(read("server/routers.ts"));
    const unguarded = found.filter((entry) => entry.endsWith(":unguarded")).map((e) => e.split(":")[0]);
    expect(unguarded.sort()).toEqual(Object.keys(EXEMPT).sort());
  });

  it("covers the two routers that book outside the monolith", () => {
    // membershipSignup checks every occurrence of the plan before it
    // writes any of them; waitlist checks the one slot it is filling.
    expect(read("server/routers/membershipSignup.ts")).toContain("findDogsAlreadyBookedThatDay(");
    expect(read("server/routers/waitlist.ts")).toContain("assertDogsNotAlreadyBookedThatDay(");
  });

  it("leaves exactly one place deciding what counts as booked", () => {
    /*
     * The two guards that existed each hand-rolled the day window and
     * the live test, and disagreed on both. Any reappearance of the
     * hand-rolled window is the wrong-day bug coming back.
     */
    const sources = ["server/routers.ts", "server/routers/membershipSignup.ts", "server/routers/waitlist.ts"];
    for (const file of sources) {
      expect(read(file), `${file} must not rebuild the Brisbane day by hand`)
        .not.toMatch(/getUTCDate\(\)\s*\)\s*-\s*10\s*\*\s*3_?600_?000/);
    }
  });
});
