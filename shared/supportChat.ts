/**
 * Support chat: the bubble in the bottom-right corner of every staff screen.
 *
 * Andy, 13/11/2026: "Build in an AI support chat feature down the bottom
 * right corner that will first try to resolve the issue using AI, then if
 * someone requests to speak to a human, it will setup a chat with me."
 *
 * The assistant is called Bruce and is drawn as a chihuahua in a
 * sombrero (client/src/components/BruceAvatar.tsx). Andy, 13/11/2026.
 *
 * A conversation is in one of four states:
 *
 *   ai       the assistant answers each message
 *   waiting  a person was asked for; nobody from support has replied yet
 *   human    support has replied, and the assistant stays out of it
 *   closed   finished; the next message starts a new conversation
 *
 * Once a person has been asked for, the assistant never speaks again in
 * that conversation. Somebody who asked for a human and then gets another
 * machine answer has been ignored.
 *
 * Support is Groomigo's, not the salon's: the person on the other end is
 * whoever is in SUPPORT_AGENT_USER_IDS, for every salon. That is why the
 * inbox reads across tenants and is guarded by this list rather than by a
 * salon role.
 */

export const SUPPORT_AGENT_USER_IDS: readonly number[] = [
  30001, // Andy McLucas
];

export function canAnswerSupport(user: { id?: number | null } | null | undefined): boolean {
  return typeof user?.id === "number" && SUPPORT_AGENT_USER_IDS.includes(user.id);
}

export const SUPPORT_STATUSES = ["ai", "waiting", "human", "closed"] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];
export type SupportSender = "user" | "ai" | "human" | "system";

export const SUPPORT_MESSAGE_MAX = 2000;

/** How much of the conversation the assistant is shown. */
export const SUPPORT_HISTORY_LIMIT = 30;

/** Statuses in which a person owns the conversation. */
export function isWithPerson(status: SupportStatus): boolean {
  return status === "waiting" || status === "human";
}

/**
 * A plain request for a person, caught without the model.
 *
 * The assistant is also asked to flag this, and the window has a "Talk to
 * a person" button. This is the net under both: "can I speak to a human"
 * must hand over even when the model misreads it or is unavailable.
 * Deliberately narrow — it needs a word for a person AND a word for
 * reaching them, so "the human resources page" does not trip it.
 */
export function asksForPerson(text: string): boolean {
  const t = text.toLowerCase();
  const person = /\b(human|person|someone|somebody|real (person|human)|andy|support (team|staff|person)|agent|operator)\b/;
  const reach = /\b(speak|talk|chat|call|contact|get|reach|connect|put me|transfer|pass)\b/;
  return person.test(t) && reach.test(t);
}

/** What the system says in the conversation when it is handed over. */
export const HANDOVER_LINE =
  "Passed to a person. Andy has been notified and will reply here. You can keep typing, and you can close this window: the reply will be waiting when you come back.";

/** Used when the assistant cannot answer at all (no key, or an error). */
export const ASSISTANT_UNAVAILABLE_LINE =
  "Bruce isn't available right now, so this has gone straight to a person.";

/** The phone notification support gets. No more than the first line. */
export function supportPushText(userName: string | null, salonName: string | null, message: string, isNewRequest: boolean) {
  const who = (userName ?? "").trim() || "Someone";
  const where = (salonName ?? "").trim();
  const title = isNewRequest
    ? `${who} wants to talk to a person`
    : `${who} replied in support chat`;
  const gist = message.replace(/\s+/g, " ").trim().slice(0, 140);
  return { title, body: where ? `${where}: ${gist}` : gist };
}

export type HistoryMessage = { sender: SupportSender; body: string };

/**
 * The conversation as alternating user/assistant turns for the model.
 *
 * System lines are dropped, consecutive messages from the same side are
 * joined (the API wants strict alternation), and it must start with the
 * user — an opening assistant turn is cut.
 */
export function historyForModel(messages: readonly HistoryMessage[]): Array<{ role: "user" | "assistant"; content: string }> {
  const turns: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const m of messages.slice(-SUPPORT_HISTORY_LIMIT)) {
    if (m.sender === "system") continue;
    const role = m.sender === "user" ? "user" as const : "assistant" as const;
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n\n${m.body}`;
    else turns.push({ role, content: m.body });
  }
  while (turns.length > 0 && turns[0].role !== "user") turns.shift();
  return turns;
}

/** Messages the given side has not seen, written by the other side. */
export function unreadCount(
  messages: ReadonlyArray<{ id: number; sender: SupportSender }>,
  readUpToId: number,
  side: "user" | "agent",
): number {
  return messages.filter((m) => m.id > readUpToId && (side === "user" ? m.sender !== "user" : m.sender === "user")).length;
}
