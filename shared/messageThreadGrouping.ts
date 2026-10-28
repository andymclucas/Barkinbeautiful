/**
 * Turns a flat list of SMS log rows into the sequence an iMessage-style thread
 * renders: day separators, runs of consecutive messages from the same side, and
 * the sparse timestamps that keep a conversation readable.
 *
 * Pure so it can be tested without a database or a browser, per the project's
 * `shared/` convention — the previous thread UI put this logic inline in JSX
 * and it could only be "tested" by grepping the source.
 */

export type ThreadMessageInput = {
  id: number | string;
  direction: string | null | undefined;
  body: string | null | undefined;
  sentAt?: string | number | Date | null;
  receivedAt?: string | number | Date | null;
  createdAt?: string | number | Date | null;
  status?: string | null;
};

export type ThreadEntry<M extends ThreadMessageInput = ThreadMessageInput> =
  | { kind: "day"; key: string; label: string; at: number }
  | {
      kind: "message";
      key: string;
      message: M;
      at: number;
      outbound: boolean;
      /** First of a run from the same side — gets the top corner rounded. */
      isFirstOfGroup: boolean;
      /** Last of a run — gets the tail, and the timestamp. */
      isLastOfGroup: boolean;
    };

/**
 * A run breaks after this long, even from the same sender. iMessage uses a
 * similar idea: two texts a minute apart are one thought, two an hour apart
 * are not.
 */
export const GROUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * A row's instant. Inbound messages may carry `receivedAt` rather than
 * `sentAt`, and an unparseable date must not collapse to the epoch — that
 * sorted the newest message to the front, which is how the preview ended up
 * showing stale messages once already.
 */
export function messageInstant(message: ThreadMessageInput | null | undefined): number {
  const raw = message?.sentAt ?? message?.receivedAt ?? message?.createdAt ?? null;
  if (raw === null || raw === undefined || raw === "") return 0;
  const parsed = raw instanceof Date ? raw.getTime() : Date.parse(String(raw));
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Calendar day in the given zone, e.g. "2026-09-25". */
function dayKey(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(at));
}

/** "Today" / "Yesterday" / "Friday 25 September". */
export function dayLabel(at: number, timeZone: string, now: number = Date.now()): string {
  const key = dayKey(at, timeZone);
  if (key === dayKey(now, timeZone)) return "Today";
  if (key === dayKey(now - 24 * 60 * 60 * 1000, timeZone)) return "Yesterday";

  const sameYear = dayKey(at, timeZone).slice(0, 4) === dayKey(now, timeZone).slice(0, 4);
  return new Intl.DateTimeFormat("en-AU", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(new Date(at));
}

/**
 * Oldest first, with day separators inserted and runs marked.
 *
 * Messages with no usable timestamp sort to the front rather than being
 * dropped: a message with a bad date is still a message someone sent.
 */
export function buildThread<M extends ThreadMessageInput>(
  messages: readonly M[],
  timeZone: string,
  now: number = Date.now(),
): ThreadEntry<M>[] {
  const ordered = [...messages].sort((a, b) => messageInstant(a) - messageInstant(b));
  const entries: ThreadEntry<M>[] = [];

  let lastDay: string | null = null;

  for (let index = 0; index < ordered.length; index += 1) {
    const message = ordered[index];
    const at = messageInstant(message);
    const outbound = message.direction === "outbound";

    const day = at === 0 ? null : dayKey(at, timeZone);
    if (day !== null && day !== lastDay) {
      entries.push({ kind: "day", key: `day-${day}`, label: dayLabel(at, timeZone, now), at });
      lastDay = day;
    }

    const previous = ordered[index - 1];
    const next = ordered[index + 1];
    const startsRun =
      !previous ||
      (previous.direction === "outbound") !== outbound ||
      at - messageInstant(previous) > GROUP_WINDOW_MS ||
      (day !== null && dayKey(messageInstant(previous), timeZone) !== day);
    const endsRun =
      !next ||
      (next.direction === "outbound") !== outbound ||
      messageInstant(next) - at > GROUP_WINDOW_MS ||
      (day !== null && dayKey(messageInstant(next), timeZone) !== day);

    entries.push({
      kind: "message",
      key: `msg-${message.id}`,
      message,
      at,
      outbound,
      isFirstOfGroup: startsRun,
      isLastOfGroup: endsRun,
    });
  }

  return entries;
}

/** The last few messages, oldest first — what the hover preview shows. */
export function recentThread<M extends ThreadMessageInput>(
  messages: readonly M[],
  timeZone: string,
  limit = 4,
  now: number = Date.now(),
): ThreadEntry<M>[] {
  const ordered = [...messages].sort((a, b) => messageInstant(a) - messageInstant(b));
  return buildThread(ordered.slice(-limit), timeZone, now);
}

/**
 * One Twilio send is one message, however many dogs it was logged against.
 *
 * Lauren, 28/10/2026: "She got a double text." Jennine Murray's thread
 * showed "Cherry and Pepper are all done" twice. Only ONE text was sent —
 * both rows carry the same twilio_sid, SMe375bbc...542d3, at the same
 * second. The pickup message is deliberately logged against EVERY dog it
 * covers, because that record is what stops a second prompt when the
 * sibling is marked ready. The thread was rendering the bookkeeping.
 *
 * So the client got one text and the salon phoned her about a duplicate
 * that never existed.
 *
 * Collapses on `twilioSid` ONLY. A null sid means Twilio never took it —
 * a failed send, or an inbound message — and those are distinct messages
 * that must never be folded together.
 */
export function collapseBySend<M extends ThreadMessageInput & { twilioSid?: string | null }>(
  messages: readonly M[],
): M[] {
  const seen = new Set<string>();
  const out: M[] = [];
  for (const message of messages) {
    const sid = message.twilioSid?.trim();
    if (!sid) { out.push(message); continue; }
    if (seen.has(sid)) continue;
    seen.add(sid);
    out.push(message);
  }
  return out;
}
