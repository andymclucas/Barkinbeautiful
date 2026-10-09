import { describe, expect, it } from "vitest";
import {
  CLIENT_SAFE_GROOM_CARD_FIELDS,
  toClientSafeGroomCard,
} from "@shared/groomingCard";

/**
 * The public card at /card/:token opens for anyone holding the link, with no
 * sign-in. These assert the one thing that must never slip: the salon's
 * internal note on a dog does not travel with it.
 */
describe("toClientSafeGroomCard", () => {
  const row = {
    id: 7,
    petName: "Link",
    additionalNote: "Superstar!",
    overallRating: "pawfect",
    // Everything below is the salon's business, not the client's.
    groomerNotes: "Bites when you do the back feet. Muzzle next time.",
    tenantId: 1,
    appointmentId: 42,
    shareToken: "abc",
  };

  it("drops the groomer's internal note", () => {
    const safe = toClientSafeGroomCard(row);
    expect(safe).not.toHaveProperty("groomerNotes");
    expect(JSON.stringify(safe)).not.toContain("Muzzle");
  });

  it("drops anything not on the list, not just the note", () => {
    const safe = toClientSafeGroomCard(row);
    expect(safe).not.toHaveProperty("tenantId");
    expect(safe).not.toHaveProperty("appointmentId");
  });

  it("keeps what the card is actually made of", () => {
    const safe = toClientSafeGroomCard(row);
    expect(safe).toMatchObject({
      id: 7,
      petName: "Link",
      additionalNote: "Superstar!",
      overallRating: "pawfect",
    });
  });

  it("omits a field the row does not carry rather than inventing an undefined", () => {
    expect(toClientSafeGroomCard({ id: 1 })).not.toHaveProperty("petName");
  });

  it("is a whitelist — groomerNotes can never be added to it by accident", () => {
    // Belt and braces: if someone adds the field to the list above, this fails
    // loudly rather than the leak being discovered by a client.
    expect(CLIENT_SAFE_GROOM_CARD_FIELDS as readonly string[]).not.toContain("groomerNotes");
  });
});
