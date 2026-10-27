import { describe, it, expect } from "vitest";
import { summariseCalendar, isDeadAppointment } from "../shared/calendarSummary";

const appt = (o: Partial<Parameters<typeof summariseCalendar>[0][number]> = {}) => ({
  petId: 1, price: "100.00", workflowState: "scheduled", status: "confirmed", ...o,
});

describe("summariseCalendar", () => {
  it("counts appointments and pets separately", () => {
    // Two dogs on one booking are two rows: the salon plans the day in dogs.
    const s = summariseCalendar([appt({ petId: 1 }), appt({ petId: 2 }), appt({ petId: 3 })]);
    expect(s.totalAppointments).toBe(3);
    expect(s.totalPets).toBe(3);
  });

  it("does not double-count a pet booked twice in the period", () => {
    const s = summariseCalendar([appt({ petId: 7 }), appt({ petId: 7 })]);
    expect(s.totalAppointments).toBe(2);
    expect(s.totalPets).toBe(1);
  });

  it("separates money taken from money booked", () => {
    const s = summariseCalendar([
      appt({ price: "145.00", workflowState: "complete" }),
      appt({ price: "110.00", workflowState: "grooming" }),
      appt({ price: "95.00", workflowState: "scheduled" }),
    ]);
    expect(s.earnedRevenue).toBe(145);   // only the finished dog
    expect(s.expectedRevenue).toBe(350); // everything still live
  });

  it("excludes cancellations and no-shows from every figure", () => {
    const s = summariseCalendar([
      appt({ petId: 1, price: "100.00" }),
      appt({ petId: 2, price: "200.00", workflowState: "cancelled" }),
      appt({ petId: 3, price: "300.00", status: "no_show" }),
    ]);
    expect(s.totalAppointments).toBe(1);
    expect(s.totalPets).toBe(1);
    expect(s.expectedRevenue).toBe(100);
    // Counted separately so the sidebar reconciles with the toolbar, which
    // counts every row on the day.
    expect(s.cancelledCount).toBe(2);
  });

  it("treats a cancellation recorded on either column as cancelled", () => {
    expect(isDeadAppointment({ workflowState: "cancelled", status: "confirmed" })).toBe(true);
    expect(isDeadAppointment({ workflowState: "scheduled", status: "cancelled" })).toBe(true);
    expect(isDeadAppointment({ workflowState: "grooming", status: "confirmed" })).toBe(false);
  });

  it("treats a missing or unparseable price as zero, not NaN", () => {
    const s = summariseCalendar([
      appt({ price: null }), appt({ price: undefined }), appt({ price: "" }), appt({ price: "n/a" }),
    ]);
    expect(s.expectedRevenue).toBe(0);
    expect(Number.isNaN(s.expectedRevenue)).toBe(false);
  });

  it("accepts numbers as well as the decimal strings MySQL returns", () => {
    expect(summariseCalendar([appt({ price: 45.5 }), appt({ price: "45.50" })]).expectedRevenue).toBe(91);
  });

  it("rounds to cents rather than leaving floating point noise", () => {
    const s = summariseCalendar([appt({ price: "0.10" }), appt({ price: "0.20" })]);
    expect(s.expectedRevenue).toBe(0.3);
  });

  it("returns zeroes for an empty day rather than throwing", () => {
    // Pins the whole shape deliberately, so a field added to the panel
    // cannot quietly arrive undefined on a day with nothing in it.
    expect(summariseCalendar([])).toEqual({
      totalAppointments: 0, totalPets: 0, earnedRevenue: 0, expectedRevenue: 0,
      takenRevenue: 0, outstandingRevenue: 0,
      membershipPetCount: 0, payingPetCount: 0, cancelledCount: 0,
    });
  });

  it("copes with a pet id that is missing", () => {
    const s = summariseCalendar([appt({ petId: null }), appt({ petId: 4 })]);
    expect(s.totalAppointments).toBe(2);
    expect(s.totalPets).toBe(1);
  });
});

