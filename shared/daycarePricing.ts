/**
 * Daycare charged by the hour.
 *
 * Andy, 24/11/2026: "We need an option to just do daycare as well. Whether
 * we can set an hourly rate or whether it's a choice of half or full day
 * rate." He chose the hourly rate. Lauren's example the same morning: two
 * dogs in for an hour and a half at $15 each.
 *
 * The rate lives in Pricing & Services like every other price (Andy's
 * standing rule: only use pricing from that section). A SERVICE whose
 * legacy service key is `daycare` and whose name says it is per hour is
 * the rate; the booking's own length decides the figure.
 */
import type { PriceOption } from "./groomPricing";

/** "Daycare per hour", "Daycare - hourly", "Daycare ($/hr)" all count. */
export function isHourlyDaycareName(name: string): boolean {
  return /per\s*hour|hourly|\/\s*h(ou)?r\b/i.test(name);
}

/**
 * Rate times hours, in dollars to the cent. Minutes are kept exact rather
 * than rounded up to the hour: 90 minutes at $10 is $15, which is what the
 * salon already charges.
 */
export function daycareHourlyPrice(ratePerHour: string | number, durationMinutes: number): string | null {
  const rate = Number(ratePerHour);
  if (!Number.isFinite(rate) || rate < 0) return null;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return null;
  return (Math.round(rate * (durationMinutes / 60) * 100) / 100).toFixed(2);
}

/** "1.5 hours", "1 hour", "2 hours 15 min" for the price list label. */
export function describeHours(durationMinutes: number): string {
  const h = Math.floor(durationMinutes / 60);
  const m = Math.round(durationMinutes % 60);
  if (m === 0) return `${h} hour${h === 1 ? "" : "s"}`;
  if (m === 30) return `${h}.5 hours`;
  return h > 0 ? `${h} hour${h === 1 ? "" : "s"} ${m} min` : `${m} min`;
}

/**
 * The price options for a daycare booking, with every hourly rate turned
 * into the figure for THIS booking's length. Other services, and daycare
 * rows that are not hourly, pass through untouched.
 */
export function withHourlyDaycarePrices(
  options: readonly PriceOption[],
  serviceType: string,
  durationMinutes: number | null | undefined,
): PriceOption[] {
  if (serviceType !== "daycare") return [...options];
  return options.map((option) => {
    if (!isHourlyDaycareName(option.name) || option.requiresManualPrice || option.priceAud === null) return option;
    const price = durationMinutes ? daycareHourlyPrice(option.priceAud, durationMinutes) : null;
    if (!price) return option;
    return {
      ...option,
      name: `${option.name} ($${Number(option.priceAud).toFixed(2)} × ${describeHours(durationMinutes!)})`,
      priceAud: price,
    };
  });
}
