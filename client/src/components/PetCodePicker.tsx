import { useState } from "react";
import { Plus, X, Check } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { parsePetCodes } from "@shared/petCodes";
import { indexPetCodes, meaningFor, colourFor } from "@shared/petCodeCatalogue";

/**
 * The codes on a dog, with the salon's catalogue behind the picker.
 *
 * Andy, 22/10/2026, having asked for the catalogue: "Add the picker to
 * the pet record."
 *
 * Codes were read-only here — chips rendered from `moego_code_labels`
 * with no way to change them short of a database write. Now they are
 * editable by whoever is holding the dog.
 *
 * **Free typing stays**, by Andy's choice when the catalogue was
 * specified. The picker lists the catalogue, but the box at the top of
 * it takes anything — the person who finds out a dog bites is a groomer
 * mid-groom, and a vocabulary they cannot add to is one they will work
 * around on paper.
 *
 * Saves on every change rather than behind a Save button: a half-tagged
 * dog is worse than either state, and this is one short string.
 */
export function PetCodePicker({
  petId,
  petName,
  codes: initial,
  readOnly = false,
}: {
  petId: number;
  petName: string;
  codes: string | null | undefined;
  readOnly?: boolean;
}) {
  const utils = trpc.useUtils();
  const [codes, setCodes] = useState<string[]>(() => parsePetCodes(initial));
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  // Only the active ones are offered; a retired code still renders on a
  // dog that carries it, it just is not suggested.
  const catalogue = trpc.petCodes.list.useQuery({ includeInactive: false }, { enabled: !readOnly });
  const index = indexPetCodes((catalogue.data ?? []) as { code: string; description: string | null; colourHex: string | null }[]);

  const save = trpc.pets.updateCodes.useMutation({
    onSuccess: (r) => { setCodes(r.codes); utils.clients.getProfile.invalidate(); },
    onError: (e) => { toast.error(e.message); setCodes(parsePetCodes(initial)); },
  });

  const commit = (next: string[]) => {
    const cleaned = parsePetCodes(next.join(","));
    setCodes(cleaned);
    save.mutate({ petId, codes: cleaned });
  };

  const add = (code: string) => {
    const clean = code.trim();
    if (!clean) return;
    if (codes.some((c) => c.toLowerCase() === clean.toLowerCase())) { setTyped(""); return; }
    commit([...codes, clean]);
    setTyped("");
  };

  const suggestions = ((catalogue.data ?? []) as { code: string; description: string | null }[])
    .filter((row) => !codes.some((c) => c.toLowerCase() === row.code.toLowerCase()))
    .filter((row) => {
      const q = typed.trim().toLowerCase();
      if (!q) return true;
      return row.code.toLowerCase().includes(q) || String(row.description ?? "").toLowerCase().includes(q);
    })
    .slice(0, 40);

  const exactInCatalogue = suggestions.some((r) => r.code.toLowerCase() === typed.trim().toLowerCase());
  const alreadyOnDog = codes.some((c) => c.toLowerCase() === typed.trim().toLowerCase());

  return (
    <div className="flex flex-wrap items-center gap-1" data-testid="pet-code-picker">
      {codes.map((code) => {
        const meaning = meaningFor(code, index);
        const colour = colourFor(code, index);
        return (
          <span
            key={code}
            title={meaning ? `${code} — ${meaning}` : code}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${colour ? "text-white" : "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100"}`}
            style={colour ? { background: colour } : undefined}
            data-testid="pet-code-chip"
          >
            {code}
            {meaning && <span className="font-normal opacity-75">· {meaning}</span>}
            {!readOnly && (
              <button
                type="button"
                onClick={() => commit(codes.filter((c) => c !== code))}
                className="ml-0.5 rounded-full opacity-70 hover:opacity-100"
                aria-label={`Remove ${code} from ${petName}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </span>
        );
      })}

      {!readOnly && (
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setTyped(""); }}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-0.5 rounded border border-dashed px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground hover:border-primary hover:text-primary"
              aria-label={`Add a code to ${petName}`}
              data-testid="pet-code-add"
            >
              <Plus className="h-2.5 w-2.5" /> Code
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-2">
            <Input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(typed); } }}
              placeholder="Search, or type a new code"
              className="h-8 text-sm"
            />
            <div className="mt-2 max-h-56 overflow-y-auto">
              {suggestions.length === 0 && !typed.trim() && (
                <p className="px-1 py-2 text-xs text-muted-foreground">
                  {catalogue.isLoading ? "Loading codes…" : "Every code is already on this dog."}
                </p>
              )}
              {suggestions.map((row) => (
                <button
                  key={row.code}
                  type="button"
                  onClick={() => add(row.code)}
                  className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                  data-testid="pet-code-suggestion"
                >
                  <span className="font-semibold">{row.code}</span>
                  {row.description && <span className="truncate text-muted-foreground">{row.description}</span>}
                </button>
              ))}
            </div>
            {/* Free typing, deliberately. The person who finds out a dog
                bites is a groomer mid-groom, not an admin in Settings. */}
            {typed.trim() && !exactInCatalogue && !alreadyOnDog && (
              <Button
                size="sm"
                variant="outline"
                className="mt-2 w-full justify-start gap-1.5 text-xs"
                onClick={() => add(typed)}
                data-testid="pet-code-add-new"
              >
                <Check className="h-3 w-3" /> Add "{typed.trim()}" — not in the list yet
              </Button>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
