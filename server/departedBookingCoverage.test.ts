import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Every path that creates an appointment must refuse a departed dog.
 *
 * The rule itself lives in shared/petBookable.ts and has its own tests.
 * This proves DELEGATION: that each file which can write an appointment
 * actually asks it. It counts, so it fails when a new booking path is
 * added without the guard rather than silently covering less.
 *
 * It was added because the guard was only ever wired into the four
 * staff booking paths. Online booking — a PUBLIC procedure — membership
 * sign-up and the waitlist could all book a dog recorded as passed
 * away, which on 29/10/2026 meant a family could book the dog they had
 * just lost from the client portal with nothing in the way.
 */
const FILES = [
  "server/routers.ts",
  "server/routers/membershipSignup.ts",
  "server/routers/waitlist.ts",
] as const;

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe("every appointment-creating path refuses a departed dog", () => {
  it("knows about every file that can write an appointment", () => {
    // If a NEW file starts inserting appointments, add it above and give
    // it a guard — do not just raise a number.
    const found = FILES.filter((f) => count(read(f), /insert\(appointments\)/g) > 0);
    expect(found).toEqual([...FILES]);
  });

  it("pins how many appointment inserts exist in each file", () => {
    expect(count(read("server/routers.ts"), /insert\(appointments\)/g)).toBe(8);
    expect(count(read("server/routers/membershipSignup.ts"), /insert\(appointments\)/g)).toBe(1);
    expect(count(read("server/routers/waitlist.ts"), /insert\(appointments\)/g)).toBe(1);
  });

  it("asks the shared rule in every one of them", () => {
    /* routers.ts has 8 inserts and 7 guards. The one without is the
       undo restore, which puts back appointments that already existed
       rather than booking anything — refusing a departed dog there
       would make a deletion unundoable. */
    expect(count(read("server/routers.ts"), /departedBookingMessage\(/g)).toBe(7);
    expect(count(read("server/routers/membershipSignup.ts"), /departedBookingMessage\(/g)).toBe(1);
    expect(count(read("server/routers/waitlist.ts"), /departedBookingMessage\(/g)).toBe(1);
  });

  it("guards the public online-booking path, not just the staff ones", () => {
    const src = read("server/routers.ts");
    // The three online paths each select pets.status so the rule has
    // something to read; before 29/10/2026 they selected only weight.
    expect(count(src, /status: pets\.status/g)).toBeGreaterThanOrEqual(3);
  });
});
