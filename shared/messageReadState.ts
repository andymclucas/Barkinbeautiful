/**
 * Read state and assignment for the things that arrive from a client: an
 * inbound SMS, and a voicemail from a missed call.
 *
 * Two facts that look like one. "Has anyone dealt with this" changes all day;
 * "who opened it first, and when" must never change, because it is the only
 * accountability there is for a voicemail somebody looked at and did not
 * return. Marking unread by nulling `readAt` would erase it.
 *
 * So:
 *   readAt / readByUserId            — the CURRENT state. Cleared by unread.
 *   firstReadAt / firstReadByUserId  — written once, never touched again.
 *
 * Keeping `readAt` as the live flag is deliberate: every existing unread
 * count and badge already filters on `readAt IS NULL`, so none of them need
 * to learn anything new.
 *
 * Assignment points at `staff`, not `users`. A voicemail is handed to a
 * groomer on the floor, who may have no login at all — `staff.role` is the
 * salon's own structure and `users.role` is the platform's. At multi-location
 * this also has to mean "staff at the site that took the call"; there is no
 * locations table yet, so for now it means staff of the same tenant, and the
 * check below is the place that will need to grow.
 */

export type MessageReadRow = {
  readAt: Date | null;
  readByUserId: number | null;
  firstReadAt: Date | null;
  firstReadByUserId: number | null;
};

export type AssignableStaff = {
  id: number;
  tenantId: number;
  /** Drizzle gives boolean; a raw mysql2 read can give 0/1 or "0". */
  isActive?: boolean | number | string | null;
  /** `staff.role` — the salon's own structure, not the platform's. */
  role?: string | null;
};

/**
 * Only the grooming side returns calls and messages.
 *
 * The bathing team works the floor and does not ring clients back, so putting
 * them in the picker offers a handover that will not happen. It also happens
 * to remove every staff member with no login, which is why the picker no
 * longer has to explain that an assignment cannot reach them.
 *
 * This is a product rule, not a law of grooming: another salon may well have
 * its bathers answering the phone. When this becomes configurable it belongs
 * in tenant settings, and this function is the one place that has to change.
 */
export function canReturnCalls(role: string | null | undefined): boolean {
  return !isBatherRole(role);
}

function isBatherRole(role: string | null | undefined): boolean {
  return String(role ?? "").trim().toLowerCase() === "bather";
}

/** What the badges and the unread filter mean by unread. */
export function isUnread(row: Pick<MessageReadRow, "readAt">): boolean {
  return row.readAt === null || row.readAt === undefined;
}

/**
 * Opening it. Stamps the current state, and the first-read audit only if
 * nothing has claimed it yet — so a second reader never overwrites the first.
 */
export function markReadPatch(
  row: Pick<MessageReadRow, "firstReadAt">,
  userId: number,
  now: Date = new Date(),
): Partial<MessageReadRow> {
  const patch: Partial<MessageReadRow> = { readAt: now, readByUserId: userId };
  if (!row.firstReadAt) {
    patch.firstReadAt = now;
    patch.firstReadByUserId = userId;
  }
  return patch;
}

/**
 * Putting it back in the queue. Clears only the live state.
 *
 * Deliberately returns no firstRead* keys at all rather than returning them
 * unchanged: a patch that cannot express "clear the audit" cannot do it by
 * accident either.
 */
export function markUnreadPatch(): Partial<MessageReadRow> {
  return { readAt: null, readByUserId: null };
}

/**
 * Whether a staff member may be handed this row.
 *
 * Tenant first — assigning across salons is the multi-tenant leak this whole
 * feature could introduce. Inactive staff are refused because an assignment
 * to someone who has left reads as handled and is not.
 */
export function canAssignTo(
  staff: AssignableStaff | null | undefined,
  rowTenantId: number,
): { ok: true } | { ok: false; reason: string } {
  if (!staff) return { ok: false, reason: "That staff member no longer exists" };
  if (staff.tenantId !== rowTenantId) {
    return { ok: false, reason: "That staff member belongs to another salon" };
  }
  const active = staff.isActive;
  if (active === false || active === 0 || active === "0") {
    return { ok: false, reason: "That staff member is no longer active" };
  }
  // Enforced here and not only in the picker: a rule that lives in the UI is
  // not a rule, it is a default.
  if (!canReturnCalls(staff.role)) {
    return { ok: false, reason: "The bathing team does not return calls or messages" };
  }
  return { ok: true };
}

/**
 * One line for the UI, so the read history survives being marked unread on
 * screen as well as in the database.
 */
export function describeReadState(
  row: MessageReadRow,
  nameFor: (userId: number) => string | null,
): string {
  // Lower-cased lead-in only — lower-casing the whole clause would lower-case
  // the person's name with it.
  const first = row.firstReadAt
    ? `first read by ${nameFor(row.firstReadByUserId ?? -1) ?? "someone"}`
    : null;
  if (isUnread(row)) return first ? `Unread — ${first}` : "Unread";

  const current = `Read by ${nameFor(row.readByUserId ?? -1) ?? "someone"}`;
  // Only worth naming the first reader separately when it was someone else.
  if (first && row.firstReadByUserId !== row.readByUserId) return `${current} — ${first}`;
  return current;
}
