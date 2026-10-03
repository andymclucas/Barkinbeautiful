/**
 * What a client is told their dog is up to.
 *
 * The salon runs a twelve-state workflow; a client does not care about
 * the difference between "waiting for dry" and "drying" except that one
 * means their dog is in a queue. So the twelve collapse to six steps,
 * with a flag for "in the queue for this step rather than having it
 * done".
 *
 * No times, deliberately. The salon runs behind on a bad day and a
 * promised pickup time that slips is worse than no time at all — that is
 * a phone call, not a progress bar.
 *
 * This existed only inside PetTracker.tsx and mapped six of the twelve
 * states, so `drying`, `waiting_for_dry`, `waiting_for_bath` and
 * `waiting_for_groom` all fell through to index 0 and told the client
 * "Appointment Booked" while their dog was under the dryer.
 */

export const GROOMING_STEPS = [
  { key: "booked", label: "Booked", icon: "📅" },
  { key: "checked_in", label: "Checked in", icon: "🚪" },
  { key: "bath", label: "Bath", icon: "🛁" },
  { key: "dry", label: "Drying", icon: "💨" },
  { key: "groom", label: "Grooming", icon: "✂️" },
  { key: "ready", label: "Ready for pickup", icon: "🐾" },
] as const;

export type GroomingStepKey = (typeof GROOMING_STEPS)[number]["key"];

export type ClientFacingStage = {
  /** Index into GROOMING_STEPS, or -1 when the appointment is off-track. */
  step: number;
  stepKey: GroomingStepKey | null;
  /** In the queue for this step rather than having it under way. */
  waiting: boolean;
  label: string;
  description: string;
  /** Nothing more will happen today. */
  finished: boolean;
  /** Cancelled or a no-show: show the state, not a progress bar. */
  offTrack: boolean;
};

const S = (
  step: number,
  waiting: boolean,
  label: string,
  description: string,
  finished = false,
): ClientFacingStage => ({
  step,
  stepKey: step >= 0 ? GROOMING_STEPS[step].key : null,
  waiting,
  label,
  description,
  finished,
  offTrack: false,
});

const STAGES: Record<string, ClientFacingStage> = {
  scheduled: S(0, false, "Booked", "The appointment is confirmed."),
  checked_in: S(1, false, "Checked in", "Your dog has arrived and is settling in."),
  waiting_for_bath: S(1, true, "Waiting for a bath", "Settled in and next up for a bath."),
  bathing: S(2, false, "Having a bath", "Your dog is being washed."),
  waiting_for_dry: S(2, true, "Waiting to be dried", "Bathed, and waiting for the dryer."),
  drying: S(3, false, "Being dried", "Your dog is being dried off."),
  waiting_for_groom: S(3, true, "Waiting for the groomer", "Clean, dry, and waiting for the groomer."),
  grooming: S(4, false, "With the groomer", "Your dog is being groomed."),
  ready: S(5, false, "Ready for pickup", "All done and waiting for you.", true),
  complete: S(5, false, "Picked up", "Collected — see you next time.", true),
};

const OFF_TRACK: Record<string, ClientFacingStage> = {
  cancelled: { step: -1, stepKey: null, waiting: false, label: "Cancelled", description: "This appointment was cancelled.", finished: true, offTrack: true },
  no_show: { step: -1, stepKey: null, waiting: false, label: "Missed", description: "This appointment was missed.", finished: true, offTrack: true },
};

/**
 * An unknown state returns the booked stage rather than throwing: a new
 * workflow state added later must not blank a client's page, and "Booked"
 * is the one claim that is safe before anything has happened.
 */
export function clientFacingStage(workflowState: string | null | undefined): ClientFacingStage {
  if (!workflowState) return STAGES.scheduled;
  return OFF_TRACK[workflowState] ?? STAGES[workflowState] ?? STAGES.scheduled;
}

/** True once there is something worth watching today. */
export function isGroomInProgress(workflowState: string | null | undefined): boolean {
  const stage = clientFacingStage(workflowState);
  return !stage.offTrack && !stage.finished && stage.step > 0;
}
