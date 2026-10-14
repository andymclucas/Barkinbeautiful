/**
 * Things the SALON should know, as distinct from work a person must do.
 *
 * The bell already has "Assigned to you" (yours), Payments (money that did
 * not arrive) and Messages & calls (someone is waiting). A client finishing
 * their portal signup is none of those: nobody has to act, but everyone
 * would like to know. Hence its own heading rather than a fourth thing in
 * the message list, where it would be read as an unanswered customer.
 *
 * Read state is salon-wide on purpose. Once anybody has seen that Jane set
 * her portal up, the salon has seen it.
 */

export const SYSTEM_NOTIFICATION_KINDS = [
  "client_portal_activated",
  "staff_invited",
  "staff_account_created",
  /**
   * The one kind here that is WORK, not news.
   *
   * Everything else in this feed is something that already happened and
   * needs nobody. A sign-up request is a client waiting: no money moves
   * and no slot is held until somebody approves it, so the copy says so
   * plainly rather than reading like another thing already dealt with.
   */
  "membership_signup_requested",
] as const;
export type SystemNotificationKind = (typeof SYSTEM_NOTIFICATION_KINDS)[number];

export function isSystemNotificationKind(value: unknown): value is SystemNotificationKind {
  return typeof value === "string" && (SYSTEM_NOTIFICATION_KINDS as readonly string[]).includes(value);
}

export type SystemNotificationRow = {
  kind: SystemNotificationKind | string;
  clientFirstName?: string | null;
  clientLastName?: string | null;
  petNames?: readonly string[] | null;
  /** Free text written when the row was created: who, and in what role. */
  detail?: string | null;
  /** Who caused it. Null when the actor is not a platform user. */
  actorName?: string | null;
};

/** "Rosie and Teddy", "Rosie, Teddy and Tyson", "" for none. */
export function listNames(names: readonly string[] | null | undefined): string {
  const clean = (names ?? []).map((n) => String(n ?? "").trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}

export function clientDisplayName(row: SystemNotificationRow): string {
  const name = `${row.clientFirstName ?? ""} ${row.clientLastName ?? ""}`.trim();
  return name || "A client";
}

/**
 * The headline and the line under it.
 *
 * The dogs are named because that is how the salon identifies a client —
 * "Jane Smith" means little at a glance, "Rosie and Teddy" is immediate.
 * A client with no dogs on file still gets a sentence rather than a dangling
 * "for ".
 */
export function describeSystemNotification(row: SystemNotificationRow): { title: string; detail: string } {
  const who = clientDisplayName(row);
  switch (row.kind) {
    case "client_portal_activated": {
      const dogs = listNames(row.petNames);
      return {
        title: `${who} set up their client portal`,
        detail: dogs ? `They can now see ${dogs}'s appointments, grooming cards and invoices.`
                     : "They can now see their appointments, grooming cards and invoices.",
      };
    }
    case "membership_signup_requested": {
      const dogs = listNames(row.petNames);
      return {
        title: `${who} asked to join a membership`,
        // The detail line carries the plan and the weekly figure, written
        // at request time — whoever opens the bell should be able to
        // decide whether to look without opening the request.
        detail: [
          dogs ? `For ${dogs}.` : null,
          row.detail,
          "Nothing is charged and no appointments are held until you approve it.",
        ].filter(Boolean).join(" "),
      };
    }
    case "staff_invited":
      return {
        title: row.detail ? `${row.detail} was invited to the platform` : "Someone was invited to the platform",
        detail: by(row, "They have not accepted yet."),
      };
    case "staff_account_created":
      return {
        title: row.detail ? `${row.detail} now has a login` : "A new login was created",
        detail: by(row, "They can sign in from now on."),
      };
    default:
      // A kind added to the database but not yet to this file should still
      // render as something, rather than a blank row nobody can explain.
      return { title: `${who} — ${String(row.kind).replace(/_/g, " ")}`, detail: "" };
  }
}

/** "Invited by Lauren Romari." — or the plain sentence when nobody is named. */
function by(row: SystemNotificationRow, fallback: string): string {
  return row.actorName ? `Added by ${row.actorName}. ${fallback}` : fallback;
}
