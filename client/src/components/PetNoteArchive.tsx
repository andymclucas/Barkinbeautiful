import { useState } from "react";
import { NotebookPen, ChevronDown, Lock } from "lucide-react";
import { noteArchiveForPet, type ArchivableAppointment } from "@shared/groomerNoteArchive";

/**
 * Every note written on this dog, on the dog's own card.
 *
 * Andy, 22/10/2026: "an archive of all notes from each appointment."
 *
 * The notes already existed, one per appointment. Reading them back
 * meant opening bookings one at a time, so in practice nobody did —
 * which is how the groomer who had Waffle last time ends up unable to
 * tell today's groomer that his ears were matted.
 *
 * Shows the most recent in full and folds the rest away. The last note
 * is the one that matters when a dog is on the table; the history
 * matters when you are deciding how long to book.
 */
export function PetNoteArchive({
  appointments,
  petId,
  petName,
  className = "",
}: {
  appointments: readonly ArchivableAppointment[];
  petId: number;
  petName: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const notes = noteArchiveForPet(appointments, petId);

  if (notes.length === 0) {
    return (
      <p className={`text-xs text-muted-foreground ${className}`} data-testid="note-archive-empty">
        No groomer notes on {petName} yet.
      </p>
    );
  }

  const shown = expanded ? notes : notes.slice(0, 1);
  const hidden = notes.length - shown.length;
  const when = (d: Date) =>
    d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Brisbane" });

  return (
    <div className={`space-y-1.5 ${className}`} data-testid="note-archive">
      <div className="flex items-center gap-1.5">
        <NotebookPen className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Groomer notes
        </p>
        {/* Says so on the card, so nobody has to wonder whether the owner
            can read what they just typed. */}
        <span
          className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-px text-[10px] font-medium text-muted-foreground"
          title="These notes are staff-only. They are never shown in the client portal."
        >
          <Lock className="h-2.5 w-2.5" /> Staff only
        </span>
      </div>

      <ul className="space-y-1.5">
        {shown.map((n) => (
          <li
            key={n.appointmentId}
            className="rounded-lg border bg-muted/40 px-2.5 py-2"
            data-testid="note-archive-entry"
          >
            <p className="whitespace-pre-wrap text-sm leading-snug">{n.note}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {when(n.when)}
              {n.groomer && ` · ${n.groomer}`}
            </p>
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          data-testid="note-archive-more"
        >
          <ChevronDown className="h-3 w-3" />
          Show {hidden} earlier note{hidden === 1 ? "" : "s"}
        </button>
      )}
      {expanded && notes.length > 1 && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-xs font-medium text-muted-foreground hover:underline"
          data-testid="note-archive-less"
        >
          Show fewer
        </button>
      )}
    </div>
  );
}
