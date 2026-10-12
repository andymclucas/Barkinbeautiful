/**
 * Asking a client how the groom went, and what to do with the answer.
 *
 * The whole value is in the second half. A salon does not need more private
 * feedback — it needs public reviews, because that is what ranks it and what
 * the next customer reads. So a happy client is handed straight on to a
 * public review page, and an unhappy one is kept in, where the salon can
 * actually do something before it becomes a one-star in public.
 *
 * That split is a judgement about people, not a technical detail, which is
 * why it lives here as a tested function rather than inline in a component.
 *
 * It is NOT review gating in the deceptive sense: everyone is asked the same
 * question and everyone may leave a public review if they want one. The high
 * raters are simply the ones offered the link, because the others have told
 * us they have something to say to the salon first.
 */

export const MIN_RATING = 1;
export const MAX_RATING = 5;

/** At or above this, offer the public review link. */
export const PUBLIC_REVIEW_THRESHOLD = 4;

/** Long enough to be useful, short enough not to be an essay box. */
export const MAX_COMMENT_LENGTH = 1000;

export function isValidRating(rating: unknown): rating is number {
  return typeof rating === "number" && Number.isInteger(rating)
    && rating >= MIN_RATING && rating <= MAX_RATING;
}

export type ReviewRouting =
  /** Happy, and the salon has somewhere to send them. */
  | { kind: "public"; url: string; heading: string; body: string; cta: string }
  /** Happy, but no public review page is configured. */
  | { kind: "thanks"; heading: string; body: string }
  /** Not happy. Kept in, and the salon is told. */
  | { kind: "private"; heading: string; body: string };

/**
 * What to show once they have rated.
 *
 * `publicReviewUrl` null is a salon that has not set one up — they get the
 * thank-you, never a broken link.
 */
export function reviewRouting(
  rating: number,
  publicReviewUrl: string | null | undefined,
  salonName: string,
): ReviewRouting {
  const url = (publicReviewUrl ?? "").trim();
  if (rating >= PUBLIC_REVIEW_THRESHOLD) {
    if (!url) {
      return {
        kind: "thanks",
        heading: "Thank you!",
        body: `We're so glad you're happy — we'll pass that on to the team at ${salonName}.`,
      };
    }
    return {
      kind: "public",
      url,
      heading: "Thank you!",
      body: "Would you mind saying so publicly? It takes a few seconds and it genuinely helps a small salon.",
      cta: "Leave a public review",
    };
  }
  return {
    kind: "private",
    heading: "Thank you for telling us",
    body: `We'd rather hear it than not. ${salonName} will read this and get in touch.`,
  };
}

/** Whether this rating should put the card in front of the salon urgently. */
export function needsSalonAttention(rating: number): boolean {
  return rating < PUBLIC_REVIEW_THRESHOLD;
}

/** Trim and cap a comment, returning null when there is nothing in it. */
export function normaliseComment(comment: string | null | undefined): string | null {
  const text = String(comment ?? "").trim();
  if (!text) return null;
  return text.slice(0, MAX_COMMENT_LENGTH);
}

/** The headline figure for the salon: asked, answered, and the rate. */
export function responseRate(sent: number, received: number): number | null {
  if (!Number.isFinite(sent) || sent <= 0) return null;
  return received / sent;
}
