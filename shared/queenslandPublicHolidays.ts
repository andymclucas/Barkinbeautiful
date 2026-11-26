/**
 * Queensland's public holidays, worked out from the rules rather than kept
 * as a list, so nobody has to update them each year.
 *
 * Lauren, 27/11/2026: "How to I block out whole days easily- like public
 * holidays (would be cool to have a auto public holiday box to check and it
 * blocks those dates for qld)". Andy: "Yes, build it".
 *
 * Holidays Act 1983 (Qld), as observed:
 *  - New Year's Day and Australia Day: on a weekend, the Monday after.
 *  - Good Friday, Easter Saturday, Easter Sunday, Easter Monday.
 *  - Anzac Day: on a Sunday, the Monday after as well. (Saturday: none.)
 *  - Labour Day: first Monday in May. King's Birthday: first Monday in October.
 *  - Royal Queensland Show (Ekka): Brisbane area only, the Wednesday of the
 *    show. The show opens on the first Friday in August, or the second when
 *    the first falls before 5 August; show day is five days later.
 *  - Christmas and Boxing Day, with the weekend days carried to the Monday
 *    and Tuesday after.
 * Christmas Eve's 6pm-midnight part-holiday is after hours and left out.
 *
 * Dates are YYYY-MM-DD calendar keys, worked in UTC so the server's own zone
 * cannot shift a day.
 */

export type PublicHoliday = { date: string; name: string; brisbaneOnly?: boolean };

function key(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}
function plusDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}
/** 0 Sunday ... 6 Saturday. */
function dow(d: Date): number {
  return d.getUTCDay();
}
function firstWeekday(y: number, m: number, weekday: number): Date {
  const first = utc(y, m, 1);
  return plusDays(first, (weekday - dow(first) + 7) % 7);
}

/** Easter Sunday, Gregorian (the anonymous "Meeus/Jones/Butcher" method). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
}

/** The Wednesday of the Brisbane Royal Queensland Show. */
export function ekkaWednesday(year: number): Date {
  let opens = firstWeekday(year, 8, 5);
  if (opens.getUTCDate() < 5) opens = plusDays(opens, 7);
  return plusDays(opens, 5);
}

/** Every Queensland public holiday in a year, in date order. */
export function queenslandPublicHolidays(year: number): PublicHoliday[] {
  const out: PublicHoliday[] = [];
  const add = (d: Date, name: string, brisbaneOnly = false) => out.push({ date: key(d), name, ...(brisbaneOnly ? { brisbaneOnly } : {}) });
  const mondayAfterWeekend = (d: Date) => (dow(d) === 6 ? plusDays(d, 2) : dow(d) === 0 ? plusDays(d, 1) : null);

  const newYear = utc(year, 1, 1);
  add(newYear, "New Year's Day");
  const newYearSub = mondayAfterWeekend(newYear);
  if (newYearSub) add(newYearSub, "New Year's Day (observed)");

  const australiaDay = utc(year, 1, 26);
  const australiaSub = mondayAfterWeekend(australiaDay);
  add(australiaSub ?? australiaDay, "Australia Day");

  const easter = easterSunday(year);
  add(plusDays(easter, -2), "Good Friday");
  add(plusDays(easter, -1), "Easter Saturday");
  add(easter, "Easter Sunday");
  add(plusDays(easter, 1), "Easter Monday");

  const anzac = utc(year, 4, 25);
  add(anzac, "Anzac Day");
  if (dow(anzac) === 0) add(plusDays(anzac, 1), "Anzac Day (observed)");

  add(firstWeekday(year, 5, 1), "Labour Day");
  add(ekkaWednesday(year), "Ekka show day", true);
  add(firstWeekday(year, 10, 1), "King's Birthday");

  const christmas = utc(year, 12, 25);
  const boxing = utc(year, 12, 26);
  add(christmas, "Christmas Day");
  add(boxing, "Boxing Day");
  // Weekend Christmas/Boxing Day move to the next free weekdays.
  if (dow(christmas) === 6) { add(utc(year, 12, 27), "Christmas Day (observed)"); add(utc(year, 12, 28), "Boxing Day (observed)"); }
  else if (dow(christmas) === 0) add(utc(year, 12, 27), "Christmas Day (observed)");
  else if (dow(boxing) === 6) add(utc(year, 12, 28), "Boxing Day (observed)");

  return out.sort((x, y) => x.date.localeCompare(y.date));
}

/**
 * Days the salon opens: Tuesday to Friday. It is shut Saturday, Sunday and
 * Monday (shared/onlineBookingSlots.ts), so a holiday on those changes
 * nothing.
 */
export function isSalonOpenWeekday(dateKey: string): boolean {
  const d = dow(new Date(`${dateKey}T00:00:00Z`));
  return d >= 2 && d <= 5;
}

/** Public holidays from `fromKey` to `toKey` inclusive that fall on a day the salon would open. */
export function holidaysOnOpenDays(fromKey: string, toKey: string): PublicHoliday[] {
  const fromYear = Number(fromKey.slice(0, 4));
  const toYear = Number(toKey.slice(0, 4));
  const all: PublicHoliday[] = [];
  for (let y = fromYear; y <= toYear; y += 1) all.push(...queenslandPublicHolidays(y));
  return all.filter((h) => h.date >= fromKey && h.date <= toKey && isSalonOpenWeekday(h.date));
}
