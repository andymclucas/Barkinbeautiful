import { useState } from "react";
import { Star, ExternalLink } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { reviewRouting, type ReviewRouting } from "@shared/reviewRequest";

/**
 * "How did we do?" on the public grooming card.
 *
 * The card already reaches the client by SMS and is the moment they are
 * looking at their freshly groomed dog, which is the only moment they will
 * ever be this willing to say something nice. Asking anywhere else is asking
 * at a worse time.
 *
 * A rating posts immediately rather than waiting for a Submit button: most
 * people will tap a star and nothing else, and losing those because they did
 * not finish a form would defeat the point. The comment box appears after,
 * and saves separately.
 */
export function CardReviewPrompt({ token, petName }: { token: string; petName: string }) {
  const { data: state, isLoading } = trpc.groomingReports.getCardReviewState.useQuery({ token });
  const [rating, setRating] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [routing, setRouting] = useState<ReviewRouting | null>(null);
  const [commentSaved, setCommentSaved] = useState(false);

  const [saved, setSaved] = useState<ReviewRouting | null>(null);
  const submit = trpc.groomingReports.submitCardReview.useMutation({
    onSuccess: (result) => { setSaved(result as ReviewRouting); setRouting(result as ReviewRouting); },
  });
  const markOpened = trpc.groomingReports.markPublicReviewOpened.useMutation();

  // Already rated, or still loading: say nothing rather than ask twice.
  if (isLoading || !state || state.alreadyReviewed) return null;

  const choose = (value: number) => {
    if (rating !== null) return;
    setRating(value);
    // Optimistic: the thank-you shows immediately, and the write follows.
    setRouting(reviewRouting(value, state.hasPublicReviewPage ? "pending" : null, state.salonName));
    submit.mutate({ rating: value, token });
  };

  const shown = routing;
  const stars = (
    <div className="flex items-center justify-center gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const lit = (hovered ?? rating ?? 0) >= n;
        return (
          <button
            key={n}
            type="button"
            aria-label={`${n} out of 5`}
            disabled={rating !== null}
            className="rounded-full p-1 transition-transform hover:scale-110 disabled:cursor-default disabled:hover:scale-100"
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => choose(n)}
          >
            <Star className={`h-8 w-8 transition-colors ${lit ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
          </button>
        );
      })}
    </div>
  );

  return (
    <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-center">
      {!shown ? (
        <>
          <p className="text-sm font-semibold">How did we do with {petName}?</p>
          <p className="mb-3 mt-0.5 text-xs text-muted-foreground">Tap a star — it takes a second</p>
          {stars}
        </>
      ) : (
        <>
          {stars}
          <p className="mt-3 text-base font-bold">{shown.heading}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{shown.body}</p>

          {/* Rendered only once the server has handed back the real URL.
              The optimistic routing above is for the WORDING, so the
              thank-you appears the instant a star is tapped; the link itself
              waits rather than existing briefly with no destination. */}
          {saved?.kind === "public" && (
            <a
              href={saved.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
              onClick={() => markOpened.mutate({ token })}
            >
              <ExternalLink className="h-4 w-4" />
              {saved.cta}
            </a>
          )}

          {/* Offered to everyone, but it is the unhappy ones this is for:
              a rating with no explanation is not something a salon can act on. */}
          {!commentSaved ? (
            <div className="mx-auto mt-4 max-w-sm text-left">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="card-review-comment">
                {shown.kind === "private" ? "What went wrong?" : "Anything you'd like to add?"}
              </label>
              <textarea
                id="card-review-comment"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="mt-1 w-full rounded-lg border bg-card p-2 text-sm"
                placeholder="Optional"
              />
              <button
                type="button"
                disabled={!comment.trim() || submit.isPending}
                className="mt-2 w-full rounded-full border px-4 py-2 text-sm font-semibold transition-colors hover:bg-accent disabled:opacity-50"
                onClick={() => {
                  if (rating === null) return;
                  submit.mutate({ rating, comment, token });
                  setCommentSaved(true);
                }}
              >
                Send
              </button>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">Thank you — that&rsquo;s been passed on.</p>
          )}
        </>
      )}
    </section>
  );
}
