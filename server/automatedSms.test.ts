import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  automatedSmsAllowed, automatedSmsPermitted, ALLOWED_AUTOMATED_SMS, describeBlockedSms,
  type AutomatedSmsType,
} from "../shared/automatedSms";
import { sendSms } from "./sms";

describe("automatedSmsAllowed", () => {
  /**
   * Andy, 28/10/2026: "No automated text messages to go to clients
   * other than when dogs are fully groomed and ready to be picked up."
   * Then 04/11/2026: "Turn the confirmation and reminder texts on."
   *
   * The second instruction reverses the first. Both are recorded here
   * because the 28/10 rule is quoted throughout this codebase, and a
   * reader finding it needs to know it was lifted on purpose.
   */
  it("allows the four chosen messages, and nothing else", () => {
    for (const type of ["ready_pickup", "missed_call", "confirmation", "reminder"] as AutomatedSmsType[]) {
      expect(automatedSmsAllowed(type), type).toBe(true);
    }
    const everythingElse: AutomatedSmsType[] = [
      "tracker", "waitlist_offer", "waitlist_missed",
      "online_booking_request", "photo_link", "payment_failed",
    ];
    for (const type of everythingElse) {
      expect(automatedSmsAllowed(type), type).toBe(false);
    }
  });

  /**
   * The list IS the decision, so it stays pinned EXACTLY rather than
   * loosened to "contains" now that it has grown. A seventh entry must
   * still fail here, because that is the only thing standing between a
   * new automated send and a real client's phone.
   *
   * Grown on 04/11/2026 from four to six: confirmation and reminder
   * went on in the morning, cancellation and reschedule in the same
   * session that afternoon. Every one of those was Andy asking for it
   * by name, and this assertion failing is what makes somebody say so.
   */
  /*
   * Seven since 07/11/2026. Andy, shown MoeGo's "Rebook reminder"
   * screen: "Build this into the text message workflow."
   *
   * The only one whose audience is clients with NO appointment — every
   * other entry is bounded by a booking that exists. It is allowed here
   * and still off in practice: tenants.rebook_reminder_enabled defaults
   * to false, so this entry makes the Settings switch honest rather
   * than switching anything on.
   */
  it("holds exactly these seven messages", () => {
    expect([...ALLOWED_AUTOMATED_SMS]).toEqual([
      "ready_pickup", "missed_call", "confirmation", "reminder",
      "cancellation", "reschedule", "rebook",
    ]);
  });

  it("says why, in words a person reading the log can use", () => {
    expect(describeBlockedSms("reminder")).toContain("reminder");
    expect(describeBlockedSms("reminder")).toContain("ready_pickup");
  });
});

/**
 * The rule is enforced inside sendSms, so this is where it is tested.
 *
 * There is deliberately NO test that greps the source for a `trigger:`
 * at each call site. The parameter is required and its type is a
 * discriminated union, so `pnpm run check` already fails on a call that
 * omits it — a compiler check on every build, not twelve assertions
 * that rot. What no test can catch is a genuinely automated send
 * declaring itself `trigger: "staff"`; that is a judgement about what
 * the code does, and it belongs in review.
 *
 * Twilio is unconfigured in the suite, so an allowed message gets as
 * far as "not configured" and stops. That is the assertion: it passed
 * the policy gate, which runs first and before any network or database
 * call, and was refused later for a reason that is not the policy.
 */
