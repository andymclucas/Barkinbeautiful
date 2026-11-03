import { trpc } from "@/lib/trpc";
import { parsePetCodes } from "@shared/petCodes";
import { isBiteWarning } from "@shared/petCodeRisk";
import { colourFor, indexPetCodes, meaningFor, type PetCodeEntry } from "@shared/petCodeCatalogue";
import { readableTextOn } from "@shared/readableTextOn";

/**
 * A dog's codes, in the salon's colours, wherever they are shown.
 *
 * The chips existed in three places with three sets of markup — the
 * catalogue, the picker on the client record, and the workflow board —
 * and only two of them had learned about colour. The board drew every
 * code the same grey, so the one thing Charlie asked for ("make the
 * Char do / Megs do codes a different colour") was invisible exactly
 * where a groomer reads it.
 *
 * One component now, so a colour set in the catalogue shows up
 * everywhere at once and a fourth copy cannot drift.
 *
 * The catalogue query is shared: React Query dedupes it by key, so a
 * board of forty dogs makes one request, not forty.
 */
export function PetCodeChips({
  codes: raw,
  size = "sm",
  className = "",
}: {
  /** The stored string, or an already-split list. */
  codes: string | string[] | null | undefined;
  /** "xs" for the board, where the row is three lines tall. */
  size?: "xs" | "sm";
  className?: string;
}) {
  const codes = Array.isArray(raw) ? raw : parsePetCodes(raw);
  // Hook order is fixed, so the query runs before the early return.
  const catalogue = trpc.petCodes.list.useQuery(
    { includeInactive: true },
    // Codes rarely change and every row on the board asks for them.
    { staleTime: 5 * 60 * 1000, enabled: codes.length > 0 },
  );
  if (codes.length === 0) return null;

  const index = indexPetCodes((catalogue.data ?? []) as PetCodeEntry[]);
  const padding = size === "xs" ? "px-1 py-px text-[9px]" : "px-1.5 py-0.5 text-[10px]";

  return (
    <span
      className={`flex flex-wrap items-center gap-0.5 ${className}`}
      aria-label={`Pet codes: ${codes.join(", ")}`}
    >
      {codes.map((code) => {
        const meaning = meaningFor(code, index);
        /*
         * A bite warning overrides whatever colour the catalogue gives
         * it, and overrides having no colour at all.
         *
         * Andy, 04/11/2026: "Any 'bites' warning need to be bold and
         * red so it is very noticeable by the groomers & bathers." It
         * is the one code where being missed means somebody is hurt, so
         * it does not get to inherit a pastel somebody picked months
         * ago, and it does not sit in the same grey as a blade number.
         */
        const bites = isBiteWarning(code);
        const colour = bites ? null : colourFor(code, index);
        return (
          <span
            key={code}
            // The meaning on hover, because the codes are shorthand a
            // new groomer has not learned yet.
            title={meaning ? `${code} — ${meaning}` : code}
            className={`inline-flex items-center rounded leading-tight ${padding} ${
              bites
                ? "bg-red-600 font-black uppercase tracking-wide text-white ring-1 ring-red-800"
                : colour
                  ? "font-semibold"
                  : "bg-slate-200 font-semibold text-slate-800 dark:bg-slate-700 dark:text-slate-100"
            }`}
            // Black or white, whichever actually contrasts. White was
            // once forced on every colour, and white on amber is 2:1.
            style={colour ? { background: colour, color: readableTextOn(colour) } : undefined}
            data-testid={bites ? "pet-code-chip-bite" : "pet-code-chip"}
          >
            {code}
          </span>
        );
      })}
    </span>
  );
}
