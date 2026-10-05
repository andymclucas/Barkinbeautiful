/**
 * What a client should be shown when a portal request fails.
 *
 * The portal is the one screen in this system a paying customer sees, and it
 * used to render the raw error straight through. A client who had just saved
 * their card was shown:
 *
 *   [ { "origin": "string", "code": "too_small", "minimum": 32, ... } ]
 *
 * which is zod's validation output. It tells the client nothing, looks broken,
 * and leaks the shape of our API. Our own TRPCError messages are written for
 * people and should still be shown; machine output should not.
 */

/** Does this read like a sentence written for a person? */
export function isClientReadableMessage(message: string | null | undefined): boolean {
  const text = (message ?? "").trim();
  if (!text) return false;
  // Serialised JSON, arrays or objects — zod issues and the like.
  if (text.startsWith("[") || text.startsWith("{")) return false;
  // Field-level validation chatter that leaks internals even as prose.
  if (/"code"\s*:|"path"\s*:|\bZodError\b|\bInvalid input\b/i.test(text)) return false;
  // Stack traces and bare exception names.
  if (/\n\s*at\s|\b(TypeError|ReferenceError|SyntaxError)\b/.test(text)) return false;
  return true;
}

export const PORTAL_LINK_FALLBACK =
  "This link is no longer valid. Please ask the salon for a new one.";
export const PORTAL_SIGNIN_FALLBACK = "Please sign in to view your client portal.";

/**
 * @param message  the error message from the server, if any
 * @param usedToken  true for a shared link, false for a signed-in session
 */
export function clientFacingPortalError(
  message: string | null | undefined,
  usedToken: boolean,
): string {
  if (isClientReadableMessage(message)) return (message ?? "").trim();
  return usedToken ? PORTAL_LINK_FALLBACK : PORTAL_SIGNIN_FALLBACK;
}

/** One field-level complaint, already in words. */
type ValidationIssue = { message?: unknown; path?: unknown };

const FIELD_LABELS: Record<string, string> = {
  email: "Email",
  phone: "Phone",
  name: "Name",
  password: "Password",
  price: "Price",
  dateOfBirth: "Date of birth",
  emergencyPhone: "Emergency phone",
  colourHex: "Colour",
};

function labelFor(path: unknown): string | null {
  if (!Array.isArray(path) || path.length === 0) return null;
  const field = String(path[path.length - 1] ?? "");
  if (!field) return null;
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  // camelCase -> "Camel case", so an unmapped field still reads as English.
  // Sentence case, not Title Case: "Emergency contact", not "Emergency Contact".
  const spaced = field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Turn a serialised validation error into something a person can act on.
 *
 * zod's output is JSON, and tRPC puts it straight into `error.message`, so
 * without this the staff edit form showed a toast containing the full regex
 * for a valid email address. The useful sentence — "Invalid email address" —
 * was already in there, at the end, after the pattern.
 *
 * Returns null when the message is not validation output, so callers can
 * fall back to whatever they would otherwise have shown.
 */
export function readableValidationMessage(message: string | null | undefined): string | null {
  const text = (message ?? "").trim();
  if (!text.startsWith("[") && !text.startsWith("{")) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  const issues: ValidationIssue[] = Array.isArray(parsed)
    ? (parsed as ValidationIssue[])
    : [parsed as ValidationIssue];

  const parts: string[] = [];
  for (const issue of issues) {
    if (!issue || typeof issue !== "object") continue;
    const detail = typeof issue.message === "string" ? issue.message.trim() : "";
    if (!detail) continue;
    const label = labelFor(issue.path);
    const line = label ? `${label}: ${detail}` : detail;
    if (!parts.includes(line)) parts.push(line);
  }

  if (parts.length === 0) return null;
  // Several at once reads as a list, not a wall.
  return parts.join(" · ");
}

export const GENERIC_FAILURE = "Something went wrong. Please try again.";

/**
 * What to show a staff member when a request fails.
 *
 * Our own TRPCError messages are written for people and pass through
 * untouched. Validation output is unpacked into the field and the
 * complaint. Anything else that still looks like machine output is replaced,
 * because a toast full of JSON tells a groomer nothing and looks broken.
 */
export function staffFacingError(message: string | null | undefined, fallback = GENERIC_FAILURE): string {
  if (isClientReadableMessage(message)) return (message ?? "").trim();
  return readableValidationMessage(message) ?? fallback;
}
