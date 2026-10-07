/**
 * Working out a dog's size band from the service MoeGo booked it under.
 *
 * MoeGo has no weight in any export available here, but it spells the band
 * out in the service name — and spells it a dozen different ways:
 *
 *   SML-10kg   -SML -10kg   customer SML 10kg   - SMALL-10kg
 *   11-13kg    - SML-MED 11-13KG   lient-SML/MED 11-13kg
 *   MED14-17KG   - Medium 14-16KG
 *   LARGE 17-25KG   La 17-25KG   - Large17-25kg
 *   - XL 26-34KG   - XLarge26-34kg
 *   Giant 36-80KG
 *
 * So the NUMBERS are parsed, not the labels. Matching on "SML" or "Large"
 * would need a list of every spelling the salon has ever typed, and a new
 * one appears every time somebody names a service by hand.
 *
 * This produces a BAND, never a weight. A dog in the 17–25 kg band has not
 * been weighed, and writing 21 kg onto its record would turn a guess into
 * something the app treats as measured — pets.weight_kg drives automatic
 * durations and is shown to staff as fact.
 */
import { MEMBERSHIP_WEIGHT_BANDS } from "./membershipPackages";

export type DogSizeBand = (typeof MEMBERSHIP_WEIGHT_BANDS)[number]["id"];

export type BandMatch =
  | { band: DogSizeBand; kgRange: [number, number] }
  | { band: null; reason: "no_band_in_text" | "ambiguous_range" | "conflicting_bands" };

/**
 * Every "<n>kg" or "<n>-<m>kg" in a piece of service text, in order.
 *
 * The leading label is ignored entirely, which is the point. "MED14-17KG"
 * and "- Medium 14-16KG" both come back as a range.
 */
export function extractKgRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  // The \d{1,2}\s*-\s*\d{1,3} form first, so "11-13kg" is not read as "13kg".
  const pattern = /(\d{1,2})\s*-\s*(\d{1,3})\s*k\s*g|(\d{1,3})\s*k\s*g/gi;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m[1] !== undefined && m[2] !== undefined) {
      ranges.push([Number(m[1]), Number(m[2])]);
    } else if (m[3] !== undefined) {
      // A single figure is an upper bound: "SML-10kg" means up to 10 kg.
      ranges.push([0, Number(m[3])]);
    }
  }
  return ranges;
}

/**
 * The band a kg range names, or null when it straddles more than one.
 *
 * MoeGo has two ranges that do not line up with the salon's own bands —
 * "STYLED MEDIUM 8-16KG" spans small through medium, and "Large-XL 20-30kg"
 * spans large and extra large. Those are left unresolved rather than
 * rounded into whichever band they overlap most, because a dog filed one
 * band too small is a dog whose groom is quoted and timed too short.
 */
export function bandForRange(range: [number, number]): DogSizeBand | null {
  const [low, high] = range;
  const matches = MEMBERSHIP_WEIGHT_BANDS.filter(
    (band) => high >= band.minKg && low <= band.maxKg,
  );
  // A single upper bound ("10kg") overlaps every band below it, so prefer
  // the band whose own maximum the figure actually names.
  if (low === 0) {
    const exact = MEMBERSHIP_WEIGHT_BANDS.find((band) => band.maxKg === high);
    if (exact) return exact.id;
  }
  if (matches.length === 1) return matches[0].id;

  // MoeGo's 14–17 straddles medium (14–16) and large (17–25) by one kilo.
  // The service is named "MED", and a one-kilo overlap at the boundary is
  // the band's own rounding rather than a genuinely ambiguous dog.
  const fullyInside = matches.filter((band) => low >= band.minKg);
  if (fullyInside.length >= 1 && high - low <= 4) return fullyInside[0].id;

  return null;
}

/** The band named by one service string. */
export function bandFromServiceText(text: string | null | undefined): BandMatch {
  if (!text) return { band: null, reason: "no_band_in_text" };
  const ranges = extractKgRanges(text);
  if (ranges.length === 0) return { band: null, reason: "no_band_in_text" };

  const resolved = ranges.map((range) => ({ range, band: bandForRange(range) }));
  const bands = new Set(resolved.map((r) => r.band).filter((b): b is DogSizeBand => b !== null));

  if (bands.size === 0) return { band: null, reason: "ambiguous_range" };
  if (bands.size > 1) return { band: null, reason: "conflicting_bands" };

  const hit = resolved.find((r) => r.band !== null)!;
  return { band: hit.band!, kgRange: hit.range };
}

export const SIZE_BAND_IDS: readonly DogSizeBand[] = MEMBERSHIP_WEIGHT_BANDS.map((b) => b.id);

export function sizeBandLabel(band: DogSizeBand): string {
  return MEMBERSHIP_WEIGHT_BANDS.find((b) => b.id === band)?.label ?? band;
}
