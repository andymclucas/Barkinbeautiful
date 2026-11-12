import { describe, expect, it } from "vitest";
import { answerPortalMessage, neverForModel, offerToModel, safeModelReply, type PortalChatFacts } from "./portalChat";

const facts: PortalChatFacts = {
  clientFirstName: "Pat", nextAppointment: null, lastAppointment: null, petNames: ["Teddy"],
  membershipNames: [], salonPhone: null, salonEmail: null, openingHoursLabel: null,
};

describe("neverForModel", () => {
  it("keeps money, health, complaints and requests to change the diary away from the model", () => {
    for (const text of [
      "How much is a full groom?",
      "what do I owe",
      "Can I get a refund",
      "Teddy has a rash after his groom",
      "is it safe to bath him with fleas",
      "I'm really unhappy with the cut",
      "Please cancel Friday",
      "Move my appointment to Tuesday please",
      "I need to book Teddy in",
      "can you squeeze us in this week",
    ]) expect(neverForModel(text), text).toBe(true);
  });

  it("lets how-to questions about the portal through", () => {
    for (const text of [
      "How do I reschedule?",
      "Where do I update my card?",
      "how do I sign in on my phone",
      "Can I pay my invoice online?",
      "How can I book through here?",
      "I didn't get the code email",
    ]) expect(neverForModel(text), text).toBe(false);
  });
});

describe("safeModelReply", () => {
  it("passes an ordinary how-to answer", () => {
    const text = "Press Reschedule beside the appointment, pick a day and time, then Confirm new time.";
    expect(safeModelReply(`  ${text} `)).toBe(text);
  });

  it("throws away a price, a promise or nothing at all", () => {
    for (const text of [
      "A full groom is $95.",
      "It is about 120 dollars.",
      "I've moved your appointment to Friday.",
      "I will cancel that for you.",
      "I'll book Teddy in for Tuesday.",
      "   ",
      "x".repeat(1300),
    ]) expect(safeModelReply(text), text.slice(0, 40)).toBeNull();
  });
});

describe("the rules still answer first", () => {
  it("a lookup never needs the model", () => {
    const reply = answerPortalMessage("which dogs do you have for me", facts);
    expect(reply.intent).toBe("my_pets");
    expect(reply.handedOff).toBe(false);
  });
  it("offers the model what the rules gave up on, and how-to questions a loose keyword caught", () => {
    expect(offerToModel("I didn't get the code", "needs_human")).toBe(true);
    // "phone" trips the contact rule; it is really a how-to.
    expect(answerPortalMessage("how do I sign in on my phone", facts).intent).toBe("contact");
    expect(offerToModel("how do I sign in on my phone", "contact")).toBe(true);
    expect(offerToModel("what's your phone number", "contact")).toBe(false);
  });
  it("never offers a lookup or a forbidden topic", () => {
    expect(offerToModel("how do I see my next appointment", "next_appointment")).toBe(false);
    expect(offerToModel("how much is it", "needs_human")).toBe(false);
  });
});
