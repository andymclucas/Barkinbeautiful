/**
 * How many SMS segments a message costs, and why.
 *
 * Twilio bills per segment, not per message. The segment size depends on the
 * characters used:
 *
 *   GSM-7  160 chars in one segment, 153 each when the message is split
 *   UCS-2   70 chars in one segment,  67 each when the message is split
 *
 * A single emoji drops the whole message to UCS-2. "Thanks, see you at 9!" is
 * one segment; adding a dog emoji makes the same message UCS-2, where 70
 * characters is the limit - so a slightly longer note can quietly cost three
 * segments instead of one. With a client list this size that is real money,
 * and it is invisible unless the composer says so.
 */

/** Characters encodable in the GSM 03.38 basic alphabet. */
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

/** These exist in GSM-7 only via an escape, so each one costs two characters. */
const GSM7_EXTENDED = "^{}\\[~]|€";

const BASIC = new Set(GSM7_BASIC.split(""));
const EXTENDED = new Set(GSM7_EXTENDED.split(""));

export type SmsEncoding = "GSM-7" | "UCS-2";

export interface SmsCost {
  encoding: SmsEncoding;
  /** Billable units: GSM-7 counts escapes twice, UCS-2 counts UTF-16 code units. */
  length: number;
  segments: number;
  /** Characters left before another segment is added. */
  remainingInSegment: number;
  /** True when a non-GSM character forced UCS-2 - usually an emoji. */
  forcedUnicode: boolean;
}

export function isGsm7(text: string): boolean {
  for (const ch of text) if (!BASIC.has(ch) && !EXTENDED.has(ch)) return false;
  return true;
}

export function calculateSmsCost(text: string): SmsCost {
  const body = text ?? "";
  if (body === "") {
    return { encoding: "GSM-7", length: 0, segments: 0, remainingInSegment: 160, forcedUnicode: false };
  }

  const gsm = isGsm7(body);

  // GSM-7: extended characters take an escape plus the character.
  // UCS-2: emoji sit outside the BMP and take two UTF-16 code units, which is
  // what `.length` already reports, so it is the right measure here.
  let length = body.length;
  if (gsm) {
    length = 0;
    for (const ch of body) length += EXTENDED.has(ch) ? 2 : 1;
  }

  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;

  const segments = length <= single ? 1 : Math.ceil(length / multi);
  const capacity = segments === 1 ? single : multi * segments;

  return {
    encoding: gsm ? "GSM-7" : "UCS-2",
    length,
    segments,
    remainingInSegment: Math.max(0, capacity - length),
    forcedUnicode: !gsm,
  };
}
