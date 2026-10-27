import { describe, it, expect } from "vitest";
import {
  groomsFreeDuringPause, groomsToRecover, totalPrice, describeFreeGrooms,
  type DriftAppointment,
} from "../shared/membershipCoverageDrift";

const at = (iso: string) => new Date(iso);
const NOW = at("2026-10-27T00:00:00Z");
const MEMBERSHIP = 500;

const appt = (over: Partial<DriftAppointment> & { id: number; scheduledStart: Date }): DriftAppointment => ({
  petId: 1, petName: "Harvey", price: null, membershipId: null,
  workflowState: "scheduled", status: "confirmed", ...over,
});

describe("groomsFreeDuringPause", () => {
  /**
   * The gap worth money. These grooms were covered when they were
   * booked and stay covered, so the salon does the work while the fee
   * is skipped.
   */
  it("finds covered grooms inside the pause window", () => {
    const found = groomsFreeDuringPause([
      appt({ id: 1, membershipId: MEMBERSHIP, price: "0.00", scheduledStart: at("2026-11-03T00:00:00Z") }),
      appt({ id: 2, membershipId: MEMBERSHIP, price: "0.00", scheduledStart: at("2026-11-17T00:00:00Z") }),
    ], { membershipId: MEMBERSHIP, from: NOW, until: at("2026-12-01T00:00:00Z") });
    expect(found.map((g) => g.id)).toEqual([1, 2]);
  });

  it("ignores grooms after the pause ends", () => {
    const found = groomsFreeDuringPause([
      appt({ id: 1, membershipId: MEMBERSHIP, scheduledStart: at("2026-12-15T00:00:00Z") }),
    ], { membershipId: MEMBERSHIP, from: NOW, until: at("2026-12-01T00:00:00Z") });
    expect(found).toEqual([]);
  });

  it("ignores grooms in the past", () => {
    const found = groomsFreeDuringPause([
      appt({ id: 1, membershipId: MEMBERSHIP, scheduledStart: at("2026-10-01T00:00:00Z") }),
    ], { membershipId: MEMBERSHIP, from: NOW, until: at("2026-12-01T00:00:00Z") });
    expect(found).toEqual([]);
  });

  it("ignores a cancelled groom — nobody is doing that work", () => {
    const found = groomsFreeDuringPause([
      appt({ id: 1, membershipId: MEMBERSHIP, workflowState: "cancelled", scheduledStart: at("2026-11-03T00:00:00Z") }),
      appt({ id: 2, membershipId: MEMBERSHIP, status: "no_show", scheduledStart: at("2026-11-04T00:00:00Z") }),
    ], { membershipId: MEMBERSHIP, from: NOW, until: at("2026-12-01T00:00:00Z") });
    expect(found).toEqual([]);
  });

  /** A household's other dog, on its own membership, is not this pause. */
  it("ignores another membership's grooms", () => {
    const found = groomsFreeDuringPause([
      appt({ id: 1, membershipId: 999, scheduledStart: at("2026-11-03T00:00:00Z") }),
    ], { membershipId: MEMBERSHIP, from: NOW, until: at("2026-12-01T00:00:00Z") });
    expect(found).toEqual([]);
  });

  it("returns them oldest first, which is the order staff ring about", () => {
    const found = groomsFreeDuringPause([
      appt({ id: 2, membershipId: MEMBERSHIP, scheduledStart: at("2026-11-17T00:00:00Z") }),
      appt({ id: 1, membershipId: MEMBERSHIP, scheduledStart: at("2026-11-03T00:00:00Z") }),
    ], { membershipId: MEMBERSHIP, from: NOW, until: at("2026-12-01T00:00:00Z") });
    expect(found.map((g) => g.id)).toEqual([1, 2]);
  });
});

describe("groomsToRecover", () => {
  /**
   * The gap pointing the other way: booked at Casual while paused, and
   * the membership restarts before the appointment, so the client pays
   * twice for one groom.
   */
  it("finds Casual-priced grooms the restarted membership would cover", () => {
    const found = groomsToRecover([
      appt({ id: 1, petId: 7, price: "95.00", scheduledStart: at("2026-12-05T00:00:00Z") }),
    ], { petIds: [7], from: at("2026-12-01T00:00:00Z") });
    expect(found.map((g) => g.id)).toEqual([1]);
  });

  it("ignores a groom that is already covered", () => {
    const found = groomsToRecover([
      appt({ id: 1, petId: 7, membershipId: MEMBERSHIP, price: "0.00", scheduledStart: at("2026-12-05T00:00:00Z") }),
    ], { petIds: [7], from: at("2026-12-01T00:00:00Z") });
    expect(found).toEqual([]);
  });

  it("ignores a groom with no price — there is nothing to refund", () => {
    const found = groomsToRecover([
      appt({ id: 1, petId: 7, price: null, scheduledStart: at("2026-12-05T00:00:00Z") }),
      appt({ id: 2, petId: 7, price: "0.00", scheduledStart: at("2026-12-06T00:00:00Z") }),
    ], { petIds: [7], from: at("2026-12-01T00:00:00Z") });
    expect(found).toEqual([]);
  });

  /**
   * Keyed on the membership's pet, not the household: a second dog with
   * no membership is correctly being charged and must not be flagged.
   */
  it("ignores a dog that is not on the membership", () => {
    const found = groomsToRecover([
      appt({ id: 1, petId: 8, price: "95.00", scheduledStart: at("2026-12-05T00:00:00Z") }),
    ], { petIds: [7], from: at("2026-12-01T00:00:00Z") });
    expect(found).toEqual([]);
  });

  it("ignores anything before the restart", () => {
    const found = groomsToRecover([
      appt({ id: 1, petId: 7, price: "95.00", scheduledStart: at("2026-11-20T00:00:00Z") }),
    ], { petIds: [7], from: at("2026-12-01T00:00:00Z") });
    expect(found).toEqual([]);
  });
});

describe("totalPrice", () => {
  it("adds up in cents, so the total is not 99.99999999", () => {
    expect(totalPrice([
      appt({ id: 1, price: "35.10", scheduledStart: NOW }),
      appt({ id: 2, price: "64.90", scheduledStart: NOW }),
    ])).toBe("100.00");
  });

  it("is zero for nothing", () => {
    expect(totalPrice([])).toBe("0.00");
  });
});

describe("describeFreeGrooms", () => {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  it("says nothing when there is nothing to say", () => {
    expect(describeFreeGrooms([], fmt)).toBeNull();
  });

  it("names the dog and the date for one groom", () => {
    const text = describeFreeGrooms(
      [appt({ id: 1, petName: "Harvey", scheduledStart: at("2026-11-03T00:00:00Z") })], fmt)!;
    expect(text).toContain("Harvey");
    expect(text).toContain("2026-11-03");
    expect(text).toContain("stays free");
  });

  it("counts them when there are several", () => {
    const text = describeFreeGrooms([
      appt({ id: 1, petName: "Harvey", scheduledStart: at("2026-11-03T00:00:00Z") }),
      appt({ id: 2, petName: "Harvey", scheduledStart: at("2026-11-17T00:00:00Z") }),
    ], fmt)!;
    expect(text).toContain("2 grooms");
  });
});
