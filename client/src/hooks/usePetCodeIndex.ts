import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { indexPetCodes, type PetCodeEntry } from "@shared/petCodeCatalogue";

const NONE: PetCodeEntry[] = [];

/**
 * The salon's pet-code catalogue, indexed by code.
 *
 * One hook so every surface asks the SAME query — React Query dedupes
 * by key, so a board of forty dogs, each with chips, a warning flag and
 * a hover card, still makes one request.
 *
 * It includes retired codes on purpose: a code that is no longer
 * offered is still on the dogs that carry it, and a retired Warning is
 * still a warning.
 *
 * Call it only from a component that is rendered when a dog actually
 * has codes. Anything rendered for every row (the board table itself)
 * must stay free of tRPC hooks so it can be tested with plain props.
 */
export function usePetCodeIndex(enabled = true) {
  const catalogue = trpc.petCodes.list.useQuery(
    { includeInactive: true },
    // Codes rarely change and every row on the board asks for them.
    { staleTime: 5 * 60 * 1000, enabled },
  );
  const entries = (catalogue.data ?? NONE) as PetCodeEntry[];
  const index = useMemo(() => indexPetCodes(entries), [entries]);
  return { entries, index };
}
