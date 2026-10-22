import { useState } from "react";
import { NotebookPen, ChevronDown, Lock, Scissors } from "lucide-react";
import {
  noteArchiveForPet,
  type ArchivableAppointment, type ArchivableStyleNote,
} from "@shared/groomerNoteArchive";

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
  styleNotes = [],
  petId,
  petName,
  className = "",
}: {
  appointments: readonly ArchivableAppointment[];
  styleNotes?: readonly ArchivableStyleNote[];
  petId: number;
  petName: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const notes = noteArchiveForPet(appointments, petId, styleNotes);

  if (notes.length === 0) {
    return (
      <p className={`text-xs text-muted-foreground ${className}`} data-testid="note-archive-empty">
        No groomer notes on {petName} yet.
      </p>
    );
  }

  // Two when collapsed, not one: the newest is often a style note
  // and the groom it describes sits right under it, so showing one
  // would hide what actually happened that day.
  const shown = expanded ? notes : notes.slice(0, 2);
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
            key={n.key}
            className={`rounded-lg border px-2.5 py-2 ${
              // Style notes get the violet edge the Style Notes tab uses,
              // so "how this dog is cut" is distinguishable at a glance
              // from "what happened on the day".
              n.kind === "style"
                ? "border-l-2 border-l-violet-400 bg-violet-50/40 dark:bg-violet-950/30"
                : "bg-muted/40"
            }`}
            data-testid="note-archive-entry"
            data-kind={n.kind}
          >
            {n.kind === "style" && (
              <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                <Scissors className="h-2.5 w-2.5" /> Style
              </p>
            )}
            {n.styleSummary && (
              <p className="text-xs font-medium text-violet-900 dark:text-violet-200">{n.styleSummary}</p>
            )}
            {n.note && (
              <p className="whitespace-pre-wrap text-sm leading-snug">{n.note}</p>
            )}
            {n.warnings && (
              <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-300">
                {n.warnings}
              </p>
            )}
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
