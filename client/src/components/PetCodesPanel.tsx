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
   * The catalogue minus what this dog already has, so the shortcuts are
   * only ever things that would actually change something — then
   * narrowed by whatever is being typed.
   *
   * The salon has around ninety codes. Showing all of them made the
   * fast path (type "#5", press the chip) slower than scrolling, which
   * defeats the point of the tab. Typing now filters, and the
   * description is searched too, so "nervous" finds a code called
   * PITA.
   */
  const needle = draft.trim().toLowerCase();
  const suggestions = (catalogue ?? [])
    .filter((c: { code: string }) => !current.some((x) => x.toLowerCase() === c.code.toLowerCase()))
    .filter((c: { code: string; description: string | null }) =>
      !needle ||
      c.code.toLowerCase().includes(needle) ||
      (c.description ?? "").toLowerCase().includes(needle),
    );

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

      <div className="space-y-1.5">
        <label className="text-xs font-medium" htmlFor={`code-${petId}`}>Add a code</label>
        <div className="flex gap-2">
          <Input
            id={`code-${petId}`}
            className="h-8 text-xs"
            placeholder="e.g. #5f, Nervous, No cologne"
            value={draft}
            maxLength={80}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(draft); } }}
          />
          <Button size="sm" className="h-8 gap-1" disabled={!draft.trim() || update.isPending} onClick={() => add(draft)}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Anything typed here is saved to the dog, whether or not the salon has used it before.
        </p>
      </div>

      {needle && suggestions.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          No existing code matches &ldquo;{draft.trim()}&rdquo; — Add saves it as a new one.
        </p>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium">
            {needle ? `Matching codes (${suggestions.length})` : "Codes the salon already uses"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((c: { id: number; code: string; description: string | null; colourHex: string | null }) => (
              <button
                key={c.id}
                type="button"
                title={c.description ?? undefined}
                disabled={update.isPending}
                onClick={() => add(c.code)}
                className="rounded-full border border-dashed px-2 py-0.5 text-xs transition-colors hover:border-solid hover:bg-accent disabled:opacity-50"
                style={c.colourHex ? { color: c.colourHex } : undefined}
              >
                + {c.code}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default PetCodesPanel;
