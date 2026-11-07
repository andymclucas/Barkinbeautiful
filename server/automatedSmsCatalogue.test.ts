import { describe, it, expect } from "vitest";
import { ALLOWED_AUTOMATED_SMS, type AutomatedSmsType } from "@shared/automatedSms";
import {
  AUTOMATED_SMS_DESCRIPTIONS,
  countSendingAutomatedSms,
  describeAutomatedSms,
} from "@shared/automatedSmsCatalogue";

/**
 * What Settings → Notifications tells the owner about client texts.
 *
 * The card this feeds used to hand-write its own copy, and on 07/11/2026 it
 * still said "Appointment reminders — OFF, automated texts to clients are
 * switched off". Andy had reversed that rule on 04/11 and the allow-list
 * had carried seven entries for three days. Nothing failed, because
 * nothing checked.
 *
 * These tests are the check. They assert the card's state is DERIVED from
 * the allow-list rather than agreeing with it today, so the next entry
 * added to `shared/automatedSms.ts` cannot leave this screen lying.
 */
describe("describeAutomatedSms", () => {
  it("describes every automated message type", () => {
    // The Record<AutomatedSmsType, …> already fails `tsc` on a missing
    // entry. This catches the emptier failure: a type described with a
    // blank label, which would render as a nameless row.
    for (const [type, description] of Object.entries(AUTOMATED_SMS_DESCRIPTIONS)) {
      expect(description.label.trim(), `${type} needs a label`).not.toBe("");
      expect(description.when.trim(), `${type} needs a "when"`).not.toBe("");
    }
  });

  it("marks a type off_by_policy exactly when the allow-list omits it", () => {
    // The anti-drift assertion. Not "reminders are on" — that would need
    // editing the day Andy changes his mind again, which is how the card
    // broke in the first place.
    for (const row of describeAutomatedSms(true)) {
      const onList = ALLOWED_AUTOMATED_SMS.has(row.type);
      expect(row.state === "off_by_policy", `${row.type} on allow-list: ${onList}`).toBe(!onList);
    }
  });

  it("reports the salon gate separately from policy", () => {
    const off = describeAutomatedSms(false);
    for (const row of off) {
      if (ALLOWED_AUTOMATED_SMS.has(row.type)) {
        // Allowed in code, stopped by the environment. This state was
        // invisible in the UI before: the owner could not tell "we chose
        // not to send this" from "this would send but the gate is off".
        expect(row.state, row.type).toBe("blocked_by_salon_gate");
      } else {
        // Policy is the stronger lock and must win, or the row would
        // imply one environment variable is all that stands in the way.
        expect(row.state, row.type).toBe("off_by_policy");
      }
    }
  });

  it("counts only what a client could actually receive", () => {
    expect(countSendingAutomatedSms(true)).toBe(ALLOWED_AUTOMATED_SMS.size);
    // Nothing automated reaches anybody with the gate off, whatever the
    // allow-list says.
    expect(countSendingAutomatedSms(false)).toBe(0);
  });

  it("never reports a blocked message as allowed", () => {
    // The specific shape of the bug being fixed, stated as an invariant:
    // a row that says "allowed" must survive BOTH locks.
    for (const row of [...describeAutomatedSms(true), ...describeAutomatedSms(false)]) {
      if (row.state === "allowed") {
        expect(ALLOWED_AUTOMATED_SMS.has(row.type), `${row.type} must be allow-listed`).toBe(true);
      }
    }
  });

  it("warns about the messages that carry a further switch of their own", () => {
    // These three are the ones where "allowed" is not the whole story, and
    // a reader who stopped at the badge would be misled. The rebook nudge
    // has a per-salon column, the pickup text has no automated caller, and
    // the tracker text has TRACKER_SMS_ENABLED on top of being off.
    const byType = Object.fromEntries(
      describeAutomatedSms(true).map((row) => [row.type, row]),
    ) as Record<AutomatedSmsType, ReturnType<typeof describeAutomatedSms>[number]>;

    expect(byType.rebook.caveat).toBeTruthy();
    expect(byType.ready_pickup.caveat).toBeTruthy();
    expect(byType.tracker.caveat).toBeTruthy();
  });
});
