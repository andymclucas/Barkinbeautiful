import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { petAlertTone, petAlertText, type PetAlertInput } from "@shared/petAlert";
import { parsePetCodes } from "@shared/petCodes";
import { describeWarningCode, warningCodesIn } from "@shared/petCodeWarnings";
import { usePetCodeIndex } from "@/hooks/usePetCodeIndex";

/**
 * The warning flag on a dog's row.
 *
 * Andy, 09/10/2026: "Make this a hover over instead of the big yellow
 * caution. Have a smaller red exclamation mark with a hover feature to show
 * all the alerts, or clickable on phone/iPad."
 *
 * The old badge printed the warning inline and cut it at 15 characters, so
 * "MoeGo source alert (20 Aug 2026): allergy to beef and green ants" came
 * out as "CAUTION — MoeGo sourc al" — a wide amber block that said almost
 * nothing and pushed the row around. This is a single small dot.
 *
 * Both input styles are wired on purpose. `title` gives the native hover on
 * a desktop, and the popover opens on tap, because the salon floor reads
 * this board on an iPad where hover does not exist. The full text is shown
 * either way, never truncated.
 *
 * `warningCodes` are the dog's warning-class pet codes, already spelled
 * out ("PITA — Difficult to groom"). Andy, 10/11/2026, asked for them in
 * the red warning box; a dog carrying any gets a RED flag even when its
 * alert level is "ok", and the popover lists them above the alert text.
 */
export function PetAlertButton({
  pet,
  petName,
  warningCodes,
}: {
  pet: PetAlertInput;
  petName?: string | null;
  warningCodes?: readonly string[] | null;
}) {
  const [open, setOpen] = useState(false);
  const alertTone = petAlertTone(pet);
  const alertText = alertTone ? petAlertText(pet) : null;
  const codes = warningCodes ?? [];
  const hasAlert = Boolean(alertTone && alertText);
  if (!hasAlert && codes.length === 0) return null;

  const tone = codes.length > 0 ? "danger" : alertTone;
  const text = [codes.length > 0 ? codes.join(" · ") : null, hasAlert ? alertText : null]
    .filter(Boolean)
    .join("\n");
  const heading = hasAlert ? (alertTone === "danger" ? "Danger" : "Caution") : "Warning";
  const label = `${codes.length > 0 ? "Warning" : heading} on ${petName ?? "this dog"}: ${text}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={text}
          aria-label={label}
          onClick={(event) => event.stopPropagation()}
          className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-1 ${
            tone === "danger"
              ? "bg-red-600 focus:ring-red-600"
              : "bg-amber-500 focus:ring-amber-500"
          }`}
        >
          <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-3 text-xs leading-5"
        onClick={(event) => event.stopPropagation()}
      >
        {codes.length > 0 && (
          <div className={hasAlert ? "mb-2" : ""} data-testid="pet-alert-warning-codes">
            <p className="mb-1 font-bold uppercase tracking-wide text-red-600 dark:text-red-400">
              {codes.length === 1 ? "Warning" : "Warnings"}
              {petName ? ` · ${petName}` : ""}
            </p>
            <ul className="space-y-0.5 font-semibold text-red-700 dark:text-red-300">
              {codes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
          </div>
        )}
        {hasAlert && (
          <>
            <p className={`mb-1 font-bold uppercase tracking-wide ${alertTone === "danger" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
              {heading}
              {petName && codes.length === 0 ? ` · ${petName}` : ""}
            </p>
            <p className="whitespace-pre-wrap text-foreground">{alertText}</p>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The flag for a row that knows the dog's codes as well as its alert.
 *
 * Split in two so the catalogue is only asked for when the dog carries
 * a code: the board table renders this for EVERY row and is tested with
 * plain props, so the outer component must not call a tRPC hook.
 */
export function PetAlertFlag({
  pet,
  petName,
  codes: raw,
}: {
  pet: PetAlertInput;
  petName?: string | null;
  codes: string | string[] | null | undefined;
}) {
  const codes = Array.isArray(raw) ? raw : parsePetCodes(raw);
  if (codes.length === 0) return <PetAlertButton pet={pet} petName={petName} />;
  return <FlagWithCodes pet={pet} petName={petName} codes={codes} />;
}

function FlagWithCodes({
  pet,
  petName,
  codes,
}: {
  pet: PetAlertInput;
  petName?: string | null;
  codes: string[];
}) {
  const { index } = usePetCodeIndex();
  const warnings = warningCodesIn(codes, index).map((code) => describeWarningCode(code, index));
  return <PetAlertButton pet={pet} petName={petName} warningCodes={warnings} />;
}
