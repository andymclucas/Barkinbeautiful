/**
 * The notice a client sees in their portal after a failed membership payment.
 *
 * Andy, 25/11/2026: "Add in a portal notification to the client first about
 * the failed payment. Second day with fail attempt is an email to the
 * client. 3rd is suspended." This is that first notification. It stays up
 * through the email and the suspension too, saying which it is, until the
 * payment goes through or staff resolve it.
 *
 * It only promises another try when one is actually booked in the future.
 * A retry the job could not make (no card on file, say) clears the date
 * but leaves the failure standing, and "we'll try again soon" would then
 * be untrue for as long as nobody fixed it.
 */
export function portalFailedPaymentNotice(
  failed: { retryAt: Date | string | null; suspended: boolean } | null | undefined,
  now: Date = new Date(),
): { title: string; body: string } | null {
  if (!failed) return null;
  if (failed.suspended) {
    return {
      title: "Your membership is paused",
      body: "Your membership payment didn't go through, so bookings are on hold. Please update your card below or contact the salon.",
    };
  }
  const retryAt = failed.retryAt ? new Date(failed.retryAt) : null;
  const upcoming = retryAt && !Number.isNaN(retryAt.getTime()) && retryAt.getTime() > now.getTime() ? retryAt : null;
  return {
    title: "Your last membership payment didn't go through",
    body: upcoming
      ? `We'll try again on ${brisbaneDay(upcoming)}. If your card has changed, you can update it below.`
      : "Please update your card below, or contact the salon.",
  };
}

function brisbaneDay(at: Date): string {
  return at.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "Australia/Brisbane" });
}
