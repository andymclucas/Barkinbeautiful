/**
 * The email a client gets the moment their portal password is set.
 *
 * Andy, 12/11/2026, after Lauren said nearly everyone invited was coming
 * back unable to get in: the only portal link they had ever been sent was
 * the setup email, which works once. This gives every client the address
 * they actually sign in at, in their inbox, at the moment they need it.
 *
 * The same email, worded for the case, goes after a password reset: a
 * "your password was changed" note is also the client's only warning if
 * somebody else did it.
 */

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function portalAllSetEmail(input: {
  firstName: string | null | undefined;
  /** Where they sign in, e.g. https://clients.barkinbeautiful.com.au/portal/login */
  signInUrl: string;
  loginEmail: string;
  salonName: string;
  salonPhone?: string | null;
  /** True when an existing password was replaced, not a first setup. */
  wasReset: boolean;
}): { subject: string; html: string } {
  const name = escapeHtml((input.firstName ?? "").trim() || "there");
  const salon = escapeHtml(input.salonName);
  const url = escapeHtml(input.signInUrl);
  const email = escapeHtml(input.loginEmail);
  const phone = input.salonPhone?.trim() ? ` on ${escapeHtml(input.salonPhone.trim())}` : "";

  const subject = input.wasReset
    ? `Your ${input.salonName} portal password has been changed`
    : `You're all set — your ${input.salonName} client portal`;

  const opening = input.wasReset
    ? `<p>Your client portal password has just been changed.</p>`
    : `<p>Your ${salon} client portal is ready.</p>`;

  const warning = input.wasReset
    ? `<p>Didn't change it? Call us${phone} straight away.</p>`
    : "";

  return {
    subject,
    html:
      `<p>Hi ${name},</p>`
      + opening
      + `<p><strong>Next time, sign in here:</strong><br><a href="${url}">${url}</a></p>`
      + `<p>Sign in with <strong>${email}</strong> and the password you just set. `
      + `Bookmark that page, or on your phone use Share &rarr; Add to Home Screen, so it's always one tap away. `
      + `The link in your setup email only works once, so you won't need it again.</p>`
      + `<p>Forgotten your password? Tap &ldquo;Forgot password?&rdquo; on the sign-in page and we'll email you a new link.</p>`
      + warning
      + `<p>See you soon,<br>${salon}</p>`,
  };
}
