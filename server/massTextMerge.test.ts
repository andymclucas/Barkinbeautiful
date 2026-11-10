import { describe, it, expect } from "vitest";
import {
  CARD_LINK_TOKEN,
  MASS_TEXT_TOKENS,
  estimatedRenderedLength,
  renderMassTextBody,
  tokensUsed,
  usesCardLink,
} from "@shared/massTextMerge";
import {
  MASS_TEXT_AUDIENCES,
  MAX_BODY_LENGTH,
  describeAudience,
  validateAudience,
} from "@shared/massTextRecipients";

/**
 * Per-recipient values in a mass text, added 08/11/2026 for the MoeGo
 * cutover: 142 members each need their own card-setup link, and a mass
 * text sends one body to everybody.
 *
 * The failure these guard against is specific. A card link is a Stripe
 * Checkout session belonging to ONE customer, so a token that quietly
 * rendered empty — or the same URL for everybody — would either send a
 * broken sentence to 142 clients or point them all at one person's
 * session.
 */
describe("renderMassTextBody", () => {
  it("puts the client's own link in", () => {
    const r = renderMassTextBody(`Add a card: ${CARD_LINK_TOKEN}`, {
      cardLink: "https://x/cs_1",
    });
    expect(r).toEqual({ ok: true, body: "Add a card: https://x/cs_1" });
  });

  it("refuses rather than sending the sentence without the link", () => {
    // The whole point. "Put your card on file here:" with nothing after
    // it is worse than no message, and the row must read as failed
    // rather than delivered.
    for (const missing of [null, undefined, "", "   "]) {
      const r = renderMassTextBody(`Here: ${CARD_LINK_TOKEN}`, {
        cardLink: missing,
      });
      expect(r.ok).toBe(false);
    }
  });

  it("leaves a body with no token exactly as typed", () => {
    const body = "We're closed Monday.";
    expect(renderMassTextBody(body, { cardLink: null })).toEqual({
      ok: true,
      body,
    });
  });

  it("replaces every occurrence", () => {
    const r = renderMassTextBody(`${CARD_LINK_TOKEN} or ${CARD_LINK_TOKEN}`, {
      cardLink: "L",
    });
    expect(r).toEqual({ ok: true, body: "L or L" });
  });

  it("knows which tokens a body uses", () => {
    expect(usesCardLink(`a ${CARD_LINK_TOKEN} b`)).toBe(true);
    expect(usesCardLink("no tokens here")).toBe(false);
    expect(tokensUsed(`x ${CARD_LINK_TOKEN}`)).toEqual([CARD_LINK_TOKEN]);
    expect(tokensUsed("x")).toEqual([]);
  });
});

describe("estimatedRenderedLength", () => {
  it("counts what goes out, not what was typed", () => {
    /*
     * MAX_BODY_LENGTH is checked against the TEMPLATE, so an
     * 11-character token hiding a real link means the message that goes
     * out is longer than the number on the sender's screen — more
     * segments and more money than they agreed to.
     *
     * Read from the token's own estimate rather than a number written
     * here. This asserted "+80" against a ~100-character Stripe URL,
     * and when the link became a 65-character signed one on 10/11/2026
     * the assertion failed for the right reason and the wrong one: the
     * behaviour was fine, the magic number was stale. Pinned to the
     * source now, so shortening the link again cannot break it.
     */
    const card = MASS_TEXT_TOKENS.find(t => t.token === CARD_LINK_TOKEN)!;
    const body = `Card: ${CARD_LINK_TOKEN}`;
    expect(estimatedRenderedLength(body)).toBe(
      body.length - CARD_LINK_TOKEN.length + card.estimatedLength
    );
    // And it is still meaningfully longer than what was typed, which is
    // the thing the sender needs to be told.
    expect(estimatedRenderedLength(body)).toBeGreaterThan(body.length + 40);
  });

  it("is the plain length when there is no token", () => {
    expect(estimatedRenderedLength("hello")).toBe(5);
  });

  it("can exceed the typed limit, which is the warning worth having", () => {
    const body =
      "x".repeat(MAX_BODY_LENGTH - CARD_LINK_TOKEN.length) + CARD_LINK_TOKEN;
    expect(body.length).toBeLessThanOrEqual(MAX_BODY_LENGTH);
    expect(estimatedRenderedLength(body)).toBeGreaterThan(MAX_BODY_LENGTH);
  });

  it("describes every token it offers", () => {
    for (const t of MASS_TEXT_TOKENS) {
      expect(t.label.trim()).not.toBe("");
      expect(t.example.trim()).not.toBe("");
      expect(t.estimatedLength).toBeGreaterThan(t.token.length);
    }
  });
});

describe("the members-without-card audience", () => {
  it("is offered in the picker", () => {
    expect(MASS_TEXT_AUDIENCES.map(a => a.key)).toContain(
      "members_without_card"
    );
  });

  it("validates and describes itself", () => {
    const v = validateAudience({ kind: "members_without_card" });
    expect(v).toEqual({ ok: true, audience: { kind: "members_without_card" } });
    expect(describeAudience({ kind: "members_without_card" })).toMatch(
      /no card on file/i
    );
  });

  it("still refuses an audience it does not know", () => {
    expect(validateAudience({ kind: "everyone_ever" }).ok).toBe(false);
  });
});

describe("{agreement_link}", () => {
  it("fills in the client's own signing link", () => {
    const r = renderMassTextBody("Please sign here: {agreement_link}", { agreementLink: "https://x.au/sign/a.b.c" });
    expect(r).toEqual({ ok: true, body: "Please sign here: https://x.au/sign/a.b.c" });
  });

  it("refuses rather than send the sentence with no link", () => {
    expect(renderMassTextBody("Please sign here: {agreement_link}", { agreementLink: "" }).ok).toBe(false);
  });

  it("the suggested message, with its link, fits in two segments", async () => {
    const { calculateSmsCost } = await import("@shared/smsSegments");
    const { SUGGESTED_AGREEMENT_TEXT } = await import("@shared/massTextMerge");
    const rendered = renderMassTextBody(SUGGESTED_AGREEMENT_TEXT, {
      agreementLink: "https://staff.barkinbeautiful.com.au/sign/7tq.1abcdef.0123456789ab",
    });
    expect(rendered.ok).toBe(true);
    if (rendered.ok) expect(calculateSmsCost(rendered.body).segments).toBeLessThanOrEqual(2);
  });
});
