/**
 * What recording a dog's weight writes to its record.
 *
 * Pulled out of the router so it can be tested as behaviour. The test that
 * used to guard this asserted the literal source text of the update call,
 * which broke the moment the call gained a line — while the app carried on
 * working perfectly. That is the failure mode CLAUDE.md warns about, so the
 * rule lives here and the test asserts what it DOES.
 *
 * Two columns, always together. `weight` and `weight_kg` are near-duplicates
 * inherited from the migration, and different parts of the app read
 * different ones — resolveTimingReviewThreshold takes both. Writing one and
 * not the other leaves a dog that is 22 kg on one screen and unweighed on
 * the next.
 */
import { bandForWeight, type DogSizeBand } from "./dogSizeBand";

export type PetWeightUpdate = {
  weightKg: string | null;
  weight: string | null;
  sizeBand?: DogSizeBand;
  sizeBandSource?: "weighed";
};

export function petWeightUpdate(weightKg: number | null | undefined): PetWeightUpdate {
  const recorded = weightKg === null || weightKg === undefined ? null : weightKg.toFixed(1);
  const band = bandForWeight(recorded);

  // Clearing the weight leaves any existing band alone. Forgetting the
  // number does not make the dog a different size, and wiping the band
  // would throw away the MoeGo import's work on a mis-tap.
  if (!band) return { weightKg: recorded, weight: recorded };

  // A weight somebody recorded is better evidence of size than a service
  // name typed into MoeGo years ago, so it wins — and "weighed" is a source
  // the import will not overwrite.
  return { weightKg: recorded, weight: recorded, sizeBand: band, sizeBandSource: "weighed" };
}
