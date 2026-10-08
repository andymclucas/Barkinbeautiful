import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { petAlertTone, petAlertText, type PetAlertInput } from "@shared/petAlert";

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
 */
export function PetAlertButton({ pet, petName }: { pet: PetAlertInput; petName?: string | null }) {
  const [open, setOpen] = useState(false);
  const tone = petAlertTone(pet);
  const text = petAlertText(pet);
  if (!tone || !text) return null;

  const label = `${tone === "danger" ? "Danger" : "Caution"} on ${petName ?? "this dog"}: ${text}`;

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
        <p className={`mb-1 font-bold uppercase tracking-wide ${tone === "danger" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
          {tone === "danger" ? "Danger" : "Caution"}
          {petName ? ` · ${petName}` : ""}
        </p>
        <p className="whitespace-pre-wrap text-foreground">{text}</p>
      </PopoverContent>
    </Popover>
  );
}
