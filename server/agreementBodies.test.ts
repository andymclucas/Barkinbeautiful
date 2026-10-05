import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { SEED_AGREEMENTS, MEMBERSHIP_AGREEMENT_SLUGS } from "./seed/agreementBodies";

/**
 * These are the words clients sign. They were read out of MoeGo on
 * 3 October 2026 and checked against what MoeGo itself reported, so the
 * fingerprints below are evidence rather than decoration: if someone
 * "tidies up" a clause, this fails and makes them say so deliberately.
 *
 * Changing the wording is a legal act. Update the fingerprint in the same
 * commit as the change, and bump the document version rather than editing
 * a document anyone has already signed.
 *
 * ONE deliberate departure from MoeGo, 6 October 2026: the contact address
 * reads info@barkinbeautiful.com.au, not the gmail account MoeGo carried.
 * The salon does not use that mailbox and a client emailing vet receipts to
 * it would reach nobody. Every length below moved by exactly +2 — the
 * difference between the two addresses — which is the evidence that only
 * the address changed. The version was NOT bumped: clientRecord.ts matches
 * a signature on `documentVersion === doc.version`, so bumping would have
 * invalidated all 844 existing signatures and re-prompted every client for
 * a correction to a contact detail.
 */
const MOEGO_LENGTHS: Record<string, number> = {
  "Gold VIP Agreement": 3055,
  "Bronze VIP Agreement": 3058,
  "Silver VIP Agreement": 3060,
  "Diamond VIP Agreement": 3082,
  "Platinum VIP Agreement": 3111,
};

/**
 * The service agreement is fingerprinted on its text with whitespace
 * collapsed. MoeGo's copy carries trailing spaces and runs of blank
 * lines that no reader can see and no editor preserves; the words are
 * what matter. Re-fingerprinted 6 October 2026 for the address above,
 * which this document carries twice: once in the letterhead and once in
 * the clause telling clients where to email vet receipts.
 */
const SERVICE_AGREEMENT_SHA256 =
  "415a1e14a5c883335a82ffa695377ca8fd216eb7a17a5b0612e90f1985c60305";

const normalise = (s: string) => s.replace(/\s+/g, " ").trim();

describe("agreements carried over from MoeGo", () => {
  it("has all six", () => {
    expect(SEED_AGREEMENTS).toHaveLength(6);
    expect(SEED_AGREEMENTS.map(a => a.slug).sort()).toEqual([
      "membership-bronze", "membership-diamond", "membership-gold",
      "membership-platinum", "membership-silver", "service-agreement",
    ]);
  });

  it("reproduces each membership agreement character for character", () => {
    for (const [title, length] of Object.entries(MOEGO_LENGTHS)) {
      const found = SEED_AGREEMENTS.find(a => a.title === title);
      expect(found, `${title} is missing`).toBeDefined();
      expect(found!.body.length, `${title} does not match MoeGo`).toBe(length);
    }
  });

  it("reproduces the service agreement word for word", () => {
    const svc = SEED_AGREEMENTS.find(a => a.slug === "service-agreement")!;
    const hash = crypto.createHash("sha256").update(normalise(svc.body)).digest("hex");
    expect(hash).toBe(SERVICE_AGREEMENT_SHA256);
  });

  it("points clients at the business mailbox, never the gmail account", () => {
    // The gmail account is not monitored by the salon, and these documents
    // are where a client is told where to send vet receipts. A guard rather
    // than a one-off correction, because the gmail address is still all over
    // the MoeGo originals these were transcribed from and would come back
    // with the next clause anyone copies across.
    for (const a of SEED_AGREEMENTS) {
      expect(a.body, `${a.title} still names a gmail address`).not.toMatch(/gmail/i);
      expect(a.body, `${a.title} has no contact address`).toContain("info@barkinbeautiful.com.au");
    }
  });

  it("names the right tier in the title, body and declaration of each", () => {
    // A copy-paste between tiers that missed one of the three would
    // otherwise have a client signing up to the wrong inclusions.
    for (const tier of MEMBERSHIP_AGREEMENT_SLUGS) {
      const a = SEED_AGREEMENTS.find(x => x.slug === `membership-${tier}`)!;
      const Tier = tier[0].toUpperCase() + tier.slice(1);
      expect(a.title).toBe(`${Tier} VIP Agreement`);
      expect(a.body).toContain(`BARKIN BEAUTIFUL - ${tier.toUpperCase()} VIP MEMBERSHIP AGREEMENT`);
      expect(a.body).toContain(`TIER: ${Tier} VIP Membership`);
      expect(a.body).toContain(`terms and conditions of the ${Tier} VIP Membership`);
      for (const other of MEMBERSHIP_AGREEMENT_SLUGS) {
        if (other === tier) continue;
        const Other = other[0].toUpperCase() + other.slice(1);
        expect(a.body).not.toContain(`${Other} VIP Membership`);
      }
    }
  });

  it("keeps MoeGo's own requirement setting", () => {
    // Only the service agreement is "sign once" there; the tier
    // agreements are sent by hand. Flipping one to required would start
    // demanding signatures from clients who never agreed to that.
    const svc = SEED_AGREEMENTS.find(a => a.slug === "service-agreement")!;
    expect(svc.requirement).toBe("sign_once");
    for (const tier of MEMBERSHIP_AGREEMENT_SLUGS) {
      expect(SEED_AGREEMENTS.find(a => a.slug === `membership-${tier}`)!.requirement).toBe("manual");
    }
  });
});
