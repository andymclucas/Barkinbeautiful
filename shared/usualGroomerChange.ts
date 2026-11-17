/**
 * Asking before a dog is booked with somebody other than its usual groomer.
 *
 * Andy to Lauren, 13/11/2026, and her answer was "yes perfect": dogs marked
 * for a groomer are assigned to her automatically, "and if they need to be
 * changed it will give them a prompt to say 'Are you sure you want to change
 * this groomer from Charlie?'"
 *
 * The automatic half already existed (shared/preferredGroomerDefaults.ts
 * fills the groomer in from the dog's file). This is the other half: the
 * question, so the usual groomer is changed on purpose and never by a slip.
 *
 * It asks, it never blocks. And it stays quiet whenever asking would be
 * noise:
 *  - the dog has no usual groomer on file;
 *  - the usual groomer is no longer on the roster (nobody to keep it with);
 *  - the booking is going to the usual groomer;
 *  - an existing booking's groomer is not being changed by this save. A dog
 *    already booked with somebody else was a decision made earlier, and
 *    asking again every time a note is edited would teach staff to click
 *    through the question;
 *  - the booking is day care. Nobody grooms a day care dog, so who usually
 *    does is beside the point.
 */
import { isDaycareService } from "./bookingEnd";

export type UsualGroomerDog = {
  petName: string | null | undefined;
  /** The groomer on the dog's file. */
  usualGroomerId: number | null | undefined;
  /** Who this booking will be with; null for nobody. */
  newGroomerId: number | null | undefined;
  /**
   * Who an EXISTING booking is with now. Leave undefined for a booking
   * that is being made for the first time.
   */
  currentGroomerId?: number | null;
  /** What the booking is for. Day care is never asked about. */
  serviceType?: string | null;
};

const joinNames = (names: string[]): string =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/**
 * The question to put to staff, or null when there is nothing to ask.
 *
 * `rosterName` returns a groomer's name, or undefined when they are not on
 * the active roster.
 */
export function usualGroomerChangeQuestion(
  dogs: readonly UsualGroomerDog[],
  rosterName: (staffId: number) => string | undefined,
): string | null {
  const byUsual = new Map<number, string[]>();
  for (const dog of dogs) {
    if (isDaycareService(dog.serviceType)) continue;
    const usual = dog.usualGroomerId ?? null;
    if (usual === null) continue;
    if (rosterName(usual) === undefined) continue;
    const next = dog.newGroomerId ?? null;
    if (next === usual) continue;
    if (dog.currentGroomerId !== undefined && (dog.currentGroomerId ?? null) === next) continue;
    const name = (dog.petName ?? "").trim() || "This dog";
    byUsual.set(usual, [...(byUsual.get(usual) ?? []), name]);
  }
  if (byUsual.size === 0) return null;

  const sentences = [...byUsual].map(([usual, names]) =>
    `${joinNames(names)} ${names.length === 1 ? "is" : "are"} usually groomed by ${rosterName(usual)}.`);
  return `${sentences.join(" ")} Change the groomer anyway?`;
}
