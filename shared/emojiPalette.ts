/**
 * A small, salon-shaped emoji palette.
 *
 * Andy, 30/10/2026: "Add in the emoji button so they can add them in
 * without a keyboard shortcut."
 *
 * Pet codes at this salon are ALREADY emoji — 💊 Medication, 💥
 * Aggressive, 📢 Barker, 🦻 Deaf, 💩 Poops and eleven more are live in
 * the catalogue. Somebody has been typing them with Ctrl+Cmd+Space,
 * which exists on a Mac and nowhere near the salon floor. That is the
 * whole feature: the same characters, reachable by tapping.
 *
 * Two deliberate limits.
 *
 * **It is curated, not complete.** A full picker means a dependency and
 * several thousand characters to scroll, and nobody adding a pet code
 * wants 🏴‍☠️. The groups below are the vocabulary their 111 existing
 * codes actually use — behaviour, health, handling, grooming, the
 * diary — so the thing they want is usually on screen already.
 *
 * **Nothing added after Unicode 13 (2020).** A newer character renders
 * as an empty box on an older phone or the salon TV, and a code nobody
 * can read is worse than no code. 🪮 (comb, Unicode 15) was the obvious
 * one to want here and is deliberately left out.
 *
 * Labels follow THEIR meanings where a code already exists — 🦷 is
 * "Tooth decay" here because that is what it means on their board, not
 * because it is the obvious reading.
 */

export type EmojiEntry = {
  emoji: string;
  /** What it means at this salon. Shown on hover and searched. */
  label: string;
  /** Extra words that should find it. The label is always searched too. */
  keywords?: readonly string[];
};

export type EmojiGroup = {
  name: string;
  entries: readonly EmojiEntry[];
};

export const EMOJI_GROUPS: readonly EmojiGroup[] = [
  {
    name: "Behaviour",
    entries: [
      { emoji: "💥", label: "Aggressive" },
      { emoji: "🤯", label: "Angry", keywords: ["stressed", "overwhelmed"] },
      { emoji: "😬", label: "Nervous", keywords: ["anxious", "shy", "worried"] },
      { emoji: "😱", label: "Freaks out", keywords: ["panics", "dryer", "scared"] },
      { emoji: "📢", label: "Barker", keywords: ["noisy", "loud", "vocal"] },
      { emoji: "👅", label: "High energy", keywords: ["energetic", "excitable"] },
      { emoji: "😮‍💨", label: "Settles well", keywords: ["calm", "easy", "relaxed"] },
      { emoji: "🏃", label: "Escapes", keywords: ["bolter", "runs", "flight risk"] },
      { emoji: "🚩", label: "Red flag", keywords: ["warning", "beware"] },
      { emoji: "⚠️", label: "Take care", keywords: ["caution", "careful"] },
      { emoji: "⛔", label: "Do not", keywords: ["never", "no", "avoid"] },
      { emoji: "⭐", label: "Favourite", keywords: ["vip", "star", "lovely"] },
    ],
  },
  {
    name: "Health",
    entries: [
      { emoji: "💊", label: "Medication" },
      { emoji: "💉", label: "Vaccine expired", keywords: ["vaccination", "jab", "needle"] },
      { emoji: "💔", label: "Heart problems", keywords: ["cardiac"] },
      { emoji: "🦿", label: "Arthritis", keywords: ["joints", "stiff", "legs", "hips"] },
      { emoji: "🦴", label: "Bad legs", keywords: ["hip dysplasia", "bones", "lame"] },
      { emoji: "🧠", label: "Epilepsy", keywords: ["fits", "seizures"] },
      { emoji: "🦷", label: "Tooth decay", keywords: ["teeth", "dental", "mouth"] },
      { emoji: "👂", label: "Ear infection", keywords: ["ears", "pluck"] },
      { emoji: "👁️", label: "Eyes", keywords: ["eye", "weepy", "eyelashes"] },
      { emoji: "🕶️", label: "Blind", keywords: ["sight", "cannot see"] },
      { emoji: "🦻", label: "Deaf", keywords: ["hearing", "cannot hear"] },
      { emoji: "🩹", label: "Sore", keywords: ["wound", "warts", "moles", "lumps"] },
      { emoji: "🤧", label: "Allergies", keywords: ["allergic", "reaction"] },
      { emoji: "🔥", label: "Bad skin", keywords: ["itchy", "irritated", "hot spot"] },
      { emoji: "🐘", label: "Heavy", keywords: ["big", "large", "weight"] },
      { emoji: "🧓", label: "Senior pet", keywords: ["old", "elderly", "aged"] },
      { emoji: "💤", label: "Sedated", keywords: ["sleepy", "sedation"] },
      { emoji: "🤰", label: "Pregnant", keywords: ["in season", "season"] },
    ],
  },
  {
    name: "Handling",
    entries: [
      { emoji: "🔗", label: "Lead on at all times", keywords: ["lead", "leash"] },
      { emoji: "🔒", label: "Keep in crate", keywords: ["cage", "crate", "contained"] },
      { emoji: "🚪", label: "No crate", keywords: ["cage", "loose"] },
      { emoji: "😷", label: "Muzzle", keywords: ["mouth", "bites"] },
      { emoji: "🙅", label: "Keep dogs separate", keywords: ["alone", "apart", "separate"] },
      { emoji: "🧤", label: "Two people", keywords: ["help", "hold", "handling"] },
      { emoji: "💦", label: "Pees", keywords: ["wee", "urinates", "accidents"] },
      { emoji: "💩", label: "Poops", keywords: ["toilet", "mess"] },
      { emoji: "🤮", label: "Car sick", keywords: ["vomits", "sick", "nausea"] },
      { emoji: "🪢", label: "Tie to table", keywords: ["tie up", "restrain"] },
    ],
  },
  {
    name: "Grooming",
    entries: [
      { emoji: "✂️", label: "Blade", keywords: ["scissors", "clip", "cut", "5f", "4f"] },
      { emoji: "🪒", label: "Shave", keywords: ["all off", "strip"] },
      { emoji: "🧴", label: "Special shampoo", keywords: ["own shampoo", "wash", "product"] },
      { emoji: "🛁", label: "Bath", keywords: ["wash", "bathe"] },
      { emoji: "💨", label: "Dryer", keywords: ["blow dry", "drying", "cage dry"] },
      { emoji: "💅", label: "Nails", keywords: ["claws", "file", "trim"] },
      { emoji: "🎀", label: "Bows", keywords: ["bow tie", "ribbon", "no bows"] },
      { emoji: "🌸", label: "Cologne", keywords: ["perfume", "scent", "no cologne"] },
      { emoji: "🐩", label: "Style cut", keywords: ["poodle", "traditional", "bichon"] },
      { emoji: "🧶", label: "Matted", keywords: ["knots", "mats", "tangled"] },
      { emoji: "🐾", label: "Feet", keywords: ["paws", "poodle feet", "groin", "tidy"] },
    ],
  },
  {
    name: "The diary",
    entries: [
      { emoji: "💲", label: "Requires a pre-payment", keywords: ["prepay", "money", "deposit"] },
      { emoji: "📅", label: "Rebook interval", keywords: ["weeks", "2w", "3w", "4w"] },
      { emoji: "⏰", label: "Takes longer", keywords: ["time", "slow", "extra time"] },
      { emoji: "🚗", label: "Drop off", keywords: ["pick up", "collect", "transport"] },
      { emoji: "📝", label: "Read the notes", keywords: ["note", "see notes"] },
      { emoji: "📞", label: "Call the owner", keywords: ["phone", "ring", "contact"] },
    ],
  },
];

