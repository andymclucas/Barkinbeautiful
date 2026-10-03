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
 */
const MOEGO_LENGTHS: Record<string, number> = {
  "Gold VIP Agreement": 3053,
  "Bronze VIP Agreement": 3056,
  "Silver VIP Agreement": 3058,
  "Diamond VIP Agreement": 3080,
  "Platinum VIP Agreement": 3109,
};

/**
 * The service agreement is fingerprinted on its text with whitespace
 * collapsed. MoeGo's copy carries trailing spaces and runs of blank
 * lines that no reader can see and no editor preserves; the words are
 * what matter and they are identical.
 */
const SERVICE_AGREEMENT_SHA256 =
  "a81e4858c80abb8cb014cd69004b323748e0bb3619c2c1be30d24bc9df653509";

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
