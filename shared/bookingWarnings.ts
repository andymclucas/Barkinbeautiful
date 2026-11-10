/**
 * What has to be said out loud before an appointment is written.
 *
 * On 02/11/2026 Sebastian Cutugno was `blocked` and his dog Simba was
 * flagged `danger` — "DO NOT BOOK IN — blacklisted" — and the Book
 * Appointment dialog showed neither. It opened with Simba already
 * selected, a price of $145 filled in, and a Book Appointment button.
 * The client page behind it carried both badges, which is exactly why
 * nobody noticed: the flag was visible everywhere except the one screen
 * where somebody is about to act against it.
 *
 * Pure, so the rule can be tested without rendering a dialog, and shared
 * so the two staff booking surfaces cannot drift apart. They already had
 * drifted: the client page renders its DANGER badge off `alertLevel`
 * alone, which silently misses a dog carrying only free text — the exact
 * hole `petAlertTone` was written to close for the workflow board.
 *
 * This decides WHAT to say. It does not decide whether to let the
 * booking through, and deliberately so — the salon takes a blocked
 * client's dog sometimes, and a dialog that refuses would be worked
 * around within a week. Staff are told; staff decide.
 */

import { petAlertText, petAlertTone, type PetAlertInput } from "./petAlert";
import type { ActionablePetAlertLevel } from "./petAlertStatus";
import { parsePetCodes } from "./petCodes";
import { indexPetCodes, type PetCodeEntry } from "./petCodeCatalogue";
import { warningCodesText } from "./petCodeWarnings";

export type BookingWarningTone = ActionablePetAlertLevel;

export type BookingWarning = {
  tone: BookingWarningTone;
  /**
   * What is being warned about, which is NOT the same as how loud it is.
   *
   * A `danger` dog is usually still bookable — Bear's own warning reads
   * "Bites for face and feet. Do not muzzle; nails last with a second
   * person holding", which is an instruction for doing the groom, not a
   * refusal of it. A blocked client is the real do-not-book. Labelling
   * both "DO NOT BOOK" would put those words over something routine, and
   * a stop word that appears over routine things stops being read.
   */
  kind: "client-blocked" | "pet-alert" | "pet-codes";
  /** Who it is about — the client's name, or the dog's. */
  subject: string;
  text: string;
};

export type BookingWarningInput = {
  client?: { name?: string | null; status?: string | null } | null;
  pets?: ReadonlyArray<
    PetAlertInput & {
      name?: string | null;
      /** The dog's codes as stored: "✂5f, SENSITIVE, DOG AGGRESSIVE". */
      moegoCodeLabels?: string | null;
    }
  > | null;
  /**
   * The salon's code catalogue, which says which codes are Warnings.
   * Without it only the built-in floor (bites, aggression, muzzle) is
   * raised — see shared/petCodeWarnings.ts.
   */
  petCodes?: readonly PetCodeEntry[] | null;
};

/**
 * `clients.status` is active | inactive | lapsed | blocked, and only the
 * last of those is a do-not-book. "lapsed" means they have not been in
 * for a while, which is a reason to WANT the booking.
 */
const BLOCKED = "blocked";

export function bookingWarnings(input: BookingWarningInput): BookingWarning[] {
  const danger: BookingWarning[] = [];
  const caution: BookingWarning[] = [];

  const status = input.client?.status?.trim().toLowerCase();
  if (status === BLOCKED) {
    const who = input.client?.name?.trim() || "This client";
    danger.push({
      tone: "danger",
      kind: "client-blocked",
      subject: who,
      // The name is on `subject`, so it is deliberately NOT repeated here —
      // rendered together they read "Sebastian Cutugno: Sebastian Cutugno
      // is blocked", which is how it first shipped.
      //
      // No attempt to quote the client note either. It is long, it is only
      // loaded on the client page, and a half-shown reason reads as the
      // whole reason. Point at the record that has it instead.
      text: "This client is blocked. Check the client record before booking this in.",
    });
  }

  const codeIndex = indexPetCodes(input.petCodes ?? []);

  for (const pet of input.pets ?? []) {
    const subject = pet.name?.trim() || "This dog";
    const tone = petAlertTone(pet);
    const text = tone ? petAlertText(pet) : null;
    if (tone && text) {
      // Never truncated: petAlertText returns the whole warning, and the
      // half of "Bites for face and feet. Do not muzzle" that fits is
      // worse than useless.
      (tone === "danger" ? danger : caution).push({ tone, kind: "pet-alert", subject, text });
    }

    /*
     * The dog's warning CODES, which are a different record from the
     * alert above and were never shown here.
     *
     * Andy, 10/11/2026: "Make sure that these are all added in the
     * bright red warning box on both the appt and the workflow
     * sections." A dog can carry SENSITIVE and DOG AGGRESSIVE as codes
     * with an alert level of "ok" and no warning text at all — that is
     * most of them — and the box said nothing.
     *
     * Always red: he asked for red, and a code somebody has classed as
     * a Warning is not a "caution".
     */
    const codes = warningCodesText(parsePetCodes(pet.moegoCodeLabels), codeIndex);
    if (codes) danger.push({ tone: "danger", kind: "pet-codes", subject, text: codes });
  }

  // Danger first. The panel is skimmed, and the thing that stops a
  // booking should not be below the thing that merely colours it.
  return [...danger, ...caution];
}

/** The loudest tone present, for the panel's own colour. */
export function worstBookingWarningTone(
  warnings: readonly BookingWarning[],
): BookingWarningTone | null {
  if (warnings.some((w) => w.tone === "danger")) return "danger";
  return warnings.length > 0 ? "caution" : null;
}
