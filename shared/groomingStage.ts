/**
 * What a client is told their dog is up to.
 *
 * The salon runs a twelve-state workflow. A client gets six steps, and
 * Andy named them on 21/10/2026:
 *
 *   Checked-in · Bathing · Drying · Grooming · Ready for pickup · Picked up
 *
 * with one rule about what they must NOT see: "Client doesn't need to
 * see the potential delays in between each stage of the grooming cycle."
 *
 * That rule is why `waiting_for_dry` reads as Drying and
 * `waiting_for_groom` reads as Grooming, rather than "Waiting to be
 * dried" and "Waiting for the groomer" as they used to. A bathed dog in
 * the dryer queue is, from the owner's side, a dog being dried. The
 * queue is the salon's business: it is real, it is on the Pet Tracker's
 * staff board and in the workflow timing analytics, and it is of no use
 * to someone waiting at home except as something to worry about.
 *
 * `waiting_for_bath` is the exception and keeps its own description.
 * That stage is not a queue — the dog's nails, pads and sanitary are
 * being done before the bath. Staff call it Bath Prep too (see
 * shared/workflowStateLabels.ts). It sits on the Bathing step, because
 * the next thing to happen is the bath.
 *
 * No times, deliberately. The salon runs behind on a bad day and a
 * promised pickup time that slips is worse than no time at all — that is
 * a phone call, not a progress bar.
 *
 * Andy also flagged a likely change: "This may change to show when these
 * things are completed rather than in progress." `completedThrough` is
 * here for that. It is the last step genuinely FINISHED, which is a
 * different question from which step is current, and the two differ for
 * every state. A switch to a ticked-off list needs no new data.
 */

import { WORKFLOW_STAGE_COLOURS } from "./workflowStageColours";

/**
 * Each step carries the colour its stage wears on the staff board, so a
 * client and a groomer are looking at the same amber. `short` is for a
 * phone, where "Ready for pickup" across a sixth of a 375px screen
 * wraps to two ragged lines.
 */
export const GROOMING_STEPS = [
  { key: "checked_in", label: "Checked in", short: "Checked in", icon: "🚪", colour: WORKFLOW_STAGE_COLOURS.checked_in },
  { key: "bath", label: "Bathing", short: "Bath", icon: "🛁", colour: WORKFLOW_STAGE_COLOURS.bathing },
  { key: "dry", label: "Drying", short: "Dry", icon: "💨", colour: WORKFLOW_STAGE_COLOURS.drying },
  { key: "groom", label: "Grooming", short: "Groom", icon: "✂️", colour: WORKFLOW_STAGE_COLOURS.grooming },
  { key: "ready", label: "Ready for pickup", short: "Ready", icon: "🐾", colour: WORKFLOW_STAGE_COLOURS.ready },
  { key: "collected", label: "Picked up", short: "Picked up", icon: "✅", colour: WORKFLOW_STAGE_COLOURS.complete },
] as const;

export type GroomingStepKey = (typeof GROOMING_STEPS)[number]["key"];

/** How one step on the bar should render. */
export type StepStatus = "done" | "current" | "upcoming";

export type ClientFacingStage = {
  /**
   * Index into GROOMING_STEPS for the step the dog is on now, or -1
   * before it arrives and when the appointment is off track.
   */
  step: number;
  stepKey: GroomingStepKey | null;
  /**
   * Index of the last step actually COMPLETED, or -1 when none is. Not
   * simply `step - 1`: a collected dog has finished all six.
   */
  completedThrough: number;
  label: string;
  description: string;
  /** Nothing more will happen today. */
  finished: boolean;
  /** Cancelled or a no-show: show the state, not a progress bar. */
  offTrack: boolean;
  /** The dog is in the salon now, so the bar is worth showing. */
  onBar: boolean;
};

