import { describe, expect, it } from "vitest";
import { bookingWarnings, worstBookingWarningTone } from "@shared/bookingWarnings";

describe("bookingWarnings", () => {
  it("says nothing for an ordinary client and an unflagged dog", () => {
    expect(
      bookingWarnings({
        client: { name: "Jane Smith", status: "active" },
        pets: [{ name: "Bella", alertLevel: "ok", warnings: null }],
      }),
    ).toEqual([]);
  });

  /**
   * The case this exists for. Both halves of it were in the database on
   * 02/11/2026 and neither reached the dialog.
   */
  it("warns on a blocked client and names them", () => {
    const [w] = bookingWarnings({
      client: { name: "Sebastian Cutugno", status: "blocked" },
      pets: [],
    });
    expect(w.tone).toBe("danger");
    expect(w.subject).toBe("Sebastian Cutugno");
    // The name lives on `subject` only. Repeating it in the text rendered
    // as "Sebastian Cutugno: Sebastian Cutugno is blocked".
    expect(w.text).toBe("This client is blocked. Check the client record before booking this in.");
    expect(w.text).not.toContain("Sebastian");
  });

  it("carries a danger dog's warning through in full", () => {
    const [w] = bookingWarnings({
      client: { name: "Sebastian Cutugno", status: "active" },
      pets: [
        {
          name: "Simba",
          alertLevel: "danger",
          warnings: "DO NOT BOOK IN — blacklisted. Check with Lauren before booking.",
        },
      ],
    });
    expect(w).toEqual({
      tone: "danger",
      kind: "pet-alert",
      subject: "Simba",
      text: "DO NOT BOOK IN — blacklisted. Check with Lauren before booking.",
    });
  });

  /**
   * The hole the client page's own badge has: it keys off alertLevel, so a
   * dog with only free text shows nothing. Three dogs were in that state on
   * 09/10/2026, one of them a biter.
   */
  it("flags a dog carrying only free text, as a caution", () => {
    const [w] = bookingWarnings({
      pets: [{ name: "Bear", alertLevel: "ok", warnings: "Bites for face and feet." }],
    });
    expect(w.tone).toBe("caution");
    expect(w.text).toBe("Bites for face and feet.");
  });

  it("strips the import's provenance out of the text", () => {
    const [w] = bookingWarnings({
      pets: [
        { name: "Coco", alertLevel: "caution", warnings: "MoeGo source alert (20 Aug 2026): allergy to chicken" },
      ],
    });
    expect(w.text).toBe("Allergy to chicken");
  });

  it("puts danger above caution however the dogs were ordered", () => {
    const out = bookingWarnings({
      client: { name: "Pat", status: "active" },
      pets: [
        { name: "Milo", alertLevel: "caution", warnings: "Nervous with clippers." },
        { name: "Rex", alertLevel: "danger", warnings: "Muzzle required." },
      ],
    });
    expect(out.map((w) => w.subject)).toEqual(["Rex", "Milo"]);
  });

  /**
   * A danger DOG is routinely bookable — the warning tells you how to do
   * the groom. Only the blocked CLIENT is a refusal, and the UI labels
   * them differently off this field.
   */
  it("separates a blocked client from a merely dangerous dog", () => {
    const out = bookingWarnings({
      client: { name: "Sebastian Cutugno", status: "blocked" },
      pets: [{ name: "Bear", alertLevel: "danger", warnings: "Bites for face and feet." }],
    });
    expect(out.map((w) => w.kind)).toEqual(["client-blocked", "pet-alert"]);
    expect(out.every((w) => w.tone === "danger")).toBe(true);
  });

  it("puts the blocked client above every dog", () => {
    const out = bookingWarnings({
      client: { name: "Sebastian Cutugno", status: "blocked" },
      pets: [{ name: "Simba", alertLevel: "danger", warnings: "DO NOT BOOK IN" }],
    });
    expect(out).toHaveLength(2);
    expect(out[0].subject).toBe("Sebastian Cutugno");
  });

  /** lapsed is a reason to want the booking, not to question it. */
  it.each(["active", "inactive", "lapsed"])("says nothing about a %s client", (status) => {
    expect(bookingWarnings({ client: { name: "Pat", status }, pets: [] })).toEqual([]);
  });

  it("matches the status whatever its case and spacing", () => {
    expect(bookingWarnings({ client: { name: "Pat", status: " Blocked " }, pets: [] })).toHaveLength(1);
  });

  it("falls back to a stand-in when nobody is named", () => {
    const out = bookingWarnings({
      client: { status: "blocked" },
      pets: [{ alertLevel: "danger", warnings: null }],
    });
    expect(out[0].subject).toBe("This client");
    expect(out[1].subject).toBe("This dog");
    expect(out[1].text).toBe("Danger alert on this dog.");
  });

  it("tolerates no client and no pets at all", () => {
    expect(bookingWarnings({})).toEqual([]);
    expect(bookingWarnings({ client: null, pets: null })).toEqual([]);
  });
});

describe("worstBookingWarningTone", () => {
  it("is null when there is nothing to say", () => {
    expect(worstBookingWarningTone([])).toBeNull();
  });

  it("is danger when any one of them is", () => {
    expect(
      worstBookingWarningTone([
        { tone: "caution", kind: "pet-alert", subject: "Milo", text: "x" },
        { tone: "danger", kind: "pet-alert", subject: "Rex", text: "y" },
      ]),
    ).toBe("danger");
  });

  it("is caution when they all are", () => {
    expect(
      worstBookingWarningTone([{ tone: "caution", kind: "pet-alert", subject: "Milo", text: "x" }]),
    ).toBe("caution");
  });
});
