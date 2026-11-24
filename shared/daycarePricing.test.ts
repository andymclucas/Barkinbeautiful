import { describe, expect, it } from "vitest";
import { daycareHourlyPrice, describeHours, isHourlyDaycareName, withHourlyDaycarePrices } from "./daycarePricing";
import type { PriceOption } from "./groomPricing";

const option = (over: Partial<PriceOption>): PriceOption => ({
  id: 1, name: "Daycare per hour", tier: null, priceAud: "10.00", priceMode: "fixed",
  requiresManualPrice: false, bandSpecific: false, ...over,
});

describe("daycare by the hour", () => {
  it("charges Lauren's example: 1.5 hours at $10 is $15", () => {
    expect(daycareHourlyPrice("10.00", 90)).toBe("15.00");
  });

  it("keeps part hours exact", () => {
    expect(daycareHourlyPrice(10, 45)).toBe("7.50");
    expect(daycareHourlyPrice("12", 100)).toBe("20.00");
  });

  it("gives no figure for a booking with no length or a bad rate", () => {
    expect(daycareHourlyPrice(10, 0)).toBeNull();
    expect(daycareHourlyPrice("abc", 60)).toBeNull();
  });

  it("recognises an hourly rate by its name", () => {
    expect(isHourlyDaycareName("Daycare per hour")).toBe(true);
    expect(isHourlyDaycareName("Daycare - Hourly")).toBe(true);
    expect(isHourlyDaycareName("Daycare ($/hr)")).toBe(true);
    expect(isHourlyDaycareName("Daycare (per session)")).toBe(false);
  });

  it("describes the length plainly", () => {
    expect(describeHours(60)).toBe("1 hour");
    expect(describeHours(90)).toBe("1.5 hours");
    expect(describeHours(135)).toBe("2 hours 15 min");
  });

  it("prices the hourly row for this booking's length", () => {
    const [priced] = withHourlyDaycarePrices([option({})], "daycare", 90);
    expect(priced.priceAud).toBe("15.00");
    expect(priced.name).toBe("Daycare per hour ($10.00 × 1.5 hours)");
  });

  it("leaves other services and non-hourly rows alone", () => {
    const groom = option({ name: "Classic Cut - Small", priceAud: "85.00" });
    expect(withHourlyDaycarePrices([groom], "classic_groom", 90)).toEqual([groom]);
    const session = option({ name: "Daycare half day", priceAud: "30.00" });
    expect(withHourlyDaycarePrices([session], "daycare", 90)).toEqual([session]);
  });
});
