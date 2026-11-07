import { ALLOWED_AUTOMATED_SMS, type AutomatedSmsType } from "./automatedSms";

/**
 * Every automated text the salon has, described for the person reading
 * Settings rather than for the person writing the code.
 *
 * ## Why this exists
 *
 * Settings → Notifications used to hand-write this list. On 07/11/2026 it
 * still read "Appointment reminders — OFF, automated texts to clients are
 * switched off", quoting Andy's rule of 28/10/2026. He reversed that rule
 * on 04/11 and the allow-list had held seven entries since, so the screen
 * had been telling the owner the opposite of what his own salon was doing
 * for three days. It also offered a "Configure" button on each row that
 * only ever raised "Feature coming soon".
 *
 * Hand-written copy describing a rule that lives somewhere else drifts the
 * moment the rule changes, and nothing fails when it does. So the card is
 * now rendered from `ALLOWED_AUTOMATED_SMS` itself: add a type there and
 * this screen tells the truth about it without being edited, and the
 * `Record` below will not compile until the new type is described.
 *
 * ## Three locks, not one
 *
 * A text reaches a client only if it clears all of:
 *
 * 1. the allow-list in shared/automatedSms.ts — a CODE change (§9);
 * 2. `SMS_AUTOMATION_ENABLED=true` in the environment;
 * 3. whatever further switch that particular message carries.
 *
 * The third is why `caveat` exists rather than a fourth boolean. The gates
 * are not uniform — the rebook nudge has a per-salon column, the Pet
 * Tracker text has `TRACKER_SMS_ENABLED`, the pickup text has no automated
 * caller at all — and inventing one flag to cover them would be the same
 * mistake as the copy it replaces. Each is stated in words instead.
 */

/** The strongest lock that applies, worst first. */
export type AutomatedSmsState =
  /** Not on the allow-list. Turning it on is a code change, not a setting. */
  | "off_by_policy"
  /** Allowed, but SMS_AUTOMATION_ENABLED is not "true", so nothing goes out. */
  | "blocked_by_salon_gate"
  /** Both locks clear. `caveat` says what else still applies. */
  | "allowed";

export type AutomatedSmsDescription = {
  label: string;
  /** When it fires, in one line. */
  when: string;
  /**
   * Anything that still stops or shapes it once policy and the salon gate
   * are clear — a further switch, or the fact that it has never yet run.
   */
  caveat?: string;
};

/**
 * Declaration order is display order: the six a client can actually
 * receive first, then the ones held off.
 */
export const AUTOMATED_SMS_DESCRIPTIONS: Record<AutomatedSmsType, AutomatedSmsDescription> = {
  confirmation: {
    label: "Booking confirmation",
    when: "When a booking is created.",
    caveat:
      "Refuses any booking carrying a MoeGo id, which is what stops a sync of"
      + " 276 imported bookings texting 276 clients in one run.",
  },
  reminder: {
    label: "Appointment reminders",
    when: "Three times per booking: four days out, two days out, and the morning of.",
    caveat:
      "Has never run in production — the three claim columns are empty on every"
      + " one of the salon's appointments, so the first real run is the first"
      + " time this path texts anybody.",
  },
  reschedule: {
    label: "Booking moved",
    when: "When a booking moves to a different DAY.",
    caveat:
      "A change of time on the same day sends nothing, deliberately: staff"
      + " retime the board constantly and texting on every save would be worse"
      + " than not having it.",
  },
  cancellation: {
    label: "Booking cancelled",
    when: "When staff cancel a booking in the app.",
    caveat:
      "Fires from staff actions only. The MoeGo sync writes direct SQL and runs"
      + " no application code, which is the only reason cancelling 450 imported"
      + " bookings does not text 450 clients.",
  },
  ready_pickup: {
    label: "Ready for pickup",
    when: "When a dog is finished and ready to collect.",
    caveat:
      "A person presses send on this one — there is no automated caller today."
      + " It is allowed so that automating it later needs no code change.",
  },
  missed_call: {
    label: "Missed-call auto-reply",
    when: "When somebody rings the salon and nobody answers.",
    caveat: "Once ever per phone number, so a repeat caller is never texted twice.",
  },
  rebook: {
    label: "Time to rebook",
    when: "About three weeks before a dog is next due, when nothing is booked.",
    caveat:
      "Needs its own switch above, which is off until somebody turns it on, and"
      + " a daily scheduled run. One text per household, not per dog.",
  },
  tracker: {
    label: "Pet Tracker check-in link",
    when: "Would send a tracking link when a dog is checked in.",
    caveat:
      "Carries a second lock of its own (TRACKER_SMS_ENABLED) as well as being"
      + " off by policy. Andy, 27/10/2026, when it was found live: “Do not"
      + " send any check in SMS to the clients.”",
  },
  waitlist_offer: {
    label: "Waitlist offer",
    when: "Would offer a freed-up slot to everybody waiting for it.",
  },
  waitlist_missed: {
    label: "Waitlist slot gone",
    when: "Would tell the clients who missed out that the slot has been taken.",
  },
  online_booking_request: {
    label: "Online booking received",
    when: "Would acknowledge a booking request made through the website.",
  },
  photo_link: {
    label: "Groom photos",
    when: "Would send a link to the photos taken during the groom.",
  },
  payment_failed: {
    label: "Payment failed",
    when: "Would tell a client their membership payment did not go through.",
    caveat: "Staff still see failed payments in the app; only the client text is held off.",
  },
};

export type AutomatedSmsRow = AutomatedSmsDescription & {
  type: AutomatedSmsType;
  state: AutomatedSmsState;
};

/**
 * Every automated text with the lock that currently applies to it.
 *
 * `automationEnabled` is passed in rather than read from the environment
 * so this stays pure and usable on both sides — the browser cannot see
 * `SMS_AUTOMATION_ENABLED`, which is exactly why the card has to be told
 * rather than guess. Same shape as shared/trackerSmsGate.ts.
 */
export function describeAutomatedSms(automationEnabled: boolean): AutomatedSmsRow[] {
  return (Object.keys(AUTOMATED_SMS_DESCRIPTIONS) as AutomatedSmsType[]).map((type) => ({
    type,
    ...AUTOMATED_SMS_DESCRIPTIONS[type],
    // Policy first: it is the stronger lock, and reporting "blocked by the
    // salon gate" for something that is also off by policy would suggest
    // one environment variable is all that stands in the way.
    state: !ALLOWED_AUTOMATED_SMS.has(type)
      ? "off_by_policy"
      : automationEnabled
        ? "allowed"
        : "blocked_by_salon_gate",
  }));
}

/** How many texts a client could actually receive right now. */
export function countSendingAutomatedSms(automationEnabled: boolean): number {
  return describeAutomatedSms(automationEnabled).filter((row) => row.state === "allowed").length;
}
