/**
 * Add-on names, shortened for the workflow board.
 *
 * Lauren, 22/10/2026: "need to show any add-ons on the workflow so
 * groomers can see what else needs to be done at a glance." At a glance
 * is the constraint. The Service column is about 110px wide and the
 * salon's catalogue runs to names like "Matting / Overgrown Fur De-matt
 * (9+ weeks overdue)" and "Teeth Ultra Clean + Anal Gland Pack" — set
 * those at 10px and a groomer reads a grey smear, not a job.
 *
 * So each is mapped to the two or three words a groomer would actually
 * say. The full name stays in the badge's title attribute, so nothing is
 * lost on hover.
 *
 * The map is keyed loosely — lowercased, punctuation collapsed — because
 * these names are typed by hand into the pricing catalogue and one of
 * them already carries a trailing space.
 */

const SHORT_BY_KEY: Record<string, string> = {
  "styled cut upgrade add onto any classic cut": "Styled upgrade",
  "matting overgrown fur de matt 9 weeks overdue": "De-matt",
  "teeth ultra clean anal gland pack": "Teeth + glands",
  "pick up or delivery each way": "Pickup/delivery",
  "extra care": "Extra care",
  "daycare per session": "Daycare",
  "anal glands": "Glands",
  "nail painting": "Nails",
  "teeth ultra clean": "Teeth ultra",
  "colour dye": "Colour",
  "teeth brushing": "Teeth",
  "flea rinse": "Flea rinse",
  "asap surcharge": "ASAP",
};

/** Lowercase, strip punctuation, collapse whitespace. */
function key(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The badge text for one add-on.
 *
 * An unmapped name — a new catalogue entry nobody has shortened yet —
 * falls back to its first three words rather than to nothing, so a new
 * add-on still appears on the board the day it is created. Trimmed
 * further than that only if it is still long, and then with an ellipsis
 * so it is obviously cut rather than mis-typed.
 */
export function shortAddOnLabel(name: string | null | undefined): string {
  const raw = String(name ?? "").trim();
  if (!raw) return "Add-on";
  const mapped = SHORT_BY_KEY[key(raw)];
  if (mapped) return mapped;

  const words = raw.split(/\s+/).slice(0, 3).join(" ");
  const short = words.length > 18 ? `${words.slice(0, 17).trimEnd()}…` : words;
  return short || "Add-on";
}

/**
 * Every add-on on one dog, as one line — for a tooltip, a text message
 * or anywhere a list of badges will not fit.
 */
export function describeAddOns(
  addOns: readonly { name: string; quantity?: number }[] | null | undefined,
): string {
  const parts = (addOns ?? [])
    .map((a) => {
      const n = String(a?.name ?? "").trim();
      if (!n) return null;
      const q = typeof a.quantity === "number" && a.quantity > 1 ? ` ×${a.quantity}` : "";
      return `${n}${q}`;
    })
    .filter((p): p is string => p !== null);
  return parts.join(", ");
}
