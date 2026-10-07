/**
 * A size band from the breed, for dogs nobody has weighed.
 *
 * A last resort, and a deliberately narrow one. The salon's bands are tight
 * — small is 0-10 kg, small-medium 11-13, medium 14-16 — and most breed
 * ranges straddle two or three of them. A Border Collie is 14-20 kg, which
 * is medium OR large; a Dachshund is 4 kg or 15 kg depending on the
 * variety; a Cavoodle is whatever its poodle parent was.
 *
 * So this lists only breeds whose adult weight sits clearly inside ONE
 * band, and refuses everything else. The refused ones are reported by name
 * for somebody who knows the dog, which is a better answer than a number
 * invented here: a dog filed one band too small is quoted and timed short,
 * and its groomer's revenue target is set too high.
 *
 * Recorded with size_band_source = "breed" so it is never mistaken for a
 * weight, is correctable, and is replaced the moment anyone weighs the dog.
 */
import type { DogSizeBand } from "./dogSizeBand";

/**
 * Breed to band, for breeds that sit inside one.
 *
 * Keys are normalised: lowercase, punctuation stripped, spaces collapsed.
 * Typical ADULT weights, Australian pet lines rather than show standards.
 */
const BREED_BANDS: Record<string, DogSizeBand> = {
  // ── Small (0-10 kg) — toys and small terriers, unambiguous ──
  pomeranian: "small",
  maltese: "small",
  papillon: "small",
  "shih tzu": "small",
  shihtzu: "small",
  pug: "small",
  "poodle toy": "small",
  "toy poodle": "small",
  "poodle miniature": "small",
  "miniature poodle": "small",
  "jack russell terrier": "small",
  "jack russell": "small",
  havanese: "small",
  havenese: "small", // as spelled in the salon's records
  chihuahua: "small",
  "yorkshire terrier": "small",
  "cavalier king charles spaniel": "small",
  cavalier: "small",
  "bichon frise": "small",
  "malt x shih": "small",
  "maltese x shih tzu": "small",
  schipperke: "small",
  // Dachshunds: every variety the salon records is well under 10 kg.
  "dachshund miniature smooth haired": "small",
  "dachshund miniature long haired": "small",
  "dachshund kaninchen long haired": "small",
  "dachshund kaninchen smooth haired": "small",

  // ── Large (17-25 kg) ──
  "english bulldog": "large",
  "british bulldog": "large",

  // ── Extra large (26-34 kg) ──
  labrador: "extra_large",
  labradore: "extra_large", // as spelled in the salon's records
  "labrador retriever": "extra_large",
  "retriever golden": "extra_large",
  "golden retriever": "extra_large",
  "german shepherd dog": "extra_large",
  "german shepherd": "extra_large",

  // ── Giant (36 kg and up) ──
  "bernese mountain dog": "giant",
  rottweiler: "giant",
  "great dane": "giant",
  newfoundland: "giant",
};

/**
 * Breeds explicitly NOT mapped, and why — so the next person does not
 * "helpfully" add them.
 *
 * Each of these straddles two or more of the salon's bands, and which one a
 * given dog lands in is a real difference in chair time and price:
 *
 *   Tibetan Terrier    8-14 kg    small / small-medium / medium
 *   Border Collie      14-20 kg   medium / large
 *   Beagle             9-11 kg    small / small-medium
 *   Corgi              10-14 kg   small / small-medium / medium
 *   Kelpie             14-20 kg   medium / large
 *   Keeshond           15-20 kg   medium / large
 *   Samoyed            16-30 kg   large / extra large
 *   Greyhound          27-40 kg   extra large / giant
 *   Old English Sheepdog 27-45 kg extra large / giant
 *   Boston Terrier     5-11 kg    small / small-medium
 *   Shetland Sheepdog  6-12 kg    small / small-medium
 *   Dachshund (plain)  4-15 kg    depends entirely on the variety
 *   Cavoodle, Spoodle, Moodle, Schnoodle, Labradoodle, Groodle
 *                                 whatever the poodle parent was
 */
export const DELIBERATELY_UNMAPPED = [
  "tibetan terrier", "border collie", "beagle", "corgi", "kelpie", "keeshond",
  "samoyed", "greyhound", "old english sheepdog", "boston terrier",
  "shetland sheepdog", "sheltie", "dachshund", "cocker spaniel", "irish terrier",
] as const;

export function normaliseBreed(breed: string | null | undefined): string {
  return (breed ?? "")
    .toLowerCase()
    .replace(/[()\/,.\-–—]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The band this breed clearly implies, or null.
 *
 * Null means "ask somebody", never "assume small". An unknown breed, a
 * crossbreed and a placeholder record all land here on purpose.
 */
export function bandFromBreed(breed: string | null | undefined): DogSizeBand | null {
  const key = normaliseBreed(breed);
  if (!key) return null;
  if (BREED_BANDS[key]) return BREED_BANDS[key];

  // An " x " anywhere means a cross, and a cross is not its parent — a
  // "Mastiff X" could be anything. Refused rather than guessed.
  if (/\bx\b/.test(key)) return null;

  return null;
}

/** Everything the map knows, for the test that guards it. */
export const MAPPED_BREEDS = Object.keys(BREED_BANDS);
