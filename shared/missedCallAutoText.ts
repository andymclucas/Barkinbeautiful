/**
 * The missed-call auto-reply: at most ONE text per phone number, ever.
 *
 * The decision used to live inline in the Twilio voice-no-answer handler and
 * could not honour that rule - it failed open on a database hiccup, recorded
 * the send only afterwards and swallowed the failure, and matched on the
 * message body so re-wording it would reset everyone's history.
 *
 * The parts that are decisions rather than plumbing live here as pure
 * functions so they can be tested without Twilio or a database. The guarantee
 * itself is enforced by a UNIQUE key on missed_call_auto_texts - see
 * drizzle/0060_missed_call_auto_texts.sql.
 */

export const MISSED_CALL_AUTO_TEXT =
  "Thank you for calling Barkin' Beautiful and we're sorry we missed your call - we will call you back as soon as we are able, but please feel free to send us a reply text and let us know what you need.";

/**
 * Canonical key for a caller's number: the one spelling used to decide whether
 * this number has been texted before. Returns null when the caller cannot be
 * texted at all, which is a reason to send nothing rather than to try.
 *
 * "Cannot be texted" covers three things: not a number at all (withheld caller
 * ID), not valid E.164, and valid but unreachable by SMS — an Australian
 * landline or service number.
 *
 * Twilio delivers withheld numbers as literal words ("anonymous", "unknown",
 * "restricted"); the old code ran those through the mobile normaliser and
 * cheerfully tried to text "+anonymous", which is two of the failed sends in
 * sms_logs.
 */
export function autoTextPhoneKey(from: string | null | undefined): string | null {
  if (!from) return null;
  const compact = String(from).trim().replace(/[\s()\-.]/g, "");
  if (!compact) return null;

  // A single leading 0 is the Australian national trunk prefix, for landlines
  // (02/03/07/08) as much as mobiles (04). normaliseAustralianMobile() in
  // server/inboundSms.ts only special-cases "04", so it turns a landline like
  // 0755516955 into the invalid "+0755516955" - a unit test caught that here.
  const withPrefix = compact.startsWith("+")
    ? compact
    : compact.startsWith("0")
      ? `+61${compact.slice(1)}`
      : compact.startsWith("61")
        ? `+${compact}`
        : `+${compact}`;

  // E.164: "+" then 8-15 digits. Anything else (withheld caller ID, SIP URIs,
  // short codes) is not a number we can text.
  if (!/^\+\d{8,15}$/.test(withPrefix)) return null;

  // Valid E.164 is not the same as reachable by SMS. Only +614… can receive a
  // text in Australia: +612/3/7/8 are landlines and +6113/+6118 are service
  // numbers, and Twilio refuses all of them with "'To' number cannot be a
  // landline". The old code stopped at E.164 and so cheerfully tried to text
  // 07 3821 5455 on 09/10/2026, which failed and burned that caller's
  // one-and-only auto-text claim in the process.
  //
  // Deliberately scoped to +61. A landline anywhere else is just as untextable
  // but cannot be told apart from a mobile by prefix, and refusing to guess is
  // better than silently dropping a real international mobile.
  if (withPrefix.startsWith("+61") && !withPrefix.startsWith("+614")) return null;

  return withPrefix;
}

/** Outcome of trying to claim the one-and-only send for a number. */
export type AutoTextClaim =
  | { send: true; reason: "claimed" }
  | { send: false; reason: "already-sent" | "not-dialable" | "no-database" | "claim-failed" };

/**
 * Whether to send, given what happened when we tried to write the claim row.
 *
 * Every non-success answer is "don't send". That is deliberate: the
 * instruction is that this text cannot go out more than once, so when we
 * cannot prove it has not already gone out, we stay silent. The caller still
 * reaches voicemail, and staff still see the missed call in the app.
 */
export function classifyClaim(input: {
  phoneKey: string | null;
  databaseAvailable: boolean;
  insert: "won" | "duplicate" | "error" | "not-attempted";
}): AutoTextClaim {
  if (!input.phoneKey) return { send: false, reason: "not-dialable" };
  if (!input.databaseAvailable) return { send: false, reason: "no-database" };
  if (input.insert === "won") return { send: true, reason: "claimed" };
  if (input.insert === "duplicate") return { send: false, reason: "already-sent" };
  return { send: false, reason: "claim-failed" };
}

/** MySQL/TiDB duplicate-key error - the definitive "this number already has a row". */
export function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; errno?: unknown; message?: unknown };
  if (e.code === "ER_DUP_ENTRY" || e.errno === 1062) return true;
  // drizzle wraps the driver error; the cause carries the real code.
  const cause = (error as { cause?: unknown }).cause;
  if (cause && cause !== error && isDuplicateKeyError(cause)) return true;
  return typeof e.message === "string" && /duplicate entry/i.test(e.message);
}

/** One line for the server log, so the reason a text was withheld is visible. */
export function describeClaim(claim: AutoTextClaim, phoneKey: string | null, from: string): string {
  const who = phoneKey ?? from;
  switch (claim.reason) {
    case "claimed":
      return `[Twilio] Missed-call auto-text: first contact for ${who} - sending once`;
    case "already-sent":
      return `[Twilio] Missed-call auto-text withheld for ${who} - already sent previously`;
    case "not-dialable":
      return `[Twilio] Missed-call auto-text withheld - caller number not textable (${from})`;
    case "no-database":
      return `[Twilio] Missed-call auto-text WITHHELD for ${who} - database unavailable, cannot prove it was not already sent`;
    case "claim-failed":
      return `[Twilio] Missed-call auto-text WITHHELD for ${who} - could not record the send claim`;
  }
}
