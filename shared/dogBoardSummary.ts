/**
 * Everything worth knowing about a dog on the board, in one shape.
 *
 * Andy, 22/10/2026: "When hovering over a dog, ensure all details
 * including grooming notes, add-ons, time out etc are shown. Also once
 * clicked, full detailed notes of the dog are showing."
 *
 * Two surfaces, one source. The hover card is a summary and the dialog
 * is the full thing, but both answer the same questions in the same
 * order, and a groomer who reads one must not find the other says
 * something different. Assembling it here — rather than twice in JSX —
 * is what makes that true, and lets the ordering be tested.
 *
 * The ordering is deliberate and is the order a groomer needs it:
 *
 *   1. Anything that could hurt somebody or the dog.
 *   2. When it has to be gone.
 *   3. What has been sold — the groom and the extras.
 *   4. How this dog is to be cut.
 *   5. Notes typed on the day.
 *
 * A bite risk discovered below a note about nail polish is a bite risk
 * discovered too late.
 */

import { shortAddOnLabel, describeAddOns } from "./addOnBoardLabel";
import { collectByStatus, type CollectByStatus } from "./collectBy";
import type { DogSizeBand } from "./dogSizeBand";

export type DogBoardRow = {
  petName?: string | null;
  petBreed?: string | null;
  petAlertLevel?: string | null;
  petWarnings?: string | null;
  petSizeBand?: DogSizeBand | null;
  serviceType?: string | null;
  workflowState?: string | null;
  collectBy?: Date | string | null;
  addOns?: readonly { name: string; quantity?: number }[] | null;
  groomStyleNote?: string | null;
  groomStyleWarnings?: string | null;
  notes?: string | null;
  workflowAddOns?: string | null;
  staffName?: string | null;
  petMoegoCodeLabels?: string | null;
};

export type DogBoardSummary = {
  /** Danger or caution, with whatever text explains it. Null when neither. */
  alert: { level: "danger" | "caution"; text: string | null } | null;
  /** The out-time and how it is tracking, or null when there is no deadline. */
  collect: CollectByStatus | null;
  /** Short badge text for each extra, in booking order. */
  addOnBadges: string[];
  /** The same extras written out, for a tooltip or a message. */
  addOnLine: string;
  /** How this dog is cut — the groomer's own standing note. */
  styleNote: string | null;
  /** Warnings recorded with the style note, which are not the pet alert. */
  styleWarnings: string | null;
  /** Notes typed against today's appointment. */
  appointmentNotes: string | null;
  /** The free-text scribble on the board, kept apart from the sold extras. */
  boardNote: string | null;
  /** MoeGo's own tags, split out of the comma-joined string. */
  codes: string[];
  /** True when there is nothing at all to show, so a card can say so. */
  isEmpty: boolean;
};

function clean(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export function dogBoardSummary(row: DogBoardRow, now = new Date()): DogBoardSummary {
  const level = String(row.petAlertLevel ?? "").toLowerCase();
  const alert = level === "danger" || level === "caution"
    ? { level: level as "danger" | "caution", text: clean(row.petWarnings) }
    : null;

  const status = collectByStatus({
    collectBy: row.collectBy ?? null,
    workflowState: String(row.workflowState ?? "scheduled"),
    sizeBand: row.petSizeBand ?? null,
    now,
  });

  const addOns = (row.addOns ?? []).filter((a) => clean(a?.name) !== null);

  const codes = String(row.petMoegoCodeLabels ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  const summary: DogBoardSummary = {
    alert,
    collect: status.risk === "none" ? null : status,
    addOnBadges: addOns.map((a) => shortAddOnLabel(a.name)),
    addOnLine: describeAddOns(addOns),
    styleNote: clean(row.groomStyleNote),
    styleWarnings: clean(row.groomStyleWarnings),
    appointmentNotes: clean(row.notes),
    boardNote: clean(row.workflowAddOns),
    codes,
    isEmpty: false,
  };

  summary.isEmpty =
    !summary.alert
    && !summary.collect
    && summary.addOnBadges.length === 0
    && !summary.styleNote
    && !summary.styleWarnings
    && !summary.appointmentNotes
    && !summary.boardNote
    && summary.codes.length === 0;

  return summary;
}
