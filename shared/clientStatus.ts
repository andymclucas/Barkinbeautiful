import { CLIENT_LIST_MAX_PAGE_SIZE } from "./clientList";

/**
 * What a client's status means, and which of them a person may choose.
 *
 * `clients.status` has held four values since the schema was written —
 * active, inactive, lapsed, blocked — and the Clients page has filtered
 * and sorted on all four for just as long. Nothing ever set one. There
 * was no setter procedure, no control on the client record, and the MoeGo
 * import did not write it either, so all ~10,000 clients sat on the
 * `active` default and three of the four filter options could not match a
 * row. Found 07/11/2026, when Andy asked whether the filtering worked.
 *
 * ## `lapsed` is computed, never chosen
 *
 * This is the part worth reading before adding it back to a dropdown.
 *
 * "Who has stopped coming" is already answered properly, by
 * shared/lapsedClients.ts on the Reporting page: measured against each
 * household's OWN rhythm rather than one salon-wide number of weeks,
 * counting a visit as a DAY rather than an appointment so a two-dog
 * household is not read as lapsed the moment it is a day late, and
 * ignoring gaps under a week so four grooms in four days is not taken
 * for a one-day cadence.
 *
 * A column cannot say any of that. If staff could also set `lapsed` by
 * hand there would be two answers to the same question — one typed, one
 * computed — and they would disagree the first time somebody rebooked.
 * So `lapsed` stays out of the settable list, the Clients page sends you
 * to the report instead, and the value remains in the enum because
 * removing it from a MySQL enum is a data migration for no gain.
 *
 * Andy chose this on 07/11/2026, offered against a manual `lapsed` and
 * against a job that derives the column nightly.
 */

/** Every value the column can hold. Order matches the MySQL enum. */
export const CLIENT_STATUSES = ["active", "inactive", "lapsed", "blocked"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

/**
 * The ones a person may pick on the client record.
 *
 * Deliberately three, not four. See the note above on `lapsed`.
 */
export const SETTABLE_CLIENT_STATUSES = ["active", "inactive", "blocked"] as const;
export type SettableClientStatus = (typeof SETTABLE_CLIENT_STATUSES)[number];

/**
 * Most clients one bulk status change may touch.
 *
 * Sized from the largest page on the Clients list, so "select this page,
 * mark them inactive" always fits in one call and nothing larger can be
 * attempted. Derived rather than written as 500, because a bigger page
 * size added later would otherwise build a selection the server refuses
 * and the change would fail as a whole. The cap matters more than it looks:
 * the salon has ~10,000 clients and the realistic mistake is selecting
 * far more than you meant to, which is unpickable afterwards because the
 * previous value is not recorded anywhere.
 */
export const CLIENT_STATUS_BULK_MAX = CLIENT_LIST_MAX_PAGE_SIZE;

export function isSettableClientStatus(value: unknown): value is SettableClientStatus {
  return typeof value === "string"
    && (SETTABLE_CLIENT_STATUSES as readonly string[]).includes(value);
}

/**
 * What each status means, in the words the client record shows.
 *
 * Kept here rather than in the component so the label and the rule cannot
 * drift apart — the old messaging card is what hand-written copy beside a
 * rule turns into.
 */
export const CLIENT_STATUS_COPY: Record<ClientStatus, { label: string; meaning: string }> = {
  active: {
    label: "Active",
    meaning: "A current client. Books, gets marketing, counts in the salon's figures.",
  },
  inactive: {
    label: "Inactive",
    meaning:
      "Moved away, or asked to be taken off the books. Kept for their history"
      + " rather than deleted, and left out of marketing.",
  },
  blocked: {
    label: "Blocked",
    meaning:
      "Do not market to this client. It does NOT stop a booking — a real"
      + " do-not-book belongs on the dog as a warning, where staff see it at"
      + " booking time.",
  },
  lapsed: {
    label: "Lapsed",
    meaning:
      "Worked out from their visit history on the Reporting page, not set by"
      + " hand, so it cannot be chosen here.",
  },
};
