/**
 * The dog's grooming record, on the workflow board's dog card.
 *
 * Lauren via Andy, 04/11/2026: "on the workflow can we add the grooming
 * notes tab to the dogs card to easily update the days grooming notes
 * and save from there?"
 *
 * It is the note a groomer writes while the dog is in front of them —
 * blade, length, what the owner asked for, what went wrong. Until now
 * the only way to record one was to leave the board, open the calendar
 * and find the booking, which is why the board's cards carried a
 * grooming note staff could read and not write.
 *
 * Distinct from the appointment notes beside it. Those are about
 * today's visit and live on the appointment; this is the dog's styling
 * history and lives per pet in `groom_style_notes`, which is what the
 * NEXT groomer reads months later.
 *
 * ## Saving appends, it does not overwrite
 *
 * `groomNotes.create` inserts. There is no update procedure, and that
 * is right for a grooming record: what was done to a dog on a given day
 * is not something a later shift should be able to rewrite. So editing
 * and saving adds an entry, and the newest one is what the board shows.
 * The recent list below makes that visible rather than surprising.
 */
import { useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { groomNoteSaveable } from "@shared/groomNoteDraft";

export function GroomingNoteTab({
  petId,
  appointmentId,
  petName,
  existing,
  onSaved,
}: {
  /** The dog. Null only for a row with no pet attached, which cannot have notes. */
  petId: number | null;
  appointmentId: number;
  petName: string;
  /** The latest note already against this booking, as the board has it. */
  existing: string | null;
  onSaved: (note: string) => void;
}) {
  /*
   * The draft lives here, not in the board's state, and the card gives
   * this component a `key` of the appointment id — so opening a
   * different dog mounts a fresh one rather than carrying the last
   * dog's half-typed note across to it.
   */
  const [value, onChange] = useState(existing ?? "");
  const [saving, setSaving] = useState(false);
  const utils = trpc.useUtils();

  const recent = trpc.groomNotes.listByPet.useQuery(
    { petId: petId ?? 0 },
    { enabled: petId !== null, staleTime: 30_000 },
  );

  const create = trpc.groomNotes.create.useMutation();

  if (petId === null) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        This row has no dog attached, so there is nothing to keep a grooming note against.
      </p>
    );
  }

  const draft = value.trim();
  /* Whether Save does anything is a rule, not a detail: create INSERTS,
     so a pointless save appends a duplicate to the dog's permanent
     styling history. Kept in shared/ with its own tests. */
  const canSave = groomNoteSaveable({ draft: value, existing });

  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`What was done to ${petName} today — blade, length, what the owner asked for…`}
        rows={3}
        className="resize-none text-sm"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">Saved against {petName}&rsquo;s record</p>
        <Button
          size="sm"
          className="h-7 gap-1.5 text-xs"
          disabled={saving || !canSave}
          onClick={async () => {
            setSaving(true);
            try {
              await create.mutateAsync({ petId, appointmentId, note: draft });
              onSaved(draft);
              /* The board draws the latest note on the row, and the list
                 below is this same pet's history — both are now stale. */
              await Promise.all([
                utils.groomNotes.listByPet.invalidate({ petId }),
                utils.workflow.getBoard.invalidate(),
              ]);
              toast.success("Grooming note saved");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not save the note");
            } finally {
              setSaving(false);
            }
          }}
        >
          <Save className="h-3 w-3" />
          {saving ? "Saving…" : "Save note"}
        </Button>
      </div>

      {recent.data && recent.data.length > 0 && (
        <div className="space-y-1 border-t pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Earlier notes
          </p>
          {/* A few, not all. This is a card on a board, not the dog's file. */}
          {recent.data.slice(0, 3).map((note: { id: number; note: string | null; createdAt: Date | string | null }) => (
            <div key={note.id} className="rounded-md bg-muted/60 px-2 py-1.5">
              <p className="text-[11px] text-muted-foreground">
                {note.createdAt
                  ? new Date(note.createdAt).toLocaleDateString("en-AU", {
                      day: "numeric", month: "short", year: "numeric",
                    })
                  : "—"}
              </p>
              <p className="text-xs whitespace-pre-wrap">{note.note || "(no text)"}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default GroomingNoteTab;
