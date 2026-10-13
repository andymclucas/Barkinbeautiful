/**
 * When the "ready for pickup" text can be sent.
 *
 * Lauren, 13/10/2026: "Is this button meant to work to sms the client when
 * finished... cause it doesn't."
 *
 * It did not, and could not. Commit 16bf5e3 moved the prompt so it appears
 * the moment a dog is marked READY — deliberately, because by the time a
 * dog is marked OUT the owner may already have walked out with it. The two
 * server procedures behind the dialog were left demanding `complete`, so
 * the dialog opened, immediately said "Pickup messages are available after
 * the dog is marked complete", and the Send button stayed dead. Every time.
 *
 * `ready` is the state the message is ABOUT: the dog is done and waiting to
 * be collected. `complete` stays allowed so a text can still be sent if
 * nobody got to it until after the dog was marked out.
 *
 * The rule lives here, in one place, because it was two copies of the same
 * line in routers.ts that let it drift from the board in the first place.
 */
export const PICKUP_MESSAGE_STATES: readonly string[] = ["ready", "complete"];

export function canSendPickupMessage(workflowState: string | null | undefined): boolean {
  return PICKUP_MESSAGE_STATES.includes((workflowState ?? "").trim());
}

/** Shown when the dog is not far enough along for a pickup text. */
export const PICKUP_MESSAGE_TOO_EARLY =
  "Pickup messages are available once the dog is marked ready";
