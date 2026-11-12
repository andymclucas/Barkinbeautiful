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

// ─── Guapo: the language model behind the rules (13/11/2026) ─────────────────
//
// Andy, 13/11/2026: "Now add Guapo to the client portal." The rules above
// still run FIRST, and still own every answer that is a lookup on the
// client's record: a lookup cannot invent a date. The model is asked only
// when the rules would have handed the message to the team, and only for
// the kind of question it can answer from the portal guide: how to do
// something in the portal.
//
// The 05/10/2026 limits stand. Guapo never quotes a price, never books,
// moves or cancels anything, and never says anything about a dog's health.
// Those are enforced HERE, in code, on both sides of the model, not left
// to its instructions:
//   - `neverForModel` keeps the message from reaching it at all;
//   - `safeModelReply` throws away an answer that breaks a limit anyway.
// Either one failing closed means the message goes to the team, which is
// what happened to every message before Guapo existed.

/** Never sent to the model, whatever else the message says. */
const MODEL_NEVER = [
  // what something costs, or money back
  "price", "cost", "how much", "quote", "charge", "refund", "discount", "owe",
  // asking us to change the diary (how-to questions about the Reschedule
  // button are let through; see HOW_TO below)
  "cancel", "squeeze", "fit me in", "fit us in",
  // anything health related
  "sick", "unwell", "vet", "injur", "hurt", "bleed", "limp", "rash", "itch", "lump", "wound",
  "medication", "allerg", "flea", "tick", "anxious", "aggressive", "bite",
  // complaints
  "complain", "unhappy", "disappointed", "wrong", "damage",
];

/** Phrasings that ask HOW to do something rather than asking us to do it. */
const HOW_TO = /\b(how (do|can|would) (i|we)|where (do|can|is|are)|can i|how to|is there a way)\b/;

/**
 * Whether a message must skip the model and go straight to the team.
 *
 * "Can you move my appointment to Friday" is a request, and goes to the
 * team. "How do I reschedule?" is a question about a button, and Guapo
 * may answer it. Booking and rescheduling words therefore need a how-to
 * phrasing to get through; everything in MODEL_NEVER is refused outright.
 */
export function neverForModel(message: string): boolean {
  const text = message.toLowerCase();
  if (has(text, MODEL_NEVER)) return true;
  const changesDiary = has(text, ["reschedule", "move my", "change my appointment", "book", "booking in"]);
  return changesDiary && !HOW_TO.test(text);
}

/**
 * Whether the model should be tried for this message, given what the
 * rules made of it.
 *
 * Always when the rules gave up. Also when the message is a how-to
 * question that tripped one of the two loose keyword rules: "how do I
 * sign in on my phone" contains "phone", and the contact rule would
 * answer it with the salon's number. The lookups on the client's own
 * record are never overridden.
 */
export function offerToModel(message: string, ruleIntent: PortalChatIntent): boolean {
  if (neverForModel(message)) return false;
  if (ruleIntent === "needs_human") return true;
  return (ruleIntent === "contact" || ruleIntent === "hours") && HOW_TO.test(message.toLowerCase());
}

/**
 * The model's answer, or null when it must not be shown.
 *
 * A dollar figure is a quote. A promise to do something is a booking
 * nobody made. Both go to the team instead.
 */
export function safeModelReply(reply: string): string | null {
  const text = reply.trim();
  if (!text || text.length > 1200) return null;
  if (/\$\s?\d/.test(text) || /\b\d+(\.\d{2})?\s?dollars\b/i.test(text)) return null;
  if (/\b(i have|i've|i will|i'll) (booked|moved|cancelled|canceled|rescheduled|changed|refunded|charged|book|move|cancel|reschedule|change|refund|charge)\b/i.test(text)) return null;
  return text;
}

/** What the "Talk to a person" button sends. Never shown to the model. */
export const PORTAL_PERSON_REQUEST = "I'd like to talk to a person, please.";

/** The handoff line, for callers that hand off without the rules. */
export const PORTAL_HANDOFF_LINE = HANDOFF;

/**
 * The line shown under the composer so a client knows what they are talking
 * to before they type, rather than discovering it from the reply.
 */
export const PORTAL_CHAT_DISCLOSURE =
  "Guapo is our automated assistant, and his answers can be wrong. Anything he can't answer goes straight to the team.";

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
