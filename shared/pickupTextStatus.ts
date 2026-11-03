/**
 * Has the owner been told their dog is ready?
 *
 * Lauren, 03/11/2026: "tracking down if the customers has been texted or
 * not. Can't tell from the workflow".
 *
 * The salon never had to ask this on the whiteboard, because sending the
 * text WAS writing on the whiteboard. In the app the send is recorded in
 * `smsLogs` and the board showed none of it, so the only way to answer was
 * to open each ready dog's pickup dialog in turn — which is the hunt she is
 * describing, on a board that can hold thirty dogs.
 *
 * Two decisions worth stating, because both could reasonably have gone the
 * other way:
 *
 * **Nothing shows before `ready`.** A dog still in the bath has not been
 * texted and should not have been, so a "not texted" marker on it is a
 * false alarm on most of the board for most of the day — which is how an
 * indicator gets ignored by the time it matters.
 *
 * **A dog that left untexted is reported quietly, not as a warning.** It is
 * normal: the owner was standing at the counter, or rang ahead. Flagging it
 * red would make the board shout about something nobody needs to do.
 */

/** The states where a pickup text is a thing that should have happened. */
const TELLABLE = new Set(["ready", "complete"]);

export type PickupTextStatus =
  /** Too early to ask — nothing is drawn. */
  | { show: false }
  /** Told, and when. */
  | { show: true; sent: true; at: Date }
  /**
   * Not told. `urgent` separates the dog still standing in the salon
   * waiting to be collected from the one that has already gone home.
   */
  | { show: true; sent: false; urgent: boolean };

export function pickupTextStatus(row: {
  workflowState: string | null | undefined;
  pickupTextSentAt: Date | string | number | null | undefined;
}): PickupTextStatus {
  const state = (row.workflowState ?? "").trim();
  if (!TELLABLE.has(state)) return { show: false };

  const at = toDate(row.pickupTextSentAt);
  if (at) return { show: true, sent: true, at };
  // `ready` is the dog in the salon with an owner who does not know.
  return { show: true, sent: false, urgent: state === "ready" };
}

/**
 * tRPC hands dates back through superjson, so this is usually already a
 * Date — but the board's optimistic local updates build rows by hand and a
 * cached payload can arrive as a string. An unparseable value is treated as
 * "no text", never as a text at the epoch.
 */
function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * How many ready dogs still have nobody told, for a count on the board
 * header — the number Lauren is actually after when she scans it.
 */
export function awaitingPickupText(rows: readonly {
  workflowState: string | null | undefined;
  pickupTextSentAt: Date | string | number | null | undefined;
}[]): number {
  return rows.reduce((n, row) => {
    const status = pickupTextStatus(row);
    return status.show && !status.sent && status.urgent ? n + 1 : n;
  }, 0);
}
