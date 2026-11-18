/**
 * Whether to ask "text the client?" before a booking is moved.
 *
 * Lauren, 19/11/2026: "I moved the booking from today to tomorrow- I didnt
 * know it automatically sent a text (too early) can it prompt if we want
 * to sent a text? cause when I work at night I dont want texts going to
 * customers while I'm trying to just plan our day".
 *
 * A move to another DAY is the only move that texts (same-day moves never
 * have; shared/appointmentChangeSms.ts). So that is the only move that
 * asks, and only when the new time is still ahead: a booking put into the
 * past texts nobody. The server still applies every one of its own rules
 * (opted out, already told, quiet hours); a yes here is permission to
 * text, not a promise that one goes.
 */
import { brisbaneDateKey, parseBrisbaneLocalDateTime } from "./localDateTime";

export function moveAsksAboutText(input: {
  /** Where the booking is now. */
  previousStart: Date | string | number;
  /** Where it is going, as the Brisbane local value the forms hold: "2026-11-20T12:30". */
  newStartLocal: string;
  now?: Date;
}): boolean {
  const previous = new Date(input.previousStart);
  if (Number.isNaN(previous.getTime())) return false;
  let next: Date;
  try {
    next = parseBrisbaneLocalDateTime(input.newStartLocal);
  } catch {
    return false;
  }
  if (Number.isNaN(next.getTime())) return false;
  if (next.getTime() <= (input.now ?? new Date()).getTime()) return false;
  return brisbaneDateKey(previous) !== brisbaneDateKey(next);
}
