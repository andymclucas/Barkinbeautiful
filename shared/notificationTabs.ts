/**
 * One bell, three tabs.
 *
 * Andy, 19/11/2026, with MoeGo's notification panel open: "merge the two
 * notifications icons at the top (system and messages) under the one, but
 * then have a branch under that for the following: Messages - portal or
 * client messages and missed calls/voice mails. System - clients signed up
 * to portal or any system related issues. Payments - failed payments for
 * memberships or any Stripe issues that needs flagging."
 *
 * There were two icons: the bell (messages, calls, failed payments, work
 * handed to you, answers to problem reports, all in one scroll) and a
 * shield beside it for the owner's system record. They were kept apart so
 * a record that needs nobody would not train people to dismiss work. Tabs
 * keep that separation and give payments a place of their own.
 *
 * This file decides what each tab counts and which one opens first, so the
 * badge on the bell and the numbers on the tabs cannot disagree.
 */
export const NOTIFICATION_TABS = ["messages", "system", "payments"] as const;
export type NotificationTab = (typeof NOTIFICATION_TABS)[number];

export const NOTIFICATION_TAB_LABEL: Record<NotificationTab, string> = {
  messages: "Messages",
  system: "System",
  payments: "Payments",
};

export type NotificationCounts = {
  /** Unread client and portal messages, missed calls and voicemails. */
  unreadMessages: number;
  /** Conversations and calls handed to this person by name. */
  assignedToMe: number;
  /** Unread system notices (portal sign-ups, access changes). Owners only; 0 for everyone else. */
  unreadSystem: number;
  /** Answers to problems this person reported. */
  reportUpdates: number;
  /** Memberships with a failed payment. */
  failedPayments: number;
};

export function notificationTabCounts(counts: NotificationCounts): Record<NotificationTab, number> {
  const n = (value: number) => (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
  return {
    messages: n(counts.unreadMessages) + n(counts.assignedToMe),
    system: n(counts.unreadSystem) + n(counts.reportUpdates),
    payments: n(counts.failedPayments),
  };
}

/** The number on the bell: everything, once. */
export function notificationTotal(counts: NotificationCounts): number {
  const tabs = notificationTabCounts(counts);
  return tabs.messages + tabs.system + tabs.payments;
}

/**
 * The tab to show when the bell is opened.
 *
 * Money first: a failed payment is the one that costs the salon if it is
 * missed, and it used to sit under six voicemails. Then messages, which are
 * work. System last, because it is a record. With nothing unread anywhere,
 * Messages, where people go to look.
 */
export function firstNotificationTab(counts: NotificationCounts): NotificationTab {
  const tabs = notificationTabCounts(counts);
  if (tabs.payments > 0) return "payments";
  if (tabs.messages > 0) return "messages";
  if (tabs.system > 0) return "system";
  return "messages";
}

/** "9+" past nine, as the badge has always shown it. */
export function badgeText(count: number): string {
  return count > 9 ? "9+" : String(count);
}

/**
 * Portal conversations that are waiting on the salon.
 *
 * Andy, 19/11/2026: "Messages - portal or client messages and missed
 * calls/voice mails." The bell only ever read text messages and missed
 * calls; a message a client sent through their portal lives in its own
 * thread and never reached it. A thread counts once, however many messages
 * the client sent, because it is one conversation to answer.
 */
export type PortalThreadSummary = { id: number; unread?: number | null };

export function unreadPortalThreads<T extends PortalThreadSummary>(threads: readonly T[] | null | undefined): T[] {
  return (threads ?? []).filter((thread) => (thread.unread ?? 0) > 0);
}
