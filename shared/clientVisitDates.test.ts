import { describe, expect, it } from "vitest";
import { clientVisitDates } from "./clientVisitDates";

// Pat Grant's Finn, newest first — the order the client page receives them.
const finn = [
  { id: 4, scheduledStart: "2027-04-27T22:00:00Z", status: "pending", workflowState: "scheduled" },  // Wed 28 Apr 2027 8am
  { id: 3, scheduledStart: "2027-03-02T22:00:00Z", status: "pending", workflowState: "scheduled" },  // Wed 3 Mar 2027
  { id: 2, scheduledStart: "2027-01-05T22:00:00Z", status: "pending", workflowState: "scheduled" },  // Wed 6 Jan 2027
  { id: 1, scheduledStart: "2026-11-10T22:00:00Z", status: "confirmed", workflowState: "complete" }, // Wed 11 Nov 2026 8am
  { id: 0, scheduledStart: "2026-09-16T22:00:00Z", status: "confirmed", workflowState: "complete" }, // Thu 17 Sep 2026
];

describe("last, today and next visit, by Brisbane calendar day", () => {
  it("on the day, today's groom is TODAY and the one before stays LAST — even after it's finished", () => {
    const noon = new Date("2026-11-11T02:00:00Z"); // 12 noon Brisbane, groom finished at 9
    const { last, today, next } = clientVisitDates(finn, noon);
    expect(last?.id).toBe(0);
    expect(today.map((a) => a.id)).toEqual([1]);
    expect(next?.id).toBe(2);
  });

  it("once the day has passed, that groom becomes the last visit", () => {
    const tomorrow = new Date("2026-11-11T22:00:00Z"); // 8am Thu 12 Nov Brisbane
    const { last, today, next } = clientVisitDates(finn, tomorrow);
    expect(last?.id).toBe(1);
    expect(today).toEqual([]);
    expect(next?.id).toBe(2);
  });

  it("goes by the Brisbane date, not UTC: 7:30am Thursday in Brisbane is still Wednesday in UTC", () => {
    const wedNight = new Date("2026-11-11T13:30:00Z"); // 11:30pm Wed 11 Nov Brisbane
    const early = [{ id: 9, scheduledStart: "2026-11-11T21:30:00Z", status: "confirmed", workflowState: "scheduled" }]; // 7:30am Thu
    expect(clientVisitDates(early, wedNight).next?.id).toBe(9);
    expect(clientVisitDates(early, wedNight).today).toEqual([]);
  });

  it("skips cancelled and no-show bookings everywhere", () => {
    const noon = new Date("2026-11-11T02:00:00Z");
    const { last, today, next } = clientVisitDates([
      { id: 7, scheduledStart: "2026-11-20T22:00:00Z", status: "cancelled", workflowState: "cancelled" },
      { id: 8, scheduledStart: "2026-11-10T22:00:00Z", status: "no_show", workflowState: "no_show" },
      ...finn,
    ], noon);
    expect(last?.id).toBe(0);
    expect(today.map((a) => a.id)).toEqual([1]);
    expect(next?.id).toBe(2);
  });

  it("copes with nothing at all", () => {
    expect(clientVisitDates([], new Date())).toEqual({ last: null, today: [], next: null });
  });
});
