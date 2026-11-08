/**
 * Per-recipient values in a mass text.
 *
 * A mass text sends ONE body to everybody, which is the right default and
 * is why the preview count and the send cannot disagree. But getting
 * Barkin' Beautiful off MoeGo needs 142 members to each put a card on
 * file, and a card-setup link belongs to one client — the same URL sent
 * to everybody would be one person's Stripe Checkout session.
 *
 * So the body stays one template and `{card_link}` is filled in per
 * recipient at send time. The preview, the confirmation count and the
 * batch machinery are untouched.
 *
 * ## Why so few tokens
 *
 * One, for now. Every token is a way for a message to read wrongly to a
 * real client — "Hi {first_name}" with a blank name is worse than "Hi".
 * `{card_link}` earns its place because without it the card campaign
 * cannot be sent at all; a name does not.
 */

export const CARD_LINK_TOKEN = "{card_link}";

export type MassTextToken = {
  token: string;
  label: string;
  /** What the sender is told it becomes. */
  example: string;
  /**
   * Roughly how long the filled-in value runs, for the length estimate.
   * A Stripe Checkout URL is ~100 characters and they are not short.
   */
  estimatedLength: number;
};

export const MASS_TEXT_TOKENS: readonly MassTextToken[] = [
  {
    token: CARD_LINK_TOKEN,
    label: "Card setup link",
    example: "https://checkout.stripe.com/c/pay/cs_live_…",
    estimatedLength: 100,
  },
];

/** Which tokens a body actually uses. */
export function tokensUsed(body: string): string[] {
  return MASS_TEXT_TOKENS.filter((t) => body.includes(t.token)).map((t) => t.token);
}

export function usesCardLink(body: string): boolean {
  return body.includes(CARD_LINK_TOKEN);
}

/**
 * What the message will really be once the tokens are filled in.
 *
 * The sender types a template and the limit is checked against the
 * template, so a 400-character body carrying `{card_link}` becomes ~490
 * characters on the way out — more segments, and more money, than the
 * number on the screen suggested. This is what the preview shows instead.
 */
export function estimatedRenderedLength(body: string): number {
  let length = body.length;
  for (const t of MASS_TEXT_TOKENS) {
    if (!body.includes(t.token)) continue;
    const occurrences = body.split(t.token).length - 1;
    length += occurrences * (t.estimatedLength - t.token.length);
  }
  return length;
}

/**
 * Fill a body in for one recipient.
 *
 * A token with no value is a REFUSAL, not an empty string. Sending
 * "put your card on file here:" with nothing after it would be worse
 * than sending nothing, and the row is marked failed so it shows in the
 * batch rather than reading as delivered.
 */
export type RenderResult =
  | { ok: true; body: string }
  | { ok: false; error: string };

export function renderMassTextBody(
  body: string,
  values: { cardLink?: string | null },
): RenderResult {
  let out = body;
  if (body.includes(CARD_LINK_TOKEN)) {
    const link = values.cardLink?.trim();
    if (!link) {
      return { ok: false, error: "No card setup link could be created for this client" };
    }
    out = out.split(CARD_LINK_TOKEN).join(link);
  }
  return { ok: true, body: out };
}
