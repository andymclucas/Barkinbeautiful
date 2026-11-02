/**
 * Reading MoeGo's "Block time" entries well enough to act on them.
 *
 * Andy, 02/11/2026: "Build the sync properly."
 *
 * Blockouts have never synced. A sweep on 02/11/2026 found 45 MoeGo
 * blocks between 3 November and 19 February that Groomigo had never
 * heard of — including two groomers in Sydney for four days — while
 * online booking was on and `nextAvailable` was happily selling those
 * slots.
 *
 * The sweep also found why this cannot be a straight copy. **MoeGo's
 * block feature is used for two different jobs.** Some blocks are a
 * person being away. Others are notes pinned to a day: "Desheds day",
 * "NO AIR CON OUT BACK", "last day". Mirroring all of them would shut
 * days the salon is busy on, which is worse than the gap it fixes.
 *
 * So this classifies, and only an absence is safe to act on. Anything
 * it cannot place comes back as `unclear` and goes to a human rather
 * than being guessed at — the same stance the rest of the MoeGo sync
 * takes, and for the same reason: a dog turned away because the roster
 * said nobody was in is not recoverable by apologising.
 *
 * Every pattern below is here because a real block matched it. The
 * examples are quoted so the next person can see what they are for.
 */

export type MoegoBlockKind = "absence" | "note" | "unclear";

export type MoegoBlock = {
  /** "DD/MM", as the agenda view prints it. */
  day: string;
  /** "07:30am" / "12:00am", as the agenda view prints them. */
  start: string;
  end: string;
  /** What was typed into the block. */
  text: string;
  /** The staff column it sits in, MoeGo's spelling. */
  staff: string;
};

/**
 * Notes pinned to a day, not an absence.
 *
 * Checked FIRST, because several of them also contain words the absence
 * patterns look for — "last day" has "day", and a deshed day is a day
 * the whole team is in.
 */
const NOTE_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /no\s*air\s*-?\s*con/i, why: '"NO AIR CON OUT BACK" — the premises, not a person' },
  { re: /de-?sheds?\s*day/i, why: '"Desheds day" — what the day is FOR; everyone is in' },
  { re: /^\s*(the\s+)?last\s+day\b/i, why: '"last day" — a note before a break' },
  { re: /first\s+day\s+back/i, why: '"first day back" — a note after one' },
];

/**
 * Somebody is out.
 *
 * "away" carries most of these on its own: "away Sydney", "loz away",
 * "SABINA AWAY UNTIL THE 7TH". The rest are the shapes that do not use
 * the word.
 */
const ABSENCE_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /\baway\b/i, why: '"away"' },
  { re: /girls?\s*weekend/i, why: '"Girls weekend"' },
  { re: /\b(annual\s+leave|personal\s+leave|leave|holidays?|sick|wisdom\s+teeth|surgery|hospital)\b/i, why: "leave or medical" },
  { re: /\bblock(ing)?\s*box\b/i, why: '"blocking box" — the salon\'s phrase for holding a slot shut' },
  { re: /\bfrom\s+dr\b|\bdoctors?\b|\bappt\b/i, why: "a doctor's appointment" },
  { re: /\bflight\b|\btrip\b/i, why: "travelling" },
  /* Last, because it is the broadest. A short day is still somebody
     not being there: "Finishing at 3:30pm" on a block MoeGo already
     timed 12:30–15:30 is an absence, and reading it as unclear sent
     two real ones to the review pile for no reason. */
  { re: /\b(finish|start)(?:ing|es|ed|s)?\b/i, why: "a short day — in late or gone early" },
];

/**
 * The first clock time written AFTER a keyword.
 *
 * Not glued to the keyword, because the salon does not write like that:
 * "Megs finish earlier no later than 2" puts two words and a whole
 * clause between "finish" and the number. Anchoring tightly matched
 * "finishing at 3:30pm" and missed the one that actually needed
 * reading.
 */
function timeAfter(text: string, keyword: RegExp): RegExpExecArray | null {
  const k = keyword.exec(text);
  if (!k) return null;
  const rest = text.slice(k.index + k[0].length);
  return /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/i.exec(rest);
}

/** "starting at 11:30" — in later than usual, so the morning is out. */
const LATE_START = /\bstart(?:ing|s)?\b/i;
/** "finishing at 3:30pm", "finish earlier no later than 2" — out from then. */
const EARLY_FINISH = /\bfinish(?:ing|es|ed|\s+earlier)?\b/i;