/**
 * Emoji found in a string, as whole characters.
 *
 * Grapheme-aware enough for what codes contain: a variation selector
 * (✂️), a skin-tone modifier, and ZWJ sequences all stay in one piece.
 * Splitting 😮‍💨 into two halves would offer staff a character that
 * renders as something else entirely.
 *
 * `©®™` are Extended_Pictographic and are excluded — they turn up in
 * ordinary text and are not what anyone means by an emoji.
 */
const EMOJI_PATTERN =
  /\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|️|⃣)*(?:‍\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|️|⃣)*)*/gu;

const NOT_REALLY_EMOJI = new Set(["©", "®", "™"]);

export function emojiIn(text: string): string[] {
  const found = text.match(EMOJI_PATTERN) ?? [];
  return found.filter((e) => !NOT_REALLY_EMOJI.has(e.replace(/️/g, "")));
}

/**
 * The emoji this salon already uses, most-used first.
 *
 * Shown above the curated groups so the character somebody reaches for
 * most is the first one they see — and so a salon whose vocabulary is
 * nothing like this one still opens the picker on something familiar.
 * That matters more than it looks: the groups below are Barkin'
 * Beautiful's vocabulary, and this row is every other salon's.
 */
export function emojiAlreadyUsed(codes: readonly string[], limit = 16): string[] {
  const counts = new Map<string, number>();
  for (const code of codes) {
    for (const emoji of emojiIn(code)) {
      counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([emoji]) => emoji);
}

/**
 * Matching entries, across every group.
 *
 * An empty query returns nothing rather than everything — the caller
 * shows the groups in that case, and a flat list of all 67 would lose
 * the headings that make them findable.
 */
export function searchEmoji(
  query: string,
  groups: readonly EmojiGroup[] = EMOJI_GROUPS,
): EmojiEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: EmojiEntry[] = [];
  for (const group of groups) {
    for (const entry of group.entries) {
      if (entry.emoji === query.trim()) { hits.push(entry); continue; }
      const haystack = [entry.label, ...(entry.keywords ?? []), group.name];
      if (haystack.some((h) => h.toLowerCase().includes(q))) hits.push(entry);
    }
  }
  return hits;
}

/**
 * Put `insert` where the cursor is, replacing any selection.
 *
 * Appending would be wrong for the commonest case here: their codes are
 * "✂5f" and "✂4f", emoji FIRST. A picker that could only append would
 * mean typing the blade number, tapping the emoji, then dragging it to
 * the front.
 *
 * A null caret — which is what an input reports before it has been
 * focused — appends, because there is no position to honour.
 */
export function insertAtCaret(
  value: string,
  insert: string,
  selectionStart: number | null,
  selectionEnd: number | null = selectionStart,
): { value: string; caret: number } {
  if (selectionStart === null || selectionStart === undefined) {
    return { value: value + insert, caret: (value + insert).length };
  }
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd ?? start, value.length));
  const next = value.slice(0, start) + insert + value.slice(end);
  return { value: next, caret: start + insert.length };
}
