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

export const SYSTEM_NOTIFICATION_KINDS = ["client_portal_activated"] as const;
export type SystemNotificationKind = (typeof SYSTEM_NOTIFICATION_KINDS)[number];

export function isSystemNotificationKind(value: unknown): value is SystemNotificationKind {
  return typeof value === "string" && (SYSTEM_NOTIFICATION_KINDS as readonly string[]).includes(value);
}

export type SystemNotificationRow = {
  kind: SystemNotificationKind | string;
  clientFirstName?: string | null;
  clientLastName?: string | null;
  petNames?: readonly string[] | null;
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
    default:
      // A kind added to the database but not yet to this file should still
      // render as something, rather than a blank row nobody can explain.
      return { title: `${who} — ${String(row.kind).replace(/_/g, " ")}`, detail: "" };
  }
}