export type MoegoBlockReading = {
  kind: MoegoBlockKind;
  /** Why it was placed there, for the report a human reads. */
  why: string;
  /** Null for an absence that covers the whole day. */
  startTime: string | null;
  endTime: string | null;
  isFullDay: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** "07:30am" -> "07:30". Returns null on anything unexpected. */
export function toHHMM(value: string | null | undefined): string | null {
  const m = /^(\d{1,2})[:.](\d{2})\s*(am|pm)?$/i.exec(String(value ?? "").trim());
  if (!m) return null;
  let h = Number(m[1]);
  const suffix = (m[3] ?? "").toLowerCase();
  if (suffix === "pm" && h !== 12) h += 12;
  if (suffix === "am" && h === 12) h = 0;
  if (h > 23) return null;
  return `${pad(h)}:${m[2]}`;
}

/** A bare hour or h:mm out of free text, assuming the salon's day. */
function textTime(hour: string, minute: string | undefined, suffix: string | undefined): string | null {
  let h = Number(hour);
  const s = (suffix ?? "").toLowerCase();
  if (s === "pm" && h !== 12) h += 12;
  else if (s === "am" && h === 12) h = 0;
  /* No am/pm written. The salon trades 07:00 to about 17:00, so a bare
     1 to 6 is the afternoon — "finish no later than 2" is 14:00, and
     reading it as 02:00 would block the entire working day. */
  else if (!s && h >= 1 && h <= 6) h += 12;
  if (h > 23) return null;
  return `${pad(h)}:${minute ?? "00"}`;
}

/** MoeGo's own window, when it gave one. "12:00am–11:59pm" means all day. */
export function isFullDayWindow(start: string, end: string): boolean {
  return toHHMM(start) === "00:00" && (toHHMM(end) === "23:59" || toHHMM(end) === "00:00");
}

export function readMoegoBlock(block: MoegoBlock): MoegoBlockReading {
  const text = String(block.text ?? "").trim();
  const fullDay = isFullDayWindow(block.start, block.end);

  for (const p of NOTE_PATTERNS) {
    if (p.re.test(text)) {
      return { kind: "note", why: p.why, startTime: null, endTime: null, isFullDay: fullDay };
    }
  }

  const matched = ABSENCE_PATTERNS.find((p) => p.re.test(text));

  /* MoeGo's own window wins whenever it gave one. Somebody chose those
     times on the day they entered it, and they knew more than a regex
     reading the words afterwards. */
  if (!fullDay) {
    const startTime = toHHMM(block.start);
    const endTime = toHHMM(block.end);
    if (!startTime || !endTime) {
      return { kind: "unclear", why: `unreadable times "${block.start}"–"${block.end}"`, startTime: null, endTime: null, isFullDay: false };
    }
    if (matched) return { kind: "absence", why: matched.why, startTime, endTime, isFullDay: false };
    return { kind: "unclear", why: "a timed block whose note says nothing about being away", startTime, endTime, isFullDay: false };
  }

  /* All day in MoeGo, but the note names a time. "Steph starting at
     11:30 from dr" is not a day off, it is a late start, and blocking
     the whole day would take a working afternoon off the roster. */
  const late = timeAfter(text, LATE_START);
  if (late) {
    const until = textTime(late[1], late[2], late[3]);
    if (until) return { kind: "absence", why: `late start — in at ${until}`, startTime: "00:00", endTime: until, isFullDay: false };
  }
  const early = timeAfter(text, EARLY_FINISH);
  if (early) {
    const from = textTime(early[1], early[2], early[3]);
    if (from) return { kind: "absence", why: `early finish — gone by ${from}`, startTime: from, endTime: "23:59", isFullDay: false };
  }

  if (matched) return { kind: "absence", why: matched.why, startTime: null, endTime: null, isFullDay: true };

  /* A bare name — "Charlotte", "Lauren", "Zakaria" — is how this salon
     writes somebody being out, but only the caller knows the roster, so
     it is resolved there rather than guessed at here. */
  return { kind: "unclear", why: "an all-day block whose note does not say what it is", startTime: null, endTime: null, isFullDay: true };
}

/**
 * A bare staff name counts as an absence, once the caller has confirmed
 * the text really is one of their people.
 *
 * Split out because the roster lives in the database and this file does
 * not get to see it. "Charlotte" and "Zakaria" on 12 February are both
 * this shape.
 */
export function readBlockWithRoster(block: MoegoBlock, isStaffName: (text: string) => boolean): MoegoBlockReading {
  const reading = readMoegoBlock(block);
  if (reading.kind !== "unclear") return reading;
  if (isStaffName(block.text)) {
    return { ...reading, kind: "absence", why: `the note is just a name — ${block.text.trim()}` };
  }
  return reading;
}

export type BlockSubject =
  | { ok: true; name: string; from: "text" | "column"; why: string }
  | { ok: false; why: string };

/**
 * WHO the block is about — which is not always whose column it is in.
 *
 * The sweep on 02/11/2026 found the staff column is simply where
 * somebody drew the block, not the subject of it. Three of Steph's and
 * Sabina's absences are sitting in Zakaria's column, and acting on the
 * column would have booked Zakaria off work three times for other
 * people's dentist appointments.
 *
 * But the text is not authoritative either. "Charlie away block box" is
 * written in MEGAN'S column on four February days: Charlotte is already
 * blocked separately, and this one holds one of Megan's slots shut
 * because the salon is a groomer down. The text names Charlie and the
 * block is about Megan.
 *
 * So when the two disagree, neither wins and it goes to a human. That
 * is nine of forty-two, which is a cheap price for never blocking the
 * wrong person's day.
 */
export function blockSubject(
  block: MoegoBlock,
  staffNameIn: (text: string) => string | null,
): BlockSubject {
  const fromColumn = staffNameIn(block.staff ?? "");
  const fromText = staffNameIn(block.text ?? "");

  if (fromText && fromColumn) {
    if (fromText === fromColumn) return { ok: true, name: fromText, from: "column", why: "the note and the column agree" };
    return {
      ok: false,
      why: `the note is about ${fromText} but the block sits in ${fromColumn}'s column — somebody has to say which`,
    };
  }
  if (fromText) return { ok: true, name: fromText, from: "text", why: `the note names ${fromText}` };
  if (fromColumn) return { ok: true, name: fromColumn, from: "column", why: `the note names nobody, so the column stands` };
  return { ok: false, why: "neither the note nor the column names anybody" };
}
