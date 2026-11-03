/**
 * Finding a code in the salon's vocabulary, fast, with a dog in front of you.
 *
 * Andy, 03/11/2026: "Add search feature for pet codes in the appts tab so
 * staff can easily add them if required... Give the option to add/remove and
 * edit too."
 *
 * There are 93 codes (`shared/petCodes.ts`) and they are not a tidy list: clip
 * specs (#5f, #16mm), style shorthand (Char Do, Megs do), handling rules
 * (No cologne, PLUCK EARS) and safety flags (SENSITIVE, muzzle). Rendering all
 * 93 as chips made picking one slower than scrolling the pet record, which is
 * the friction the tab was added to remove.
 *
 * So two separate problems, and this module is deliberate about both:
 *
 *   - **typing** narrows, and has to rank, because "Ner" must put `Ner` above
 *     `No cologne` even though both contain an n-e-r;
 *   - **not typing** still has to show something useful, and "the first 12
 *     alphabetically" is `#10`, `#13`, `#16mm` — three blade numbers and no
 *     safety flag. Resting order is by how many dogs actually carry the code.
 *
 * Kept pure and out of the component so the ranking can be unit-tested against
 * the real vocabulary's awkward shapes, and so the next screen that needs a
 * code picker does not invent a second order.
 */
import { matchRank } from "./globalSearch";

/** A catalogue row, reduced to what searching needs. */
export type SearchableCode = {
  code: string;
  description: string | null;
  /** How many dogs carry it — `petCodes.list` counts this. Drives resting order. */
  dogsUsing?: number | null;
};

export type CodeHit<T extends SearchableCode> = {
  entry: T;
  /**
   * Why it is in the list.
   *
   * `"description"` is the one the UI must say out loud: searching "nervous"
   * returns a code called `Ner`, and a bare `+ Ner` chip looks like a bug
   * until you can see that its description is what matched.
   *
   * `null` means nothing was typed — it is here on merit, not on a match.
   */
  matchedOn: "code" | "description" | null;
};

/**
 * How many codes to show before asking.
 *
 * Measured, not guessed. The booking dialog is `max-w-lg`, so the chips wrap
 * inside about 464px, and at that width the real vocabulary renders as:
 *
 *     all 93 codes -> 21 rows, 582px
 *     12 codes     ->  3 rows,  78px
 *
 * 582px is taller than the dialog has to spare once the header, the pet tabs,
 * the dog's own codes and the search box are in it — so the panel opened on a
 * wall of chips with the box you type into scrolled off the top. Twelve keeps
 * it on screen, and "Show all" is one click.
 */
export const RESTING_CODE_LIMIT = 12;

/**
 * A description has to match at a word boundary; a code does not.
 *
 * `matchRank` scores a bare substring 3, which is right for a name or an
 * address in the global search. Here it is mostly noise: typing "ner" to reach
 * the nervous-dog code also returned `No cologne`, because its description
 * reads "Ow**ner** asks for no cologne". Three letters against 93 short
 * sentences finds a lot of that, and every false chip pushes the real one
 * further down.
 *
 * Codes keep the looser test deliberately. They are shorthand, not prose —
 * `#3 PFFT`, `Megs do`, `#16mm` — so a mid-token match there is usually the
 * thing being looked for rather than an accident.
 */
const DESCRIPTION_NOISE_FLOOR = 2;

const usage = (entry: SearchableCode): number => Number(entry.dogsUsing ?? 0);

/**
 * The vocabulary, narrowed and ordered for a picker.
 *
 * `exclude` is what the dog already carries: offering a code it already has
 * is a chip that cannot change anything, and it crowds out one that can.
 *
 * With no query the whole (non-excluded) list comes back, commonest first —
 * the caller decides how much of it to paint, because "show all" is a button,
 * not a different search.
 */
export function searchPetCodes<T extends SearchableCode>(
  catalogue: readonly T[],
  query: string,
  opts: { exclude?: readonly string[] } = {},
): CodeHit<T>[] {
  const needle = query.trim().toLowerCase();
  const taken = new Set((opts.exclude ?? []).map((c) => c.trim().toLowerCase()));
  const available = catalogue.filter((e) => !taken.has(e.code.trim().toLowerCase()));

  if (!needle) {
    // Stable, so a salon that has curated `sortOrder` keeps that order within
    // codes carried by equally many dogs. The catalogue arrives already sorted
    // by (sortOrder, code), and every sortOrder is 0 until someone sets one.
    return [...available]
      .sort((a, b) => usage(b) - usage(a))
      .map((entry) => ({ entry, matchedOn: null }));
  }

  const scored: { hit: CodeHit<T>; rank: number }[] = [];
  for (const entry of available) {
    const onCode = matchRank(entry.code, needle);
    const onDescription = matchRank(entry.description, needle);
    const usableDescription = onDescription <= DESCRIPTION_NOISE_FLOOR ? onDescription : 99;
    const rank = Math.min(onCode, usableDescription);
    if (rank === 99) continue;
    // A code-text match wins the label even when the description scores the
    // same, because the chip shows the code and that is then self-explanatory.
    scored.push({ hit: { entry, matchedOn: onCode <= onDescription ? "code" : "description" }, rank });
  }

  return scored
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      const byUse = usage(b.hit.entry) - usage(a.hit.entry);
      if (byUse !== 0) return byUse;
      return a.hit.entry.code.localeCompare(b.hit.entry.code);
    })
    .map((s) => s.hit);
}

/**
 * Would pressing Add create a new code rather than attach an existing one?
 *
 * The vocabulary is not an authority — a groomer may type anything and it
 * saves to the dog (Andy, 22/10/2026) — so this is not a validation. It is
 * only so the panel can say which of the two things the button is about to
 * do, rather than leaving a typo looking like a successful pick.
 */
export function isNewCode(catalogue: readonly SearchableCode[], query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return false;
  return !catalogue.some((e) => e.code.trim().toLowerCase() === needle);
}
