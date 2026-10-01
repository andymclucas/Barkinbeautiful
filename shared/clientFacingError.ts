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
