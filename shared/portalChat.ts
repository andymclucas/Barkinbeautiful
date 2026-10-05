/**
 * The automated first reply in the client portal chat.
 *
 * Scope was chosen deliberately on 05/10/2026: it answers only from facts
 * already on the client's own record, and hands everything else to a human.
 * It must never quote a price, never book, move or cancel anything, and
 * never say anything that could be read as veterinary advice. A grooming
 * salon's reputation does not survive an assistant inventing a quote or
 * telling someone their dog's rash is fine.
 *
 * So this is a matcher over a fixed set of answerable questions, not a
 * generative model. For "when is my next appointment" that is strictly
 * better: the answer is a database lookup, and a lookup cannot hallucinate.
 * `answerPortalMessage` is the seam — swapping in a language model later
 * means replacing its body, and the guard rails below stay where they are.
 */

export type PortalChatFacts = {
  clientFirstName: string;
  /** The next scheduled appointment, if any. */
  nextAppointment: { petName: string; whenLabel: string; groomerName: string | null } | null;
  /** The most recently completed one. */
  lastAppointment: { petName: string; whenLabel: string } | null;
  petNames: string[];
  /** Active membership names, e.g. "Diamond VIP - SML (0-10kg) x2". */
  membershipNames: string[];
  salonPhone: string | null;
  salonEmail: string | null;
  /** Opening hours line, already formatted for display. */
  openingHoursLabel: string | null;
};

export type PortalChatReply = {
  body: string;
  /** True when a human still needs to pick this up. */
  handedOff: boolean;
  /** Which rule answered, for the staff inbox and for tuning later. */
  intent: PortalChatIntent;
};

export type PortalChatIntent =
  | "next_appointment"
  | "last_appointment"
  | "my_pets"
  | "membership"
  | "contact"
  | "hours"
  | "greeting"
  | "needs_human";

const HANDOFF =
  "I've passed this to the team — someone from Barkin' Beautiful will message you here as soon as they're available.";

/** Anything in here is never answered automatically, whatever else matched. */
const ALWAYS_HUMAN = [
  // money
  "price", "cost", "how much", "quote", "charge", "refund", "invoice", "bill", "pay", "payment", "discount",
  // changing a booking
  "cancel", "reschedule", "move my", "change my appointment", "book", "booking in", "squeeze",
  // anything health related
  "sick", "unwell", "vet", "injur", "hurt", "bleed", "limp", "rash", "itch", "lump", "wound",
  "medication", "allerg", "flea", "tick", "anxious", "aggressive", "bite",
  // complaints
  "complain", "unhappy", "disappointed", "refund", "wrong", "damage",
];

const has = (text: string, terms: string[]) => terms.some((t) => text.includes(t));

/**
 * Whether a message must go to a person regardless of what it looks like.
 *
 * Checked before any other rule, so "how much is my next appointment" is a
 * pricing question and not an appointment lookup.
 */
export function requiresHuman(message: string): boolean {
  return has(message.toLowerCase(), ALWAYS_HUMAN);
}

export function answerPortalMessage(message: string, facts: PortalChatFacts): PortalChatReply {
  const text = message.toLowerCase().trim();
  const handoff = (intent: PortalChatIntent = "needs_human"): PortalChatReply => ({
    body: HANDOFF, handedOff: true, intent,
  });

  if (!text) return handoff();
  if (requiresHuman(text)) return handoff();

  // Greeting with nothing else in it.
  if (/^(hi|hey|hello|good (morning|afternoon|evening))\b[\s!.,]*$/.test(text)) {
    return {
      body: `Hi ${facts.clientFirstName}! I can look up your next visit, your pets, your membership, or our hours and contact details. For anything else I'll pass you to the team.`,
      handedOff: false,
      intent: "greeting",
    };
  }

  if (has(text, ["next appointment", "next visit", "next groom", "when is my", "when's my", "when am i", "upcoming"])) {
    const appt = facts.nextAppointment;
    if (!appt) {
      return {
        body: `I can't see an upcoming visit booked for you at the moment. ${HANDOFF}`,
        handedOff: true, intent: "next_appointment",
      };
    }
    const withWho = appt.groomerName ? ` with ${appt.groomerName}` : "";
    return {
      body: `Your next visit is ${appt.petName} on ${appt.whenLabel}${withWho}. You can see it under "Upcoming appointments" in your portal.`,
      handedOff: false, intent: "next_appointment",
    };
  }

  if (has(text, ["last appointment", "last visit", "last groom", "previous visit", "when did"])) {
    const appt = facts.lastAppointment;
    if (!appt) return handoff("last_appointment");
    return {
      body: `${appt.petName} was last in on ${appt.whenLabel}. Your full history is under "Appointment history".`,
      handedOff: false, intent: "last_appointment",
    };
  }

  if (has(text, ["my pets", "my dogs", "which dogs", "what dogs", "pets do i"])) {
    if (!facts.petNames.length) return handoff("my_pets");
    const list = facts.petNames.length === 1
      ? facts.petNames[0]
      : `${facts.petNames.slice(0, -1).join(", ")} and ${facts.petNames[facts.petNames.length - 1]}`;
    return { body: `We have ${list} on file for you.`, handedOff: false, intent: "my_pets" };
  }

  if (has(text, ["membership", "member ship", "my plan", "subscription"])) {
    if (!facts.membershipNames.length) {
      return {
        body: `I can't see an active membership on your account. ${HANDOFF}`,
        handedOff: true, intent: "membership",
      };
    }
    return {
      body: `You're on ${facts.membershipNames.join(" and ")}. For anything about what it covers or how it's billed, the team will come back to you here.`,
      handedOff: true, intent: "membership",
    };
  }

  if (has(text, ["open", "hours", "what time", "closing", "closed"])) {
    if (!facts.openingHoursLabel) return handoff("hours");
    return { body: facts.openingHoursLabel, handedOff: false, intent: "hours" };
  }

  if (has(text, ["phone", "call", "email", "address", "where are you", "contact"])) {
    const bits = [
      facts.salonPhone ? `call us on ${facts.salonPhone}` : null,
      facts.salonEmail ? `email ${facts.salonEmail}` : null,
    ].filter(Boolean);
    if (!bits.length) return handoff("contact");
    return { body: `You can ${bits.join(" or ")}.`, handedOff: false, intent: "contact" };
  }

  return handoff();
}

/**
 * The line shown under the composer so a client knows what they are talking
 * to before they type, rather than discovering it from the reply.
 */
export const PORTAL_CHAT_DISCLOSURE =
  "Replies marked “Assistant” are automated. Anything we can't answer goes straight to the team.";

/** Unread counts, derived rather than stored. */
export function unreadForStaff(
  messages: readonly { sender: string; createdAt: Date | string }[],
  staffLastReadAt: Date | string | null,
): number {
  const since = staffLastReadAt ? new Date(staffLastReadAt).getTime() : 0;
  return messages.filter((m) => m.sender === "client" && new Date(m.createdAt).getTime() > since).length;
}

export function unreadForClient(
  messages: readonly { sender: string; createdAt: Date | string }[],
  clientLastReadAt: Date | string | null,
): number {
  const since = clientLastReadAt ? new Date(clientLastReadAt).getTime() : 0;
  return messages.filter((m) => m.sender !== "client" && new Date(m.createdAt).getTime() > since).length;
}