const S = (
  step: number,
  completedThrough: number,
  label: string,
  description: string,
  finished = false,
): ClientFacingStage => ({
  step,
  stepKey: step >= 0 ? GROOMING_STEPS[step].key : null,
  completedThrough,
  label,
  description,
  finished,
  offTrack: false,
  onBar: step >= 0,
});

const STAGES: Record<string, ClientFacingStage> = {
  // Not on the bar: nothing has happened, and six grey dots on the day
  // of a booking invite the question "why has nothing started".
  scheduled: { ...S(-1, -1, "Booked", "The appointment is confirmed."), onBar: false },

  checked_in: S(0, -1, "Checked in", "Your dog has arrived and is settling in."),

  // Real work, not a queue — hence its own description on the Bathing step.
  waiting_for_bath: S(1, 0, "Bath prep", "Having their nails, pads and tidy-up done before the bath."),
  bathing: S(1, 0, "Having a bath", "Your dog is being washed."),

  // Bathed and in the dryer queue. The client is told "drying", because
  // that is the next thing that happens and the queue is not theirs to
  // carry. Indistinguishable from `drying` on purpose.
  waiting_for_dry: S(2, 1, "Being dried", "Bathed, and on to the dryer."),
  drying: S(2, 1, "Being dried", "Your dog is being dried off."),

  // Same again: clean, dry, and the groomer is next.
  waiting_for_groom: S(3, 2, "With the groomer", "Clean, dry, and on to the groomer."),
  grooming: S(3, 2, "With the groomer", "Your dog is being groomed."),

  ready: S(4, 3, "Ready for pickup", "All done and waiting for you.", true),
  complete: S(5, 5, "Picked up", "Collected — see you next time.", true),
};

const OFF_TRACK: Record<string, ClientFacingStage> = {
  cancelled: { step: -1, stepKey: null, completedThrough: -1, label: "Cancelled", description: "This appointment was cancelled.", finished: true, offTrack: true, onBar: false },
  no_show: { step: -1, stepKey: null, completedThrough: -1, label: "Missed", description: "This appointment was missed.", finished: true, offTrack: true, onBar: false },
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

/**
 * How one step renders, given where the dog is.
 *
 * Driven by `completedThrough` rather than by `step`, so "done" means
 * finished and nothing else. That is the distinction Andy flagged might
 * matter later, and it costs nothing to get right now.
 */
export function stepStatus(stage: ClientFacingStage, index: number): StepStatus {
  if (index <= stage.completedThrough) return "done";
  if (index === stage.step) return "current";
  return "upcoming";
}

/**
 * True when the dog is in the salon and the bar should be on screen.
 *
 * **Includes `ready`.** It used to exclude it, because `ready` carries
 * `finished: true` and the old check tested that flag — so a dog sitting
 * on the bench waiting to be collected dropped off the client's live
 * card altogether, which is the one moment they most want to see. "Ready
 * for pickup" is one of the six steps; a dog that has reached it has not
 * left.
 *
 * `complete` is excluded: the dog has gone home.
 */
export function isGroomInProgress(workflowState: string | null | undefined): boolean {
  const stage = clientFacingStage(workflowState);
  if (stage.offTrack || !stage.onBar) return false;
  return stage.stepKey !== "collected";
}

/**
 * The emoji for the step a dog is on, or a paw before it arrives and
 * when the appointment is off track. Here rather than at the call sites
 * so the `step === -1` case is handled once.
 */
export function stageIcon(stage: ClientFacingStage): string {
  return stage.onBar ? GROOMING_STEPS[stage.step].icon : "\u{1F43E}";
}

/**
 * The colour of the step a dog is on, for the headline above the bar.
 * Slate before it arrives and when the appointment is off track, which
 * is the same thing the board shows for those states.
 */
export function stageColourFor(stage: ClientFacingStage): string {
  return stage.onBar ? GROOMING_STEPS[stage.step].colour : WORKFLOW_STAGE_COLOURS.scheduled;
}
