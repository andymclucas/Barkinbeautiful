import { describe, expect, it } from "vitest";
import {
  describeFutureBookingOutcome,
  hasRealPrice,
  keptBookingPrice,
  resolveKeptPrices,
  type KeptBooking,
} from "./membershipCancelBookings";

const choices = [
  { tier: "new" as const, label: "New client", price: "180.00", from: "Full Groom (Styled) - New Client - Small" },
  { tier: "regular" as const, label: "Regular client", price: "163.00", from: "Full Groom (Styled) - Regular Client - Small" },
  { tier: "vip" as const, label: "VIP client", price: "145.00", from: "Full Groom (Styled) - VIP Client - Small" },
];
const free = (id: number): KeptBooking => ({ id, currentPrice: "0.00", choices });
const priced = (id: number, price = "110.00"): KeptBooking => ({ id, currentPrice: price, choices });

describe("hasRealPrice", () => {
  it("treats blank and nil as no price, and anything else as real", () => {
    for (const none of [null, undefined, "", "  ", "0", "0.00", 0]) expect(hasRealPrice(none)).toBe(false);
    for (const real of ["110.00", 145, "0.50"]) expect(hasRealPrice(real)).toBe(true);
  });
});

describe("resolveKeptPrices", () => {
  it("will not go ahead until every free booking has an answer", () => {
    const result = resolveKeptPrices([free(1), free(2)], { 1: { kind: "tier", tier: "regular" } });
    expect(result).toEqual({ ok: false, errors: { 2: "Choose a price for this booking." } });
  });

  it("takes the rate picked for each booking, never one it chose itself", () => {
    const result = resolveKeptPrices([free(1), free(2)], { 1: { kind: "tier", tier: "new" }, 2: { kind: "tier", tier: "vip" } });
    expect(result).toEqual({
      ok: true,
      prices: [{ appointmentId: 1, price: "180.00" }, { appointmentId: 2, price: "145.00" }],
      leftBlank: 0,
      keptAsPriced: 0,
    });
  });

  it("takes a price staff typed themselves", () => {
    const result = resolveKeptPrices([free(1)], { 1: { kind: "custom", amount: "110" } });
    expect(result).toEqual({ ok: true, prices: [{ appointmentId: 1, price: "110.00" }], leftBlank: 0, keptAsPriced: 0 });
  });

  it("leaves a booking that already has a real price alone unless told otherwise", () => {
    expect(resolveKeptPrices([priced(1)], {})).toEqual({ ok: true, prices: [], leftBlank: 0, keptAsPriced: 1 });
    expect(resolveKeptPrices([priced(1)], { 1: { kind: "tier", tier: "regular" } }))
      .toEqual({ ok: true, prices: [{ appointmentId: 1, price: "163.00" }], leftBlank: 0, keptAsPriced: 0 });
  });

  it("lets a free booking be left with no price yet, when staff say so", () => {
    expect(resolveKeptPrices([free(1)], { 1: { kind: "leave" } })).toEqual({ ok: true, prices: [], leftBlank: 1, keptAsPriced: 0 });
  });

  it("never keeps a booking at nil, whichever way $0 is typed", () => {
    for (const amount of ["0", "0.00"]) {
      expect(resolveKeptPrices([free(1)], { 1: { kind: "custom", amount } }))
        .toEqual({ ok: false, errors: { 1: 'Type a price above $0, or choose "No price yet".' } });
      expect(resolveKeptPrices([{ id: 1, currentPrice: null, choices }], { 1: { kind: "custom", amount } }).ok).toBe(false);
      expect(resolveKeptPrices([priced(1)], { 1: { kind: "custom", amount } }).ok).toBe(false);
    }
  });

  it("leaves a booking whose bill was set by hand out of it", () => {
    expect(resolveKeptPrices([{ ...free(1), hasBillingOverride: true }], {})).toEqual({ ok: true, prices: [], leftBlank: 1, keptAsPriced: 0 });
  });

  it("refuses a custom price that is not a price", () => {
    const result = resolveKeptPrices([free(1)], { 1: { kind: "custom", amount: "abc" } });
    expect(result.ok).toBe(false);
  });
});

describe("keptBookingPrice", () => {
  it("uses the price staff chose", () => {
    expect(keptBookingPrice("0.00", "163.00")).toEqual({ change: true, price: "163.00" });
    expect(keptBookingPrice("110.00", "145.00")).toEqual({ change: true, price: "145.00" });
  });

  it("with no choice, keeps a real price and blanks a nil one", () => {
    expect(keptBookingPrice("110.00", undefined)).toEqual({ change: false });
    expect(keptBookingPrice("0.00", undefined)).toEqual({ change: true, price: null });
    expect(keptBookingPrice(null, null)).toEqual({ change: true, price: null });
  });
});

describe("describeFutureBookingOutcome", () => {
  it("says what was removed", () => {
    expect(describeFutureBookingOutcome({ choice: "remove", removed: 1, repriced: 0, needPrice: 0 })).toBe("1 future booking removed.");
    expect(describeFutureBookingOutcome({ choice: "remove", removed: 6, repriced: 0, needPrice: 0 })).toBe("6 future bookings removed.");
  });

  it("says what was kept, and what still needs a price", () => {
    expect(describeFutureBookingOutcome({ choice: "keep", removed: 0, repriced: 6, needPrice: 0 })).toBe("6 future bookings kept: 6 at the price you chose.");
    expect(describeFutureBookingOutcome({ choice: "keep", removed: 0, repriced: 3, needPrice: 1, keptAsPriced: 2 }))
      .toBe("6 future bookings kept: 3 at the price you chose, 2 left at the price already on them, 1 still needs a price.");
  });

  it("says nothing about bookings when there were none", () => {
    expect(describeFutureBookingOutcome({ choice: null, removed: 0, repriced: 0, needPrice: 0 })).toBe("");
  });
});
