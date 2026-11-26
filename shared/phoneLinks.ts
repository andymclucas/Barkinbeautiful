/**
 * Links that open the staff member's own phone or Messages app on a
 * client's number.
 *
 * Lauren, 26/11/2026: "also if we can click on the number to txt would be
 * cool". These open the DEVICE's Messages app with the number filled in.
 * Nothing is sent by Groomigo or Twilio, nothing is logged in smsLogs, and
 * the person tapping writes and sends the text themselves.
 */

/** "0412 345 678" -> "0412345678"; a leading + survives. Null when no digits. */
export function dialableNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 6) return null;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

/** sms: link for the number, or null when there is nothing to text. */
export function smsHref(phone: string | null | undefined): string | null {
  const n = dialableNumber(phone);
  return n ? `sms:${n}` : null;
}

/** tel: link for the number, or null when there is nothing to call. */
export function telHref(phone: string | null | undefined): string | null {
  const n = dialableNumber(phone);
  return n ? `tel:${n}` : null;
}
