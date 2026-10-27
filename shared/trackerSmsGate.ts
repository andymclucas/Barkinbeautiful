/**
 * Whether the Pet Tracker check-in text may go out.
 *
 * Andy, 27/10/2026: "Do not send any check in SMS to the clients with
 * the workflow at this point."
 *
 * It was live and firing: two clients had already been texted that
 * morning, nine dogs were still to check in that day, and 706 future
 * bookings would each have texted on arrival.
 *
 * This is a switch of its own rather than turning SMS_AUTOMATION_ENABLED
 * off, because that one also gates the appointment reminders — stopping
 * the tracker text by stopping everything would silently cancel the
 * reminders the salon relies on.
 *
 * **Off unless explicitly switched on.** An unset variable means no
 * client is texted, which is the state Andy asked for and the safe
 * default for anything that messages a real person. Turning it back on
 * is a Render environment change, not a deploy.
 */
export function trackerSmsAllowed(env: Record<string, string | undefined>): boolean {
  // The global gate still applies: nothing automated goes out while that
  // is off, whatever this one says.
  if (env.SMS_AUTOMATION_ENABLED !== "true") return false;
  return env.TRACKER_SMS_ENABLED === "true";
}
