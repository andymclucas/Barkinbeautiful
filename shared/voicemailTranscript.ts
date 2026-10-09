/**
 * Making a Twilio voicemail transcript readable enough to act on.
 *
 * Twilio's built-in transcription is the weak link and this does not pretend
 * otherwise — it cannot repair a misheard word, and "mini girdle" stays
 * "mini girdle" until a better engine is doing the listening. What it does
 * fix is the one failure that stops the message being useful at all: a
 * phone number nobody can dial.
 *
 * From the salon's own voicemails:
 *
 *   "call me back on 418 double 104 double 5"   -> 0418 110 455
 *   "phone number 04383, double 626"            -> 0438 366 268
 *   "call me back on a double 49636892"         -> 0449 636 892
 *   "My phone number is are 415434209"          -> 0415 434 209
 *
 * Numbers are spoken, so "double 1" means 11 and a leading zero is usually
 * dropped. Written out in digits they can be tapped; left as prose they have
 * to be decoded by someone holding a phone.
 */

const WORD_DIGITS: Record<string, string> = {
  zero: "0", oh: "0", o: "0", nought: "0",
  one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9",
};

/**
 * "double 1" -> "11", "triple 5" -> "555", "four five" -> "45".
 *
 * Run before any number matching, because the digits of a spoken number are
 * routinely broken up this way and no pattern will see them otherwise.
 */
export function normaliseSpokenDigits(text: string): string {
  let out = text;
  // "double 104" is "double 1" followed by "0" and "4" — the repeat applies
  // to the first digit only, not the whole run.
  out = out.replace(/\b(double|triple)\s+(\d)/gi, (_m, word: string, digit: string) =>
    digit.repeat(word.toLowerCase() === "double" ? 2 : 3));
  out = out.replace(/\b(double|triple)\s+([a-z]+)/gi, (match, word: string, name: string) => {
    const digit = WORD_DIGITS[name.toLowerCase()];
    if (!digit) return match;
    return digit.repeat(word.toLowerCase() === "double" ? 2 : 3);
  });
  return out;
}

/** Digits only, with a leading 0 restored on a 9-digit Australian number. */
function canonicalise(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("61")) digits = `0${digits.slice(2)}`;
  // Callers routinely drop the leading zero: "415757424" is 0415 757 424.
  if (digits.length === 9 && /^[2-478]/.test(digits)) digits = `0${digits}`;
  if (digits.length !== 10 || !digits.startsWith("0")) return null;
  return digits;
}

/** "0418110455" -> "0418 110 455" for a mobile, "07 3821 5455" for a landline. */
export function formatAustralianNumber(digits: string): string {
  if (digits.length !== 10) return digits;
  return digits.startsWith("04")
    ? `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
    : `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
}

/**
 * Every Australian number the caller said, in the order they said it.
 *
 * Deliberately greedy about spacing and punctuation — "04383, double 626"
 * is one number read with a pause — and deliberately strict about the
 * result: ten digits starting with a zero, or it is not returned at all.
 * A half-heard number is worse than none, because somebody will dial it.
 */
export function extractCallbackNumbers(text: string): string[] {
  const normalised = normaliseSpokenDigits(text);
  const found: string[] = [];
  const seen = new Set<string>();
  // Runs of digits that may be split by spaces, commas, dots or dashes.
  const runs = normalised.match(/\d[\d\s,.\-]{7,}\d/g) ?? [];
  for (const run of runs) {
    const canonical = canonicalise(run);
    if (canonical && !seen.has(canonical)) {
      seen.add(canonical);
      found.push(canonical);
    }
  }
  return found;
}

/**
 * The transcript with spoken digit-runs written as numbers.
 *
 * Only the numbers change. Nothing tries to second-guess a misheard word,
 * because a transcript that quietly invents a different message is worse
 * than one that is obviously rough.
 */
export function tidyTranscript(text: string | null | undefined): string {
  if (!text) return "";
  let out = normaliseSpokenDigits(text);
  out = out.replace(/(\d[\d\s,.\-]{7,}\d)/g, (run) => {
    const canonical = canonicalise(run);
    return canonical ? formatAustralianNumber(canonical) : run;
  });
  return out.replace(/\s{2,}/g, " ").trim();
}

/**
 * Is a number the caller spoke worth showing, given the number they rang from?
 *
 * Usually a caller recites their own number, which the salon already has from
 * caller ID, so repeating it is noise. The exceptions matter though: a
 * withheld caller ID, or someone ringing from the landline and asking to be
 * called on their mobile.
 *
 * The guard is the single-digit case. Missed call #1470001 came from
 * 0423 856 159 and the transcript read 0433 856 159 — one digit out, which
 * is a mishearing rather than a second number. Offering it would send
 * somebody to a stranger, so anything within one digit of the caller's own
 * number is treated as that number.
 */
export function worthShowingCallback(spoken: string, callerDigits: string | null | undefined): boolean {
  const caller = (callerDigits ?? "").replace(/\D/g, "").replace(/^61/, "0");
  if (!caller) return true;
  if (spoken === caller) return false;
  if (spoken.length !== caller.length) return true;
  let differing = 0;
  for (let i = 0; i < spoken.length; i++) {
    if (spoken[i] !== caller[i]) differing++;
    if (differing > 1) return true;
  }
  return false;
}
