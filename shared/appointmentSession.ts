import { dateTimeFormat } from "./intlCache";
/**
 * Returns the requested pets that are not already represented in a shared
 * appointment session. Order is preserved and repeated requests are ignored.
 */
export function getNewSharedSessionPetIds(existingPetIds: number[], requestedPetIds: number[]): number[] {
  const existing = new Set(existingPetIds);
  const added = new Set<number>();
  return requestedPetIds.filter((petId) => {
    if (existing.has(petId) || added.has(petId)) return false;
    added.add(petId);
    return true;
  });
}

/**
 * A dog that is on the booking's paperwork but not standing with it.
 *
 * Lauren, 19/11/2026: a two-dog booking showed one dog. She tried to add
 * the other and was told "Those dogs are already in this booking" — "Its
 * saying its there.. but sonny isnt there". He was on the booking: the
 * same session. But a session is only a label, and a dog can carry it
 * while sitting at another time or another day (one dog moved, the other
 * left behind) or while marked as not coming. The add path counted every
 * row with the label as "already here", so it refused without saying
 * where the dog was, and there was nothing on screen to find him by.
 *
 * So the session's rows are sorted three ways before anything is added:
 * really here (live, same start), elsewhere (live, another start), and
 * not coming (cancelled or no-show at this start). Only "really here" is
 * quietly skipped. The other two are refused with where the dog is and
 * what to press, because adding a second row for a dog that already has
 * one on this booking is how a dog ends up on the board twice.
 */
export type SessionMember = {
  petId: number;
  petName?: string | null;
  status?: string | null;
  workflowState?: string | null;
  scheduledStart: Date | string | number;
};

const DEAD = new Set(["cancelled", "no_show"]);
const isDead = (m: SessionMember) => DEAD.has(String(m.status)) || DEAD.has(String(m.workflowState));
const startMs = (value: Date | string | number) => (value instanceof Date ? value : new Date(value)).getTime();

export type SessionAddSort = {
  /** Live on this booking at this time: nothing to do. */
  alreadyHere: number[];
  /** Live on this booking, but at another time or day. */
  elsewhere: SessionMember[];
  /** On this booking at this time, marked cancelled or no-show. */
  notComing: SessionMember[];
};

export function sortRequestedSessionPets(
  sourceStart: Date | string | number,
  members: readonly SessionMember[],
  requestedPetIds: readonly number[],
): SessionAddSort {
  const at = startMs(sourceStart);
  const result: SessionAddSort = { alreadyHere: [], elsewhere: [], notComing: [] };
  for (const petId of Array.from(new Set(requestedPetIds))) {
    const rows = members.filter((m) => m.petId === petId);
    const live = rows.filter((m) => !isDead(m));
    if (live.some((m) => startMs(m.scheduledStart) === at)) {
      result.alreadyHere.push(petId);
      continue;
    }
    if (live.length > 0) {
      result.elsewhere.push(live[0]);
      continue;
    }
    const cancelledHere = rows.find((m) => startMs(m.scheduledStart) === at);
    if (cancelledHere) result.notComing.push(cancelledHere);
  }
  return result;
}

/** "Thu 19 Nov, 12:30 pm", assembled from parts so the wording does not move with the ICU version. */
const whenInBrisbane = (value: Date | string | number) => {
  const parts = dateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(startMs(value)));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}, ${get("hour")}:${get("minute")} ${get("dayPeriod").toLowerCase()}`;
};

/** What to tell staff when a dog cannot simply be added, or "" when it can. */
export function sessionAddRefusal(sort: Pick<SessionAddSort, "elsewhere" | "notComing">): string {
  const parts: string[] = [];
  for (const m of sort.elsewhere) {
    const name = m.petName?.trim() || "That dog";
    parts.push(`${name} is part of this booking but is at ${whenInBrisbane(m.scheduledStart)}. Move that booking here instead of adding a second one.`);
  }
  for (const m of sort.notComing) {
    const name = m.petName?.trim() || "That dog";
    parts.push(`${name} is on this booking but marked as not coming. Use "Put back on" in the booking's list of dogs.`);
  }
  return parts.join(" ");
}
