import { useState } from "react";
import { toast } from "sonner";
import { Hourglass, Pin, Plus, Star } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { getActiveTimeZone } from "@/lib/timezone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useTimezone } from "@/lib/timezone";
import { describeWaitlistWindow } from "@shared/waitlist";

/**
 * The eight figures a salon owner looks at before anything else.
 *
 * Every one comes from clients.messageContext, which already computed
 * them for the Messages panel — a second endpoint would be a second way
 * for the same number to be wrong.
 */
/**
 * Four tiles across a column that narrows once the pets panel appears,
 * so "$3,838.00" has about half the room "24" needs. Nine characters at
 * text-2xl does not fit; at text-lg it does.
 */
function sizeForValue(value: string): string {
  if (value.length <= 4) return "text-2xl";
  if (value.length <= 7) return "text-xl";
  if (value.length <= 9) return "text-lg";
  return "text-base";
}

export function ClientMetrics({ clientId }: { clientId: number }) {
  const { data } = trpc.clients.messageContext.useQuery({ clientId });
  const { data: reviews } = trpc.clientReviews.forClient.useQuery({ clientId });
  const { data: portal } = trpc.clientPortal.getAccountStatus.useQuery({ clientId });

  const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  // messageContext already folds paid invoices and counter payments into
  // one figure; don't re-add them here or the total doubles.
  const paid = Number(data?.totalPaid ?? 0);
  const outstanding = Number(data?.outstanding ?? 0);

  const tiles: { label: string; value: string; tone?: string; detail?: string }[] = [
    { label: "Upcoming", value: String(data?.upcoming ?? 0) },
    { label: "Outstanding", value: money(outstanding), tone: outstanding > 0 ? "text-red-600 dark:text-red-400" : undefined },
    { label: "Finished", value: String(data?.finished ?? 0) },
    { label: "Cancelled", value: String(data?.cancelled ?? 0) },
    { label: "No show", value: String(data?.noShow ?? 0), tone: (data?.noShow ?? 0) > 0 ? "text-amber-600 dark:text-amber-400" : undefined },
    { label: "Total paid", value: money(paid) },
    { label: "Total appts", value: String(data?.totalAppointments ?? 0) },
    {
      label: "Average review",
      value: reviews?.average != null ? String(reviews.average) : "—",
      detail: reviews?.count ? `${reviews.count} review${reviews.count === 1 ? "" : "s"}` : "none yet",
    },
    /*
     * Andy, 04/11/2026: "at a glance on the overview - show if the
     * client has setup and has access to their client portal
     * 'Yes/No'".
     *
     * Yes means ACTIVE, and only active. A setup link that was issued
     * and never used is not access — the client cannot sign in — so it
     * reads No with the reason underneath rather than a third state
     * nobody asked for. The full picture is still in Client portal,
     * which is where you go to do something about it.
     */
    {
      label: "Portal access",
      value: portal?.portalAccountStatus === "active" ? "Yes" : "No",
      tone: portal?.portalAccountStatus === "active"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-muted-foreground",
      detail: portal?.portalAccountStatus === "active"
        ? (portal.portalLastSignedInAt
            ? `last used ${new Date(portal.portalLastSignedInAt).toLocaleDateString("en-AU", { timeZone: getActiveTimeZone() })}`
            : "never signed in")
        : portal?.setupExpired
          ? "setup link expired"
          : portal?.portalAccountStatus === "setup_pending"
            ? "setup sent, not used"
            : portal?.portalAccountStatus === "revoked"
              ? "access revoked"
              : "not set up",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map(tile => (
        <Card key={tile.label}>
          <CardContent className="p-4">
            {/* Two lines reserved whether or not the label needs them:
                "Average review" wraps where "Upcoming" does not, and
                without this the numbers sat at different heights across
                the row. */}
            <p className="flex min-h-[2.4em] items-start text-xs font-medium uppercase leading-[1.2] tracking-wide text-muted-foreground">
              {tile.label}
            </p>
            {/* Sized to fit rather than clipped or ellipsised. The first
                attempt let it overflow ("$3,838.0", last digit gone) and
                the second truncated it ("$3,8…"), both of which read as
                a different number rather than as a layout fault. A
                figure has to be shown in full or not at all, so the type
                shrinks as the value gets longer. */}
            <p className={`mt-1 font-bold font-display leading-tight tabular-nums ${sizeForValue(tile.value)} ${tile.tone ?? ""}`}>
              {tile.value}
            </p>
            {/* Wraps rather than truncates, for the same reason the
                value above is sized rather than clipped: a detail cut to
                "last used 14…" does not answer the question it exists to
                answer. Andy, 05/11/2026: "Can't tell when portal was
                last accessed." The grid stretches every card in a row to
                the tallest, so a second line here costs nothing. */}
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{tile.detail ?? "\u00a0"}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Notes as a list with an author, which is what the salon actually needs:
 * "who said the dog bites" was unanswerable when every note overwrote the
 * single free-text field on the client row. That old field still exists
 * and is shown here, marked, rather than quietly dropped.
 */
export function ClientNotesPanel({ clientId }: { clientId: number }) {
  const tz = useTimezone();
  const utils = trpc.useUtils();
  const { data } = trpc.clientNotes.forClient.useQuery({ clientId });
  const [draft, setDraft] = useState("");
  const refresh = () => utils.clientNotes.forClient.invalidate({ clientId });

  const create = trpc.clientNotes.create.useMutation({
    onSuccess: () => { setDraft(""); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.clientNotes.update.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const remove = trpc.clientNotes.remove.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });

  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Client notes</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {data?.legacyNote && (
          <div className="rounded-lg border border-dashed p-3">
            <p className="whitespace-pre-wrap text-sm">{data.legacyNote}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">From the old single notes field — no author recorded.</p>
          </div>
        )}

        {data?.notes.map(note => (
          <div key={note.id} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="whitespace-pre-wrap text-sm">{note.body}</p>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" title={note.pinned ? "Unpin" : "Pin to the top"}
                  onClick={() => update.mutate({ id: note.id, pinned: !note.pinned })}>
                  <Pin className={`h-3.5 w-3.5 ${note.pinned ? "fill-current text-primary" : "text-muted-foreground"}`} />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" title="Delete this note"
                  onClick={() => remove.mutate({ id: note.id })}>
                  <span aria-hidden="true" className="text-muted-foreground">&times;</span>
                  <span className="sr-only">Delete note</span>
                </Button>
              </div>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">{note.authorName ?? "Unknown"} · {tz.dateTime(note.createdAt)}</p>
          </div>
        ))}

        {!data?.notes.length && !data?.legacyNote && <p className="text-sm text-muted-foreground">No notes on this client yet.</p>}

        <div className="space-y-2">
          <Textarea rows={2} value={draft} placeholder="Add a note — it records who wrote it and when."
            onChange={(e) => setDraft(e.target.value)} />
          <Button size="sm" className="gap-1.5" disabled={!draft.trim() || create.isPending}
            onClick={() => create.mutate({ clientId, body: draft.trim(), pinned: false })}>
            <Plus className="h-3.5 w-3.5" /> {create.isPending ? "Adding…" : "Add note"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Star rating plus comment, entered by staff after a visit. */
export function ClientReviewsPanel({ clientId }: { clientId: number }) {
  const tz = useTimezone();
  const utils = trpc.useUtils();
  const { data } = trpc.clientReviews.forClient.useQuery({ clientId });
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const refresh = () => utils.clientReviews.forClient.invalidate({ clientId });

  const create = trpc.clientReviews.create.useMutation({
    onSuccess: () => { setComment(""); setRating(5); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  const remove = trpc.clientReviews.remove.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          Reviews
          {data?.average != null && (
            <Badge variant="secondary" className="gap-1">
              <Star className="h-3 w-3 fill-current text-amber-500" /> {data.average} · {data.count}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data?.reviews.map(review => (
          <div key={review.id} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex gap-0.5" aria-label={`${review.rating} out of 5`}>
                {[1, 2, 3, 4, 5].map(n => (
                  <Star key={n} className={`h-3.5 w-3.5 ${n <= review.rating ? "fill-current text-amber-500" : "text-muted-foreground/30"}`} />
                ))}
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Delete this review"
                onClick={() => remove.mutate({ id: review.id })}>
                <span aria-hidden="true" className="text-muted-foreground">&times;</span>
                <span className="sr-only">Delete review</span>
              </Button>
            </div>
            {review.comment && <p className="mt-1.5 whitespace-pre-wrap text-sm">{review.comment}</p>}
            <p className="mt-1.5 text-xs text-muted-foreground">{tz.dateTime(review.createdAt)}</p>
          </div>
        ))}
        {!data?.reviews.length && <p className="text-sm text-muted-foreground">No reviews recorded for this client.</p>}

        <div className="space-y-2 rounded-lg border border-dashed p-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Rating</span>
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} star${n === 1 ? "" : "s"}`}>
                <Star className={`h-5 w-5 ${n <= rating ? "fill-current text-amber-500" : "text-muted-foreground/30"}`} />
              </button>
            ))}
          </div>
          <Textarea rows={2} value={comment} placeholder="What did they say? (optional)" onChange={(e) => setComment(e.target.value)} />
          <Button size="sm" disabled={create.isPending}
            onClick={() => create.mutate({ clientId, rating, comment: comment.trim() || undefined })}>
            {create.isPending ? "Saving…" : "Record review"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * What this client is waiting for, on the record rather than buried in
 * the calendar's waitlist panel.
 *
 * Andy, 05/11/2026: "I believe this client was added to the waitlist
 * yesterday for any Tuesday cancellations upcoming. Where does it show
 * this?" It did not — the only place a waitlist entry appeared was the
 * Waitlist panel on the calendar, which nobody opens while looking at a
 * client. The salon had exactly one active entry and it was invisible
 * from the one screen you would check.
 *
 * Renders nothing at all when there is nothing waiting, so the overview
 * does not grow an empty card for the 99% of clients who are not on it.
 */
export function ClientWaitlistPanel({
  clientId, onEdit,
}: { clientId: number; onEdit?: (entryId: number) => void }) {
  const { data } = trpc.waitlist.listEntries.useQuery({ clientId, status: "active" });
  const entries = data ?? [];
  if (entries.length === 0) return null;

  return (
    <Card className="border-amber-300/70 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Hourglass className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          On the waitlist
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {entries.map(entry => (
          <div key={entry.id} className="rounded-lg border bg-card p-2.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{entry.petName}</p>
                <p className="text-xs text-muted-foreground">
                  {describeWaitlistWindow(entry)}
                  {entry.preferredStaffName ? ` · prefers ${entry.preferredStaffName}` : ""}
                </p>
              </div>
              {onEdit && (
                <Button variant="outline" size="sm" className="h-7 shrink-0 text-xs"
                  onClick={() => onEdit(entry.id)}>
                  Edit
                </Button>
              )}
            </div>
            {/* The note is the part staff actually act on — "any Tuesday
                is best" is the whole reason the entry exists — so it is
                shown rather than hidden behind the Edit button. */}
            {entry.note && (
              <p className="mt-1.5 text-xs italic text-muted-foreground">“{entry.note}”</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
