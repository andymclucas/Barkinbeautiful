import { AlertTriangle } from "lucide-react";
import { parsePetCodes } from "@shared/petCodes";
import { describeWarningCode, warningCodesIn } from "@shared/petCodeWarnings";
import { usePetCodeIndex } from "@/hooks/usePetCodeIndex";

/**
 * The dog's warning codes, in a red box.
 *
 * Andy, 10/11/2026: "Make sure that these are all added in the bright
 * red warning box on both the appt and the workflow sections."
 *
 * The dog card on the workflow board had a red box, but it read the
 * alert level and the free-text warning only. SENSITIVE, DOG AGGRESSIVE
 * and the rest are codes, a separate record, so a dog could carry three
 * of them and open to a card with no box at all.
 *
 * One line per warning with its meaning spelled out — "PITA — Difficult
 * to groom" — because the person reading it may be a new bather.
 */
export function PetCodeWarningBox({
  codes: raw,
  className = "",
}: {
  codes: string | string[] | null | undefined;
  className?: string;
}) {
  const codes = Array.isArray(raw) ? raw : parsePetCodes(raw);
  // No codes, no catalogue request and no hook — see usePetCodeIndex.
  if (codes.length === 0) return null;
  return <Box codes={codes} className={className} />;
}

function Box({ codes, className }: { codes: string[]; className: string }) {
  const { index } = usePetCodeIndex();
  const warnings = warningCodesIn(codes, index);
  if (warnings.length === 0) return null;

  return (
    <div
      role="alert"
      data-testid="pet-code-warning-box"
      className={`flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 ${className}`}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {warnings.length === 1 ? "Warning" : "Warnings"}
        </p>
        <ul className="mt-0.5 space-y-0.5 text-sm">
          {warnings.map((code) => (
            <li key={code} className="font-medium">
              {describeWarningCode(code, index)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default PetCodeWarningBox;
