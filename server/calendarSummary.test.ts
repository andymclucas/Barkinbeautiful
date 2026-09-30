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
    expect(summariseCalendar([])).toEqual({
      totalAppointments: 0, totalPets: 0, earnedRevenue: 0, expectedRevenue: 0,
    });
  });

  it("copes with a pet id that is missing", () => {
    const s = summariseCalendar([appt({ petId: null }), appt({ petId: 4 })]);
    expect(s.totalAppointments).toBe(2);
    expect(s.totalPets).toBe(1);
  });
});
