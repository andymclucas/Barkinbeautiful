/**
 * The greeting at the top of the dashboard.
 *
 * It said "Good morning" at any hour, because it was a literal string —
 * read at 2:20pm on the salon screen it just looked broken. Which half of
 * the day it is depends on the clock the viewer is on, so the hour is
 * worked out in their timezone and handed in here.
 *
 * Three bands, the ordinary English ones. Deep night falls under "Good
 * morning", which is the convention and reads better at 3am than the
 * alternatives.
 */
export function greetingForHour(hour: number): string {
  // A clock that cannot be read should not produce "Good undefined".
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return "Hello";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
