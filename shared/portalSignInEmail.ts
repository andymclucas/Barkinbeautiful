/**
 * "Email me a sign-in link" — the email, and what the page says.
 *
 * Andy, 12/11/2026: nobody invited could get back into the portal. The
 * setup email works once, and the password behind it is the thing a client
 * who comes in every six weeks forgets. A link to the address on the
 * account is the whole sign-in: no password to remember, nothing to save.
 */

export const SIGNIN_LINK_SENT_MESSAGE =
  "If that email has a client portal account, we've sent it a link and a 6-digit code. "
  + "Tap the link, or type the code below. Nothing there? Check your junk folder, or call the salon.";

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function portalSignInEmail(input: {
  firstName: string | null | undefined;
  signInUrl: string;
  salonName: string;
  /** Six digits, for a portal saved to an iPhone Home Screen. */
  code: string;
}): { subject: string; html: string } {
  const name = escapeHtml((input.firstName ?? "").trim() || "there");
  const url = escapeHtml(input.signInUrl);
  const salon = escapeHtml(input.salonName);
  return {
    subject: `Your ${input.salonName} sign-in link`,
    html:
      `<p>Hi ${name},</p>`
      + `<p>Tap the button to sign in to your ${salon} client portal — no password needed.</p>`
      + `<p><a href="${url}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#db2777;color:#ffffff;text-decoration:none;font-weight:600">Sign in to my portal</a></p>`
      + `<p>Using the portal saved on your Home Screen? Open it and type this code instead:</p>`
      + `<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:8px 0">${escapeHtml(input.code.slice(0, 3))} ${escapeHtml(input.code.slice(3))}</p>`
      + `<p>The link and the code work once, for the next 15 minutes. After that you'll stay signed in.</p>`
      + `<p>Didn't ask for this? You can ignore it — nobody can sign in without this email.</p>`
      + `<p>${salon}</p>`,
  };
}
