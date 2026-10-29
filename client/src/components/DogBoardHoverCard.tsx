import { AlertTriangle, ArrowUpRight, Clock, Scissors, Sparkles, StickyNote } from "lucide-react";
import { PetLink } from "./RecordLink";
import { dogBoardSummary, type DogBoardRow } from "@shared/dogBoardSummary";
import { collectByTone } from "@shared/collectBy";

/**
 * What a groomer sees when they hover a dog on the board.
 *
 * Andy, 22/10/2026: "When hovering over a dog, ensure all details
 * including grooming notes, add-ons, time out etc are shown."
 *
 * The order is the order it matters in — alert, out-time, extras, how
 * the dog is cut, then today's notes — and it comes from
 * shared/dogBoardSummary.ts so this card and the click-through dialog
 * cannot end up saying different things about the same dog.
 *
 * Long notes are clamped here, not truncated: the point of the hover is
 * to decide whether to open the dialog, and the card says so when there
 * is more to read.
 */
/**
 * The row also carries the ids the board already queries, which the
 * summary type has no reason to know about.
 */
type HoverRow = DogBoardRow & { clientId?: number | null; petId?: number | null };

export function DogBoardHoverCard({ row }: { row: HoverRow }) {
  const s = dogBoardSummary(row);

  /**
   * The way to the client's record FROM the board.
   *
   * The dog's name on the board is a button that opens grooming notes —
   * staff press it all day and it must keep doing that. So the record
   * link lives here, one hover away, rather than taking the name's job.
   *
   * This replaces a footer that read "Click the name for the full
   * record", which was simply untrue: clicking the name opened the
   * notes.
   */
  const recordLink = (
    <p className="border-t pt-1.5 text-[10px]">
      <PetLink
        clientId={row.clientId}
        petId={row.petId}
        className="inline-flex items-center gap-0.5 font-medium text-muted-foreground"
        title={`Open ${row.petName ?? "this dog"}'s record`}
      >
        Open {row.petName ?? "this dog"}&rsquo;s record <ArrowUpRight className="h-2.5 w-2.5" />
      </PetLink>
    </p>
  );

  if (s.isEmpty) {
    return (
      <div className="w-64 space-y-2 p-1 text-xs text-muted-foreground" data-testid="dog-hover">
        <p>Nothing recorded for {row.petName ?? "this dog"} yet.</p>
        {recordLink}
      </div>
    );
  }

  return (
    <div className="w-72 space-y-2 p-1 text-xs" data-testid="dog-hover">
      {/* 1. Anything that could hurt somebody, first and loudest. */}
      {s.alert && (
        <div
          className={`flex items-start gap-1.5 rounded-md p-2 ${
            s.alert.level === "danger"
              ? "bg-red-50 text-red-900 ring-1 ring-red-300 dark:bg-red-950/60 dark:text-red-200 dark:ring-red-800"
              : "bg-amber-50 text-amber-900 ring-1 ring-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:ring-amber-800"
          }`}
          data-testid="hover-alert"
        >
          <AlertTriangle className="mt-px h-3.5 w-3.5 flex-none" />
          <span>
            <span className="font-bold capitalize">{s.alert.level}</span>
            {s.alert.text && <span className="ml-1">{s.alert.text}</span>}
          </span>
        </div>
      )}

      {/* 2. When it has to be gone. */}
      {s.collect && (
        <div className="flex items-center gap-1.5" data-testid="hover-collect">
          <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-extrabold ${collectByTone(s.collect.risk)}`}>
            <Clock className="h-3 w-3" /> {s.collect.label}
          </span>
          {s.collect.risk !== "comfortable" && (
            <span className="text-muted-foreground">
              {s.collect.minutesLeft < 0
                ? `${Math.abs(s.collect.minutesLeft)} min past`
                : `${s.collect.minutesLeft} min left, about ${s.collect.minutesNeeded} min of work`}
            </span>
          )}
        </div>
      )}

      {/* 3. What has been sold. */}
      {s.addOnBadges.length > 0 && (
        <div data-testid="hover-addons">
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">Add-ons</p>
          <p className="mt-0.5 flex items-start gap-1.5">
            <Sparkles className="mt-px h-3 w-3 flex-none text-amber-600" />
            <span>{s.addOnLine}</span>
          </p>
        </div>
      )}

      {/* 4. How this dog is cut. */}
      {(s.styleNote || s.styleWarnings) && (
        <div data-testid="hover-style">
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">Grooming notes</p>
          {s.styleNote && (
            <p className="mt-0.5 flex items-start gap-1.5">
              <Scissors className="mt-px h-3 w-3 flex-none text-violet-600" />
              <span className="line-clamp-3">{s.styleNote}</span>
            </p>
          )}
          {s.styleWarnings && (
            <p className="mt-0.5 text-amber-800 dark:text-amber-300">{s.styleWarnings}</p>
          )}
        </div>
      )}

      {/* 5. Typed on the day. */}
      {(s.appointmentNotes || s.boardNote) && (
        <div data-testid="hover-notes">
          <p className="font-semibold uppercase tracking-wide text-muted-foreground">Today</p>
          {s.appointmentNotes && (
            <p className="mt-0.5 flex items-start gap-1.5">
              <StickyNote className="mt-px h-3 w-3 flex-none text-slate-500" />
              <span className="line-clamp-3">{s.appointmentNotes}</span>
            </p>
          )}
          {s.boardNote && <p className="mt-0.5 text-muted-foreground">{s.boardNote}</p>}
        </div>
      )}

      {s.codes.length > 0 && (
        <div className="flex flex-wrap gap-1" data-testid="hover-codes">
          {s.codes.map((code) => (
            <span key={code} className="rounded bg-muted px-1 py-px text-[10px] font-semibold">
              {code}
            </span>
          ))}
        </div>
      )}

      {recordLink}
    </div>
  );
}
