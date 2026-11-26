/**
 * One Intl formatter per (locale, options), reused for the life of the
 * process.
 *
 * The 12:06 outage on 26/11/2026: the server ran out of its 2 GB and
 * Render restarted it. Building a `new Intl.DateTimeFormat` allocates ICU
 * memory outside the JavaScript heap, and Node does not hand it back.
 * Measured: 8,300 fresh formatters (one per completed appointment, which
 * is what the Lapsed Customers report did through dayInZone) added 266 MB
 * that never came back; one reused formatter doing the same work added
 * nothing. Several reports and paths doing this each pushed memory up a
 * step until the instance died.
 *
 * So server and shared code ask here instead of constructing their own.
 * server/intlCache.test.ts fails if a `new Intl.` creeps back in.
 *
 * Formatters are immutable once built, so sharing one is safe. The key is
 * the options object as written; two spellings of the same options make
 * two cache entries, which costs one formatter, not one per call.
 */

const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();
const numberFormats = new Map<string, Intl.NumberFormat>();

function keyOf(locale: string | string[] | undefined, options: object | undefined): string {
  return `${JSON.stringify(locale ?? null)}|${JSON.stringify(options ?? {})}`;
}

/** Drop-in for `new Intl.DateTimeFormat(locale, options)`, cached. */
export function dateTimeFormat(locale?: string | string[], options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = keyOf(locale, options);
  let formatter = dateTimeFormats.get(key);
  if (!formatter) {
    // Throws exactly as the constructor would (a bad timeZone, say), and
    // a formatter that failed to build is never cached.
    formatter = new Intl.DateTimeFormat(locale, options);
    dateTimeFormats.set(key, formatter);
  }
  return formatter;
}

/** Drop-in for `new Intl.NumberFormat(locale, options)`, cached. */
export function numberFormat(locale?: string | string[], options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = keyOf(locale, options);
  let formatter = numberFormats.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    numberFormats.set(key, formatter);
  }
  return formatter;
}

/** How many formatters are held, for the test. */
export function intlCacheSize(): { dateTime: number; number: number } {
  return { dateTime: dateTimeFormats.size, number: numberFormats.size };
}
