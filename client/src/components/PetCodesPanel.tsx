/**
 * A dog's codes, editable from the booking it is on.
 *
 * Lauren, 03/11/2026: "Can we press on the dogs name for a short cut to
 * put a pet code in and get to it's file.. instead of going through the
 * customer.. then into the pet.. to add a pet code".
 *
 * Andy asked for it as a tab beside Details / Grooming Report / Style
 * Notes, which is the better shape: a groomer with the booking open can
 * tag the dog without losing the booking, and the tab works the same
 * whether the booking has one dog or four.
 *
 * No new endpoints. `petCodes.list` already serves the catalogue with
 * its descriptions and colours, and `pets.updateCodes` already writes a
 * pet's codes — both operational, so the salon floor can already do
 * this; it was only ever three screens away.
 *
 * A code is free text on the pet (`moegoCodeLabels`), and the catalogue
 * is what gives it a meaning and a colour. That is why a brand-new code
 * can be typed straight in here and saved: it attaches to the dog
 * immediately, and registering it in the catalogue is a separate,
 * optional act for somebody who can edit salon-wide settings.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Pencil, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parsePetCodes } from "@shared/petCodes";
import { RESTING_CODE_LIMIT, isNewCode, searchPetCodes } from "@shared/petCodeSearch";

export function PetCodesPanel({ petId, petName, codes, onSaved }: {
  petId: number;
  petName: string | null;
  /** What the booking already knows, so the panel paints before any fetch. */
  codes: string | null;
  onSaved?: () => void;
}) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState("");

  /*
   * The codes this panel shows, seeded from the booking and then owned
   * here.
   *
   * `codes` arrives from the dialog's snapshot of the appointment,
   * which does NOT refresh while the dialog is open — so after a save
   * the panel went on saying "No codes on this dog yet" about a dog
   * that had just been given one, and the obvious next move is to add
   * it again. updateCodes returns exactly what it stored, so that
   * becomes the truth from the first save onwards.
   */
  const fromBooking = useMemo(() => parsePetCodes(codes), [codes]);
  const [saved, setSaved] = useState<string[] | null>(null);
  /** The code currently being renamed on this dog, and its new text. */
  const [editing, setEditing] = useState<{ was: string; now: string } | null>(null);
  /** The salon has ~90 codes; the full list is opt-in. */
  const [showAll, setShowAll] = useState(false);
  // A different dog in the sub-tabs is a different list.
  useEffect(() => { setSaved(null); setDraft(""); setEditing(null); setShowAll(false); }, [petId]);
  const current = saved ?? fromBooking;

  const { data: catalogue } = trpc.petCodes.list.useQuery({ includeInactive: false });

  const update = trpc.pets.updateCodes.useMutation({
    onSuccess: (result) => {
      setSaved(result.codes);
      // The dog's codes show on the board and the client record too, so
      // everything that reads them is refreshed, not just this dialog.
      utils.calendar.invalidate();
      utils.pets.invalidate();
      utils.petCodes.invalidate();
      onSaved?.();
    },
    onError: (e) => toast.error(e.message),
  });

  const save = (next: string[]) => update.mutate({ petId, codes: next });

  const add = (code: string) => {
    const clean = code.trim();
    if (!clean) return;
    // parsePetCodes de-duplicates, but checking here keeps the toast
    // honest rather than reporting a save that changed nothing.
    if (current.some((c) => c.toLowerCase() === clean.toLowerCase())) {
      toast.info(`${petName ?? "This dog"} already has ${clean}`);
      setDraft("");
      return;
    }
    save([...current, clean]);
    setDraft("");
  };

  /**
   * Renaming is a replace at the same position, not a remove and an
   * add. "Ner" becoming "Nervous" should stay where it was in the list
   * rather than jumping to the end, because staff read these in the
   * order they were put on.
   */
  const rename = (was: string, now: string) => {
    const clean = now.trim();
    setEditing(null);
    if (!clean || clean === was) return;
    if (current.some((c) => c.toLowerCase() === clean.toLowerCase() && c !== was)) {
      toast.info(`${petName ?? "This dog"} already has ${clean}`);
      return;
    }
    save(current.map((c) => (c === was ? clean : c)));
  };

  const meaningOf = (code: string) =>
    catalogue?.find((c: { code: string }) => c.code.toLowerCase() === code.toLowerCase());

  /*
   * The ranking lives in `shared/petCodeSearch.ts`, not here — it is the
   * part with the awkward cases (an exact `#3` above `#3 PFFT`, a
   * description match that is really a coincidence) and it is worth
   * testing without a dialog around it.
   *
   * Two states, not one. Typing narrows and ranks; typing nothing still
   * has to offer something, and "the first twelve alphabetically" is
   * three blade numbers and no handling rule. At rest the list is the
   * codes most dogs actually carry, capped so the Add box above it stays
   * on screen, with the rest one click away.
   */
  const needle = draft.trim();
  const hits = useMemo(
    () => searchPetCodes(catalogue ?? [], needle, { exclude: current }),
    [catalogue, needle, current],
  );
  const searching = needle.length > 0;
  // A search is already narrow; capping it is how a picker hides the one
  // thing somebody was looking for.
  const capped = searching || showAll ? hits : hits.slice(0, RESTING_CODE_LIMIT);
  const hiddenCount = hits.length - capped.length;
  const wouldCreate = isNewCode(catalogue ?? [], needle);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">{petName ?? "This dog"}&rsquo;s codes</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Saved to the dog, so they show on the board and the client record too.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {current.length === 0 && (
          <p className="text-xs text-muted-foreground">No codes on this dog yet.</p>
        )}
        {current.map((code) => {
          const meta = meaningOf(code);
          if (editing?.was === code) {
            return (
              <span key={code} className="inline-flex items-center gap-1">
                <Input
                  autoFocus
                  className="h-7 w-36 text-xs"
                  value={editing.now}
                  maxLength={80}
                  onChange={(e) => setEditing({ was: code, now: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); rename(code, editing.now); }
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
                <button
                  type="button"
                  aria-label={`Save ${code}`}
                  className="text-emerald-600"
                  onClick={() => rename(code, editing.now)}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </span>
            );
          }
          return (
            <span
              key={code}
              title={meta?.description ?? undefined}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
              style={meta?.colourHex ? { borderColor: meta.colourHex, color: meta.colourHex } : undefined}
            >
              {code}
              <button
                type="button"
                aria-label={`Edit ${code}`}
                className="opacity-50 transition-opacity hover:opacity-100"
                disabled={update.isPending}
                onClick={() => setEditing({ was: code, now: code })}
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                aria-label={`Remove ${code}`}
                className="opacity-60 transition-opacity hover:opacity-100"
                disabled={update.isPending}
                onClick={() => save(current.filter((c) => c !== code))}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        {update.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>

      {/*
        * One box, not two.
        *
        * Searching the vocabulary and adding a code are the same keystrokes:
        * you type what you want and either press the chip that comes back or
        * press Add. A separate search field would mean typing "#5f" twice to
        * find out the salon spells it "✂5f".
        */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium" htmlFor={`code-${petId}`}>Search or add a code</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={`code-${petId}`}
              className="h-8 pl-7 pr-7 text-xs"
              placeholder="e.g. #5f, nervous, no cologne"
              value={draft}
              maxLength={80}
              autoComplete="off"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); add(draft); }
                if (e.key === "Escape" && draft) { e.preventDefault(); setDraft(""); }
              }}
            />
            {draft && (
              <button
                type="button"
                aria-label="Clear the search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setDraft("")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button size="sm" className="h-8 gap-1" disabled={!draft.trim() || update.isPending} onClick={() => add(draft)}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {!searching
            ? "Searches the code and what it means, so \u201cnervous\u201d finds a code called Ner."
            : wouldCreate
              ? `Nothing in the salon\u2019s list is spelled \u201c${needle}\u201d \u2014 Add saves it to this dog as a new one.`
              : `Add attaches \u201c${needle}\u201d, which the salon already uses.`}
        </p>
      </div>

      {searching && hits.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          No code in the salon&rsquo;s list matches &ldquo;{needle}&rdquo;.
        </p>
      )}

      {capped.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">
            {searching
              ? `Matching codes (${hits.length})`
              : `Most used${hiddenCount > 0 ? ` (${capped.length} of ${hits.length})` : ""}`}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {capped.map(({ entry, matchedOn }) => (
              <button
                key={entry.id}
                type="button"
                title={entry.description ?? undefined}
                disabled={update.isPending}
                onClick={() => add(entry.code)}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-xs transition-colors hover:border-solid hover:bg-accent disabled:opacity-50"
                style={entry.colourHex ? { color: entry.colourHex } : undefined}
              >
                <span className="shrink-0">+ {entry.code}</span>
                {/*
                  * When the DESCRIPTION is what matched, show it. Searching
                  * "nervous" returns a code spelled `Ner`, and a bare chip
                  * reading "+ Ner" looks like a bug until you can see why it
                  * is there.
                  */}
                {matchedOn === "description" && entry.description && (
                  <span className="truncate font-normal text-muted-foreground">
                    &middot; {entry.description}
                  </span>
                )}
              </button>
            ))}
          </div>
          {hiddenCount > 0 && (
            <button
              type="button"
              className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setShowAll(true)}
            >
              Show all {hits.length} codes
            </button>
          )}
          {showAll && !searching && hits.length > RESTING_CODE_LIMIT && (
            <button
              type="button"
              className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setShowAll(false)}
            >
              Show fewer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default PetCodesPanel;
