/**
 * What a client may change about themselves from the client portal.
 *
 * Deliberately a small set. Staff-owned fields (internal notes, status,
 * referral source) and anything billing- or identity-related (Stripe ids,
 * MoeGo ids, the portal login email) are not editable here: a client
 * changing their own login address from inside a session is how people lock
 * themselves out, and the login email carries a uniqueness constraint that
 * a self-service form should not be fighting.
 *
 * Phone numbers are stored the way the salon already holds them —
 * "0427030788" — not E.164. normaliseAustralianMobile() converts at the SMS
 * boundary, so storing a different shape here would quietly split the
 * data set in two.
 */

export type ClientProfileInput = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
};

export type ClientProfileValue = {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
};

export type ClientProfileResult =
  | { ok: true; value: ClientProfileValue }
  | { ok: false; errors: Record<string, string> };

export const MAX_NAME = 100;
export const MAX_EMAIL = 320;
export const MAX_ADDRESS = 500;

/** Strip the spaces, brackets and dashes people type, keep digits and +. */
export function tidyPhone(raw: string | null | undefined): string {
  return (raw ?? "").replace(/[\s()\-.]/g, "").trim();
}

/**
 * Australian mobile/landline in the local form the salon's records use.
 * +61 and 61 prefixes are folded back to a leading 0.
 */
export function normaliseAustralianPhoneForStorage(raw: string | null | undefined): string {
  const compact = tidyPhone(raw);
  if (!compact) return "";
  if (compact.startsWith("+61")) return `0${compact.slice(3)}`;
  if (compact.startsWith("61") && compact.length >= 10) return `0${compact.slice(2)}`;
  return compact;
}

export function isPlausibleAustralianPhone(raw: string | null | undefined): boolean {
  const local = normaliseAustralianPhoneForStorage(raw);
  if (!local) return false;
  // 10 digits beginning 0: covers 04xx mobiles and 0x landlines.
  return /^0\d{9}$/.test(local);
}

export function isPlausibleEmail(raw: string | null | undefined): boolean {
  const value = (raw ?? "").trim();
  if (!value || value.length > MAX_EMAIL) return false;
  // Intentionally loose: the authority on deliverability is Resend, not us.
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value);
}

/**
 * Clean and check what the client typed.
 *
 * Blank optional fields come back as null rather than "" so the column is
 * genuinely empty, instead of holding a string that reads as present.
 */
export function prepareClientProfile(input: ClientProfileInput): ClientProfileResult {
  const errors: Record<string, string> = {};

  const firstName = (input.firstName ?? "").trim();
  const lastName = (input.lastName ?? "").trim();
  const email = (input.email ?? "").trim();
  const phone = normaliseAustralianPhoneForStorage(input.phone);
  const address = (input.address ?? "").trim();

  if (!firstName) errors.firstName = "Please enter your first name.";
  else if (firstName.length > MAX_NAME) errors.firstName = "That first name is too long.";

  if (!lastName) errors.lastName = "Please enter your last name.";
  else if (lastName.length > MAX_NAME) errors.lastName = "That last name is too long.";

  if (email && !isPlausibleEmail(email)) errors.email = "That email address doesn't look right.";

  if (phone && !isPlausibleAustralianPhone(phone)) {
    errors.phone = "Please enter an Australian number, like 0412 345 678.";
  }

  if (address.length > MAX_ADDRESS) errors.address = "That address is too long.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      firstName,
      lastName,
      email: email ? email.toLowerCase() : null,
      phone: phone || null,
      address: address || null,
    },
  };
}
