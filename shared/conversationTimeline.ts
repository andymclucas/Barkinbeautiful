/**
 * Everything one contact and the salon have said to each other, in order.
 *
 * Andy, 29/10/2026: "add in any previous correspondence (texts phone
 * calls etc) that the client has had with the salon."
 *
 * Two things were in the way. The thread was built by slicing the
 * page's last 100 SMS rows, so a client whose messages had scrolled
 * past that showed as though the salon had never spoken to them. 498
 * messages exist and 147 clients had some outside that window — client
 * 277 has thirteen and was showing NONE of them. And the 90 missed
 * calls lived in their own panel at the top of the page, so a voicemail
 * and the text answering it were never beside each other.
 *
 * A call is correspondence. It belongs in the thread.
 */
export type ConversationSms = {
  kind: "sms";
  id: number;
  at: number;
  direction: "inbound" | "outbound";
  body: string;
  status?: string | null;
  type?: string | null;
};

export type ConversationCall = {
  kind: "call";
  id: number;
  at: number;
  /** A call is always inbound here: these are calls the salon missed. */
  direction: "inbound";
  /** The voicemail transcript, when Twilio produced one. */
  body: string | null;
  recordingUrl?: string | null;
  callerName?: string | null;
};

export type ConversationEntry = ConversationSms | ConversationCall;

/**
 * Oldest first, because a thread reads downwards and the reply box is at
 * the bottom.
 *
 * Ties break on kind then id rather than being left to sort stability:
 * a voicemail and the auto-reply it triggered land in the same second,
 * and the reply must not appear above the call it answers.
 */
export function conversationTimeline(
  sms: ReadonlyArray<ConversationSms>,
  calls: ReadonlyArray<ConversationCall>,
): ConversationEntry[] {
  return [...sms, ...calls].sort((a, b) => {
    if (a.at !== b.at) return a.at - b.at;
    if (a.kind !== b.kind) return a.kind === "call" ? -1 : 1;
    return a.id - b.id;
  });
}

/**
 * Whether two phone numbers are the same person.
 *
 * Australian mobiles arrive as +61416207175 from Twilio and 0416207175
 * from the client record, and either can carry spaces. The last nine
 * digits are what survives both, which is the same rule
 * `phoneMatchKey` uses for the MoeGo import.
 */
export function sameNumber(a: string | null | undefined, b: string | null | undefined): boolean {
  const key = (v: string | null | undefined) => String(v ?? "").replace(/\D/g, "").slice(-9);
  const ka = key(a);
  return ka.length === 9 && ka === key(b);
}
