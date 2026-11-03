/**
 * Day/month/year, whatever the device thinks it is.
 *
 * Lauren, 03/11/2026, of the workflow board: "What's with the American
 * date?" — the board was showing 11/03/2026 for the 3rd of November.
 *
 * Nothing in the app chose that. A native `<input type="date">` renders in
 * the BROWSER's locale and there is no HTML or CSS that can override it:
 * not the `lang` attribute, not a `pattern`, not a `placeholder`. The salon
 * machine is set to US English, so every one of the app's date inputs reads
 * back to front on it — and on the TV board that is the one number everyone
 * glances at.
 *
 * Changing that machine's locale would fix it on that machine, which is
 * exactly the problem: Groomigo is sold to other salons now, and "every
 * device must be configured correctly" is not a thing anyone can promise.
 * So the format is the app's decision, made here, and the same everywhere.
 *
 * Kept pure and separate from the component because parsing what somebody
 * typed is where this goes wrong, and it is cheap to test properly: 31/02
 * must be rejected rather than silently rolling into March, which is what
 * `new Date("2026-02-31")` does.
 */

/** The ISO day key the app stores and sends: "2026-11-03". */
export type DayKey = string;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
/** 3/11/2026, 03-11-26, 3.11 — separator and padding are the typist's business. */
const TYPED = /^(\d{1,2})\s*[/\-. ]\s*(\d{1,2})(?:\s*[/\-. ]\s*(\d{2}|\d{4}))?$/;

/** True for a real calendar day — rejects 31/02 and 00/01. */
function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // Built in UTC so the host's timezone cannot shift the day underneath the
  // check — the app runs in Brisbane and is developed anywhere.
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year
    && probe.getUTCMonth() === month - 1
    && probe.getUTCDate() === day;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-11-03" -> "03/11/2026". Anything unparseable comes back as "". */
export function formatAuDate(key: DayKey | null | undefined): string {
  if (!key) return "";
  const match = ISO.exec(key.trim());
  if (!match) return "";
  const [, y, m, d] = match;
  if (!isRealDate(Number(y), Number(m), Number(d))) return "";
  return `${d}/${m}/${y}`;
}

/**
 * What somebody typed -> an ISO day key, or null when it is not a date yet.
 *
 * Deliberately forgiving about HOW it is written and strict about WHETHER
 * it exists. A half-typed "3/1" while they are still going is simply null,
 * not an error — the field keeps their text and waits.
 *
 * `today` is injectable so the two-digit-year and missing-year rules can be
 * tested without the clock moving under them.
 */
export function parseAuDate(text: string, today: Date = new Date()): DayKey | null {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return null;

  // An ISO date pasted in is already what we want. Accepted so that copying
  // a key out of a URL or a spreadsheet does not have to be retyped.
  const iso = ISO.exec(trimmed);
  if (iso) {
    const [, y, m, d] = iso;
    return isRealDate(Number(y), Number(m), Number(d)) ? `${y}-${m}-${d}` : null;
  }

  const typed = TYPED.exec(trimmed);
  if (!typed) return null;
  const day = Number(typed[1]);
  const month = Number(typed[2]);

  let year: number;
  if (typed[3] === undefined) {
    // No year: this year. The salon types "3/11" for a date in the season
    // they are working in.
    year = today.getFullYear();
  } else if (typed[3].length === 2) {
    // Two digits are this century. A grooming salon has no reason to type
    // "26" and mean 1926, and the alternative - a sliding window - makes
    // the same keystrokes mean different years over time.
    year = 2000 + Number(typed[3]);
  } else {
    year = Number(typed[3]);
  }

  return isRealDate(year, month, day) ? `${year}-${pad(month)}-${pad(day)}` : null;
}

/** What to show under a field while it is being typed. */
export const AU_DATE_HINT = "DD/MM/YYYY";
