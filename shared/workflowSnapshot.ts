/**
 * The dashboard's "Workflow right now" card, as numbers.
 *
 * Andy, 04/11/2026: "Make the mini-workflow snapshot on the dashboard
 * more detailed and better looking. It's very basic."
 *
 * It was also WRONG, which is the part worth fixing first. The card
 * listed six states — scheduled, checked_in, bathing, grooming, ready,
 * complete — out of the twelve the workflow actually has. Every dog
 * sitting in `waiting_for_bath`, `waiting_for_dry`, `drying` or
 * `waiting_for_groom` was invisible. On the morning this was written
 * that was 5 of 37 dogs: two waiting for a groomer and two on the
 * dryer, none of them anywhere on the card.
 *
 * A snapshot whose numbers do not add up to the day is worse than a
 * plain one, because somebody reads it and believes it.
 *
 * So this works from the full state machine, reports only the stages
 * that actually have dogs in them, and carries the totals the card
 * needs to say where the day is up to.
 */

/** The 12-state machine, in the order a dog moves through it. */
export const WORKFLOW_ORDER = [
  "scheduled",
  "checked_in",
  "waiting_for_bath",
  "bathing",
  "waiting_for_dry",
  "drying",
  "waiting_for_groom",
  "grooming",
  "ready",
  "complete",
] as const;

export type WorkflowStage = (typeof WORKFLOW_ORDER)[number];

/** Not coming. Counted, but never part of the day's progress. */
const NOT_COMING = new Set(["cancelled", "no_show"]);

/** Arrived and not yet finished. */
const IN_SALON = new Set<string>([
  "checked_in", "waiting_for_bath", "bathing",
  "waiting_for_dry", "drying", "waiting_for_groom", "grooming",
]);

export const STAGE_LABEL: Record<WorkflowStage, string> = {
  scheduled: "To come",
  checked_in: "Checked in",
  waiting_for_bath: "Waiting for bath",
  bathing: "Bathing",
  waiting_for_dry: "Waiting to dry",
  drying: "Drying",
  waiting_for_groom: "Waiting for groom",
  grooming: "Grooming",
  ready: "Ready",
  complete: "Collected",
};

export type SnapshotDog = {
  workflowState: string;
  petName?: string | null;
};

export type StageGroup = {
  stage: WorkflowStage;
  label: string;
  count: number;
  /** Names, for the card to show who. Capped by the caller's `names`. */
  petNames: string[];
};

export type WorkflowSnapshot = {
  /** Dogs booked today who are actually coming. */
  expected: number;
  notArrived: number;
  inSalon: number;
  ready: number;
  collected: number;
  notComing: number;
  /** Only the stages with at least one dog, in workflow order. */
  stages: StageGroup[];
  /** 0–1, how much of the day is finished. 0 when nothing is expected. */
  progress: number;
};

export function workflowSnapshot(
  dogs: readonly SnapshotDog[],
  options: { names?: number } = {},
): WorkflowSnapshot {
  const nameCap = options.names ?? 3;

  const byStage = new Map<WorkflowStage, string[]>();
  let notComing = 0;
  for (const dog of dogs) {
    const state = (dog.workflowState ?? "").trim();
    if (NOT_COMING.has(state)) { notComing += 1; continue; }
    /*
     * An unrecognised state is counted nowhere rather than guessed at.
     * The alternative — folding it into "to come" — is how a dog ends
     * up on a card in a stage it is not in.
     */
    if (!(WORKFLOW_ORDER as readonly string[]).includes(state)) continue;
    const stage = state as WorkflowStage;
    const names = byStage.get(stage) ?? [];
    const name = (dog.petName ?? "").trim();
    if (name) names.push(name);
    byStage.set(stage, names);
  }

  const countOf = (stage: WorkflowStage) =>
    dogs.filter((d) => (d.workflowState ?? "").trim() === stage).length;

  const stages: StageGroup[] = WORKFLOW_ORDER
    .map((stage) => ({
      stage,
      label: STAGE_LABEL[stage],
      count: countOf(stage),
      petNames: (byStage.get(stage) ?? []).slice(0, nameCap),
    }))
    .filter((g) => g.count > 0);

  const notArrived = countOf("scheduled");
  const ready = countOf("ready");
  const collected = countOf("complete");
  const inSalon = WORKFLOW_ORDER
    .filter((s) => IN_SALON.has(s))
    .reduce((sum, s) => sum + countOf(s), 0);
  const expected = notArrived + inSalon + ready + collected;

  return {
    expected,
    notArrived,
    inSalon,
    ready,
    collected,
    notComing,
    stages,
    // Ready counts as done: the groom is finished and the dog is only
    // waiting to be picked up, which is the owner's half of the day.
    progress: expected === 0 ? 0 : (ready + collected) / expected,
  };
}

/** "and 2 more" for a stage with more dogs than the card can name. */
export function describeExtra(count: number, shown: number): string | null {
  const extra = count - shown;
  return extra > 0 ? `+${extra} more` : null;
}
