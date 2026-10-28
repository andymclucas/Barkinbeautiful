import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  automatedSmsAllowed, ALLOWED_AUTOMATED_SMS, describeBlockedSms,
  type AutomatedSmsType,
} from "../shared/automatedSms";
import { sendSms } from "./sms";

describe("automatedSmsAllowed", () => {
  /**
   * Andy, 28/10/2026: "No automated text messages to go to clients
   * other than when dogs are fully groomed and ready to be picked up."
   */
  it("allows the pickup text and nothing else", () => {
    expect(automatedSmsAllowed("ready_pickup")).toBe(true);
    const everythingElse: AutomatedSmsType[] = [
      "confirmation", "reminder", "tracker", "waitlist_offer", "waitlist_missed",
      "missed_call", "online_booking_request", "photo_link", "payment_failed",
    ];
    for (const type of everythingElse) {
      expect(automatedSmsAllowed(type), type).toBe(false);
    }
  });

  /**
   * The list is the decision. If it ever holds more than the pickup
   * text, somebody chose that in front of the comment explaining the
   * rule — which is the point of keeping it in one place.
   */
  it("holds exactly one message", () => {
    expect([...ALLOWED_AUTOMATED_SMS]).toEqual(["ready_pickup"]);
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

  it("refuses an automated confirmation — the one a client complained about", async () => {
    const result = await sendSms("0400000000", "body", { trigger: "automated", type: "confirmation" });
    expect(result.success).toBe(false);
    expect(result.blocked).toBe(true);
    expect(logged.join("\n")).toContain("confirmation");
  });

  it("refuses every other automated message", async () => {
    const blocked: AutomatedSmsType[] = [
      "reminder", "tracker", "waitlist_offer", "waitlist_missed",
      "missed_call", "online_booking_request", "photo_link", "payment_failed",
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
    const policy = await sendSms("0400000000", "b", { trigger: "automated", type: "reminder" });
    const twilio = await sendSms("0400000000", "b", { trigger: "staff" });
    expect(policy.blocked).toBe(true);
    expect(twilio.blocked).toBeUndefined();
    expect(twilio.success).toBe(false);
  });
});
