/**
 * The notice a client sees in their portal after a failed membership payment.
 *
 * Andy, 25/11/2026: "Add in a portal notification to the client first about
 * the failed payment. Second day with fail attempt is an email to the
 * client. 3rd is suspended." This is that first notification. It stays up
 * through the email and the suspension too, saying which it is, until the
 * payment goes through or staff resolve it.
 */
export function portalFailedPaymentNotice(
  failed: { retryAt: Date | string | null; suspended: boolean } | null | undefined,
): { title: string; body: string } | null {
  if (!failed) return null;
  if (failed.suspended) {
    return {
      title: "Your membership is paused",
      body: "Your membership payment didn't go through, so bookings are on hold. Please update your card below or contact the salon.",
    };
  }
  const when = failed.retryAt ? brisbaneDay(new Date(failed.retryAt)) : null;
  return {
    title: "Your last membership payment didn't go through",
    body: when
      ? `We'll try again on ${when}. If your card has changed, you can update it below.`
      : "We'll try again soon. If your card has changed, you can update it below.",
  };
}

function brisbaneDay(at: Date): string | null {
  if (Number.isNaN(at.getTime())) return null;
  return at.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "Australia/Brisbane" });
}