describe("the revenue split", () => {
  /**
   * The reason this exists. On 27/10/2026 the sidebar read $1,508
   * "Earned rev" for a day on which $350 had actually been collected,
   * because earned counts the PRICE of completed work and says nothing
   * about whether anyone paid.
   */
  it("separates money taken from the price of completed work", () => {
    const summary = summariseCalendar([
      { petId: 1, price: "120.00", paidAmount: "120.00", workflowState: "complete" },
      { petId: 2, price: "90.00", paidAmount: "0", workflowState: "complete" },
      { petId: 3, price: "80.00", paidAmount: "0", workflowState: "grooming" },
    ]);
    expect(summary.earnedRevenue).toBe(210);   // both completed grooms
    expect(summary.takenRevenue).toBe(120);    // only one was settled
    expect(summary.outstandingRevenue).toBe(170); // 90 + 80 still owed
    expect(summary.expectedRevenue).toBe(290);
  });

  /**
   * Andy's case: a day that is full of dogs and quiet on the till,
   * because most of them are covered and already paid for weekly.
   */
  it("counts covered dogs apart from paying ones", () => {
    const covered = Array.from({ length: 25 }, (_, i) => ({
      petId: i + 1, membershipId: 500 + i, price: null, workflowState: "complete",
    }));
    const paying = Array.from({ length: 10 }, (_, i) => ({
      petId: 100 + i, price: "85.00", paidAmount: "85.00", workflowState: "complete",
    }));
    const summary = summariseCalendar([...covered, ...paying]);

    expect(summary.totalPets).toBe(35);
    expect(summary.membershipPetCount).toBe(25);
    expect(summary.payingPetCount).toBe(10);
    // The covered grooms carry no price, so they move no money here.
    expect(summary.takenRevenue).toBe(850);
    expect(summary.expectedRevenue).toBe(850);
    expect(summary.outstandingRevenue).toBe(0);
  });

  /**
   * Netting in aggregate would show this day as square while the second
   * client still owes for their groom.
   */
  it("does not let an overpayment mask another client's debt", () => {
    const summary = summariseCalendar([
      { petId: 1, price: "100.00", paidAmount: "150.00", workflowState: "complete" },
      { petId: 2, price: "100.00", paidAmount: "0", workflowState: "complete" },
    ]);
    expect(summary.outstandingRevenue).toBe(100);
    expect(summary.takenRevenue).toBe(150);
  });

  it("ignores cancelled dogs in every figure", () => {
    const summary = summariseCalendar([
      { petId: 1, price: "100.00", paidAmount: "100.00", workflowState: "complete" },
      { petId: 2, price: "100.00", paidAmount: "0", workflowState: "cancelled" },
      { petId: 3, membershipId: 7, price: null, workflowState: "no_show" },
    ]);
    expect(summary.takenRevenue).toBe(100);
    expect(summary.outstandingRevenue).toBe(0);
    expect(summary.membershipPetCount).toBe(0);
    expect(summary.payingPetCount).toBe(1);
    expect(summary.cancelledCount).toBe(2);
  });

  it("counts a dog booked twice in a day once", () => {
    const summary = summariseCalendar([
      { petId: 9, membershipId: 3, price: null, workflowState: "complete" },
      { petId: 9, membershipId: 3, price: null, workflowState: "scheduled" },
    ]);
    expect(summary.membershipPetCount).toBe(1);
    expect(summary.totalPets).toBe(1);
  });

  it("survives missing and unreadable amounts", () => {
    const summary = summariseCalendar([
      { petId: 1, price: null, paidAmount: null, workflowState: "complete" },
      { petId: 2, price: "oops", paidAmount: undefined, workflowState: "complete" },
    ]);
    expect(summary.takenRevenue).toBe(0);
    expect(summary.outstandingRevenue).toBe(0);
    expect(summary.earnedRevenue).toBe(0);
  });
});
