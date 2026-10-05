import { describe, expect, it } from "vitest";
import {
  answerPortalMessage, requiresHuman, unreadForClient, unreadForStaff,
  type PortalChatFacts,
} from "../shared/portalChat";

const facts: PortalChatFacts = {
  clientFirstName: "Toni",
  nextAppointment: { petName: "Millie", whenLabel: "Wed, 14 Oct at 11:30 am", groomerName: "Megs Graham" },
  lastAppointment: { petName: "Cosi", whenLabel: "Wed, 30 Sept" },
  petNames: ["Cosi", "Millie"],
  membershipNames: ["Diamond VIP - SML (0-10kg) x2"],
  salonPhone: "07 3823 4567",
  salonEmail: "info@barkinbeautiful.com.au",
  openingHoursLabel: "We're open Tuesday to Friday, 7:30am to 2:30pm.",
};

describe("the assistant answers only from the client's own record", () => {
  it("gives the next appointment with the groomer", () => {
    const r = answerPortalMessage("when is my next appointment?", facts);
    expect(r.intent).toBe("next_appointment");
    expect(r.handedOff).toBe(false);
    expect(r.body).toContain("Millie");
    expect(r.body).toContain("Wed, 14 Oct at 11:30 am");
    expect(r.body).toContain("Megs Graham");
  });

  it("gives the last visit", () => {
    const r = answerPortalMessage("when did Cosi last come in", facts);
    expect(r.intent).toBe("last_appointment");
    expect(r.handedOff).toBe(false);
    expect(r.body).toContain("Cosi");
  });

  it("lists the pets on file", () => {
    const r = answerPortalMessage("what dogs do i have on file", facts);
    expect(r.body).toBe("We have Cosi and Millie on file for you.");
    expect(r.handedOff).toBe(false);
  });

  it("answers hours and contact details", () => {
    expect(answerPortalMessage("what time do you open?", facts).handedOff).toBe(false);
    expect(answerPortalMessage("what's your phone number", facts).body).toContain("07 3823 4567");
  });

  it("greets without pretending to be a person", () => {
    const r = answerPortalMessage("hi", facts);
    expect(r.intent).toBe("greeting");
    expect(r.body).toContain("Toni");
  });
});

describe("it hands anything risky to a human", () => {
  // The whole point of the scope. Each of these must reach a person.
  const mustEscalate = [
    "how much is a full groom for a labradoodle",
    "can you give me a quote",
    "can I cancel Thursday please",
    "can you reschedule us to next week",
    "can I book Millie in for Friday",
    "Cosi has a rash on her belly, is that normal?",
    "my dog is limping after the groom",
    "she seems unwell today",
    "I want a refund",
    "I'm really unhappy with the last cut",
  ];
  for (const message of mustEscalate) {
    it(`escalates: "${message}"`, () => {
      const r = answerPortalMessage(message, facts);
      expect(r.handedOff).toBe(true);
      expect(r.body).toContain("someone from Barkin' Beautiful will message you");
    });
  }

  // A pricing question wearing an appointment question's clothes. The risky
  // check runs first precisely so this cannot slip through as a lookup.
  it("treats 'how much is my next appointment' as pricing, not a lookup", () => {
    const r = answerPortalMessage("how much is my next appointment?", facts);
    expect(r.handedOff).toBe(true);
    expect(r.intent).toBe("needs_human");
  });

  it("never quotes a figure, whatever is asked", () => {
    for (const m of mustEscalate) {
      expect(answerPortalMessage(m, facts).body).not.toMatch(/\$\d/);
    }
  });

  it("escalates anything it simply does not understand", () => {
    const r = answerPortalMessage("do you sell the shampoo you used", facts);
    expect(r.handedOff).toBe(true);
    expect(r.intent).toBe("needs_human");
  });

  it("escalates an empty message rather than answering it", () => {
    expect(answerPortalMessage("   ", facts).handedOff).toBe(true);
  });

  it("hands off membership detail even though it names the plan", () => {
    const r = answerPortalMessage("what does my membership cover?", facts);
    expect(r.body).toContain("Diamond VIP");
    expect(r.handedOff).toBe(true);
  });
});

describe("it is honest when the record is empty", () => {
  const bare: PortalChatFacts = {
    ...facts, nextAppointment: null, lastAppointment: null, petNames: [], membershipNames: [],
  };
  it("says there is no upcoming visit and fetches a human", () => {
    const r = answerPortalMessage("when is my next visit", bare);
    expect(r.body).toContain("can't see an upcoming visit");
    expect(r.handedOff).toBe(true);
  });
  it("does not claim a membership that is not there", () => {
    const r = answerPortalMessage("tell me about my membership", bare);
    expect(r.body).toContain("can't see an active membership");
    expect(r.handedOff).toBe(true);
  });
});

describe("requiresHuman", () => {
  it("is case insensitive", () => {
    expect(requiresHuman("HOW MUCH?")).toBe(true);
    expect(requiresHuman("What time do you open")).toBe(false);
  });
});

describe("unread counts are derived from the messages", () => {
  const msgs = [
    { sender: "client", createdAt: "2026-10-05T01:00:00Z" },
    { sender: "assistant", createdAt: "2026-10-05T01:00:05Z" },
    { sender: "client", createdAt: "2026-10-05T02:00:00Z" },
    { sender: "staff", createdAt: "2026-10-05T03:00:00Z" },
  ];
  it("counts only the other side's messages since the read mark", () => {
    expect(unreadForStaff(msgs, "2026-10-05T01:30:00Z")).toBe(1);
    expect(unreadForClient(msgs, "2026-10-05T01:30:00Z")).toBe(1);
  });
  it("counts everything when never read", () => {
    expect(unreadForStaff(msgs, null)).toBe(2);
    expect(unreadForClient(msgs, null)).toBe(2);
  });
  it("is zero when read after the last message", () => {
    expect(unreadForStaff(msgs, "2026-10-05T04:00:00Z")).toBe(0);
    expect(unreadForClient(msgs, "2026-10-05T04:00:00Z")).toBe(0);
  });
});
