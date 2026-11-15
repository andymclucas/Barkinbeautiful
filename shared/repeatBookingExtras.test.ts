import { describe, expect, it } from "vitest";
import {
  describeSeriesAdd,
  extrasCarriedToRepeat,
  seriesBookingsNeedingExtra,
  type ExtraLine,
} from "./repeatBookingExtras";

const line = (over: Partial<ExtraLine> = {}): ExtraLine => ({
  pricingServiceId: 7,
  retailProductId: null,
  name: "Teeth Brushing",
  unitPrice: "35.00",
  quantity: 1,
  staffId: null,
  discountPercent: null,
  discountAmount: "35.00",
  discountReason: "Fortnightly discount",
  ...over,
});

describe("extrasCarriedToRepeat", () => {
  it("carries a service with its price and its discount", () => {
    expect(extrasCarriedToRepeat([line()])).toEqual([line()]);
  });

  it("does not carry a product sold on the day", () => {
    const treats = line({ pricingServiceId: null, retailProductId: 3, name: "Treats" });
    expect(extrasCarriedToRepeat([treats, line()]).map((l) => l.name)).toEqual(["Teeth Brushing"]);
  });

  it("drops anything that is not one of the carried fields, such as done-ness", () => {
    const done = { ...line(), completedAt: new Date(), completedByStaffId: 4, id: 99 };
    const [copy] = extrasCarriedToRepeat([done]);
    expect(copy).not.toHaveProperty("completedAt");
    expect(copy).not.toHaveProperty("completedByStaffId");
    expect(copy).not.toHaveProperty("id");
  });
});

describe("seriesBookingsNeedingExtra", () => {
  const at = (iso: string) => new Date(iso);
  const source = { id: 1, petId: 10, scheduledStart: at("2026-11-23T23:30:00Z") };
  const booking = (id: number, iso: string, over: Partial<{ petId: number; workflowState: string }> = {}) => ({
    id,
    petId: 10,
    workflowState: "scheduled",
    scheduledStart: at(iso),
    ...over,
  });

  it("picks later scheduled bookings for the same dog", () => {
    const series = [booking(1, "2026-11-23T23:30:00Z"), booking(2, "2026-12-07T23:30:00Z"), booking(3, "2026-12-21T23:30:00Z")];
    const got = seriesBookingsNeedingExtra({ source, series, alreadyHaveIt: new Set() });
    expect(got.map((b) => b.id)).toEqual([2, 3]);
  });

  it("leaves earlier bookings, other dogs and anything past scheduled alone", () => {
    const series = [
      booking(4, "2026-11-09T23:30:00Z"),
      booking(5, "2026-12-07T23:30:00Z", { petId: 11 }),
      booking(6, "2026-12-07T23:30:00Z", { workflowState: "cancelled" }),
      booking(7, "2026-12-07T23:30:00Z", { workflowState: "complete" }),
    ];
    expect(seriesBookingsNeedingExtra({ source, series, alreadyHaveIt: new Set() })).toEqual([]);
  });

  it("skips a booking that already has the extra, so pressing twice adds nothing", () => {
    const series = [booking(2, "2026-12-07T23:30:00Z"), booking(3, "2026-12-21T23:30:00Z")];
    const got = seriesBookingsNeedingExtra({ source, series, alreadyHaveIt: new Set([2, 3]) });
    expect(got).toEqual([]);
  });
});

describe("describeSeriesAdd", () => {
  it("handles none, one and many", () => {
    expect(describeSeriesAdd("Teeth Brushing", 0)).toBe("Teeth Brushing is already on every later booking in this series");
    expect(describeSeriesAdd("Teeth Brushing", 1)).toBe("Teeth Brushing added to 1 later booking");
    expect(describeSeriesAdd("Teeth Brushing", 12)).toBe("Teeth Brushing added to 12 later bookings");
  });
});
