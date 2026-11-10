import { parsePetCodes } from "@shared/petCodes";
import { badgeTextColour, colourFor, meaningFor, textColourFor } from "@shared/petCodeCatalogue";
import { splitWarningCodes } from "@shared/petCodeWarnings";
import { readableTextOn } from "@shared/readableTextOn";
import { usePetCodeIndex } from "@/hooks/usePetCodeIndex";

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
 * ## Warnings
 *
 * Andy, 10/11/2026: "All warnings must be noticeable on the appt and
 * the workflow in bright red badges." A code the catalogue classes as a
 * Warning — or one that is a warning by its own wording, see
 * shared/petCodeWarnings.ts — is drawn bold, red and FIRST, whatever
 * colour somebody once gave it. This widens what 04/11/2026 did for
 * bites alone.
 *
 * The catalogue query is shared: React Query dedupes it by key, so a
 * board of forty dogs makes one request, not forty.
 */
export function PetCodeChips({
  codes: raw,
  size = "sm",
  className = "",
  warningsOnly = false,
}: {
  /** The stored string, or an already-split list. */
  codes: string | string[] | null | undefined;
  /** "xs" for the board, where the row is three lines tall. */
  size?: "xs" | "sm";
  className?: string;
  /**
   * Show the warnings and drop the rest — for a card too small to carry
   * every code. The warnings are never the thing that gets dropped.
   */
  warningsOnly?: boolean;
}) {
  const all = Array.isArray(raw) ? raw : parsePetCodes(raw);
  // Hook order is fixed, so the query runs before the early return.
  const { index } = usePetCodeIndex(all.length > 0);
  if (all.length === 0) return null;

  const split = splitWarningCodes(all, index);
  const warnings = new Set(split.warnings);
  const codes = warningsOnly ? split.warnings : [...split.warnings, ...split.codes];
  if (codes.length === 0) return null;

  const padding = size === "xs" ? "px-1 py-px text-[9px]" : "px-1.5 py-0.5 text-[10px]";

  return (
    <span
      className={`flex flex-wrap items-center gap-0.5 ${className}`}
      aria-label={`Pet codes: ${codes.join(", ")}`}
    >
      {codes.map((code) => {
        const meaning = meaningFor(code, index);
        /*
         * A warning overrides whatever colour the catalogue gives it,
         * and overrides having no colour at all. It is the code where
         * being missed means somebody is hurt, so it does not get to
         * inherit a pastel somebody picked months ago, and it does not
         * sit in the same grey as a blade number.
         */
        const warning = warnings.has(code);
        const colour = warning ? null : colourFor(code, index);
        return (
          <span
            key={code}
            // The meaning on hover, because the codes are shorthand a
            // new groomer has not learned yet.
            title={meaning ? `${code} — ${meaning}` : code}
            className={`inline-flex items-center rounded leading-tight ${padding} ${
              warning
                ? "bg-red-600 font-black uppercase tracking-wide text-white ring-1 ring-red-800"
                : colour
                  ? "font-semibold"
                  : "bg-slate-200 font-semibold text-slate-800 dark:bg-slate-700 dark:text-slate-100"
            }`}
            // Black or white, whichever actually contrasts. White was
            // once forced on every colour, and white on amber is 2:1.
            style={colour ? { background: colour, color: badgeTextColour(colour, textColourFor(code, index), readableTextOn) } : undefined}
            data-testid={warning ? "pet-code-chip-warning" : "pet-code-chip"}
          >
            {code}
          </span>
        );
      })}
    </span>
  );
}