describe("sendSms enforces the automated-message rule", () => {
  let logged: string[] = [];
  let info: typeof console.info;
  let automation: string | undefined;

  beforeEach(() => {
    logged = [];
    info = console.info;
    console.info = (...args: unknown[]) => { logged.push(args.join(" ")); };
    automation = process.env.SMS_AUTOMATION_ENABLED;
    // The policy gate is what each test is about, so start with the
    // environment gate open and let the two tests that care close it.
    process.env.SMS_AUTOMATION_ENABLED = "true";
  });
  afterEach(() => {
    console.info = info;
    if (automation === undefined) delete process.env.SMS_AUTOMATION_ENABLED;
    else process.env.SMS_AUTOMATION_ENABLED = automation;
  });

  /*
   * Andy, 04/11/2026: "Turn the confirmation and reminder texts on."
   * These two used to be asserted as BLOCKED here. They pass the policy
   * gate now, and the assertion is inverted rather than deleted so the
   * change of policy is visible in the test, not just in the list.
   */
  it("lets the confirmation and the reminder through the policy gate", async () => {
    for (const type of ["confirmation", "reminder"] as AutomatedSmsType[]) {
      const result = await sendSms("0400000000", "body", { trigger: "automated", type });
      expect(result.blocked, type).toBeUndefined();
      // Twilio is unconfigured in the suite, so an allowed message gets
      // this far and stops — which is the proof it cleared the policy.
      expect(result.error, type).toBe("Twilio not configured");
    }
  });

  it("still refuses every automated message nobody has asked for", async () => {
    const blocked: AutomatedSmsType[] = [
      "tracker", "waitlist_offer", "waitlist_missed",
      "online_booking_request", "photo_link", "payment_failed",
    ];
    for (const type of blocked) {
      const result = await sendSms("0400000000", "body", { trigger: "automated", type });
      expect(result.blocked, type).toBe(true);
    }
  });

  it("lets the ready-for-pickup text through the policy gate", async () => {
    process.env.SMS_AUTOMATION_ENABLED = "true";
    const result = await sendSms("0400000000", "body", { trigger: "automated", type: "ready_pickup" });
    expect(result.blocked).toBeUndefined();
    expect(result.error).toBe("Twilio not configured");
  });

  /**
   * The second gate: a developer pointed at the production database
   * must not be able to text a real client, whatever the allow-list
   * says. Two of the six automated paths had no such check of their
   * own before this.
   */
  it("sends no automated message at all when automation is switched off", async () => {
    delete process.env.SMS_AUTOMATION_ENABLED;
    const result = await sendSms("0400000000", "body", { trigger: "automated", type: "ready_pickup" });
    expect(result.blocked).toBe(true);
    expect(result.error).toBe("automation_disabled");
  });

  it("still lets a staff member text when automation is switched off", async () => {
    delete process.env.SMS_AUTOMATION_ENABLED;
    const result = await sendSms("0400000000", "body", { trigger: "staff" });
    expect(result.blocked).toBeUndefined();
    expect(result.error).toBe("Twilio not configured");
  });

  /** A person texting a client is not automation, and is untouched. */
  it("never blocks a staff-sent message", async () => {
    const result = await sendSms("0400000000", "body", { trigger: "staff" });
    expect(result.blocked).toBeUndefined();
    expect(result.error).toBe("Twilio not configured");
  });

  /**
   * `blocked` is what the four callers that mirror a send into sms_logs
   * branch on. If it stopped being set they would write a failed row
   * for a text nobody attempted, and it would appear as a message in a
   * client's conversation.
   */
  it("marks a blocked send distinctly from a failed one", async () => {
    // "tracker", not "reminder": the reminder is allowed as of
    // 04/11/2026 and this test is about what a BLOCKED result looks
    // like, so it needs a type nobody has asked for.
    const policy = await sendSms("0400000000", "b", { trigger: "automated", type: "tracker" });
    const twilio = await sendSms("0400000000", "b", { trigger: "staff" });
    expect(policy.blocked).toBe(true);
    expect(twilio.blocked).toBeUndefined();
    expect(twilio.success).toBe(false);
  });
});

describe("the missed-call auto-reply stays on", () => {
  /**
   * Andy, 28/10/2026: "Keep the missed call auto reply on." It was the
   * one blocked path with real volume — 118 texts in 30 days — and it
   * answers somebody who rang rather than starting a conversation.
   *
   * It needs BOTH gates open, because the policy gate alone is not
   * what the live salon runs on.
   */
  it("passes the policy gate when automation is enabled", async () => {
    const before = process.env.SMS_AUTOMATION_ENABLED;
    process.env.SMS_AUTOMATION_ENABLED = "true";
    try {
      const result = await sendSms("0400000000", "body", { trigger: "automated", type: "missed_call" });
      expect(result.blocked).toBeUndefined();
      expect(result.error).toBe("Twilio not configured");
    } finally {
      if (before === undefined) delete process.env.SMS_AUTOMATION_ENABLED;
      else process.env.SMS_AUTOMATION_ENABLED = before;
    }
  });

  /** And the caller's ledger row may now be claimed, which it must be. */
  it("permits the claim that makes it once-ever", () => {
    expect(automatedSmsPermitted("missed_call", { SMS_AUTOMATION_ENABLED: "true" })).toBe(true);
    expect(automatedSmsPermitted("missed_call", {})).toBe(false);
  });
});
