import { describe, expect, it } from "vitest";
import {
  QUICK_REQUIRED_FIELDS, QUICK_SERVICES, QUICK_WORKFLOW_STATES, isQuickService, isQuickWorkflowState, looksLikeAPhoneNumber, missingQuickFields, nextQuickWorkflowState, parseCounterPrice, quickBoardLabel, quickServiceLabel, quickWalkInError,
} from "../shared/quickAppointment";

describe("a walk-in nail clip or quick bath", () => {
  it("offers exactly the two services Andy asked for", () => {
    expect(QUICK_SERVICES.map(s => s.label)).toEqual(["Nail Clip", "Quick Bath & Dry"]);
  });

  it("reuses existing service types rather than adding enum values", () => {
    /*
     * The expensive alternative. appointments.service_type is named in 54
     * places across client, server and shared, and CLAUDE.md is explicit
     * that adding a value means auditing every switch and map over it or
     * the UI silently renders nothing. nail_trim IS a nail clip and
     * bath_only IS a bath; what was missing is "and it is a ten-minute
     * walk-in", which is one boolean.
     */
    expect(QUICK_SERVICES.map(s => s.value)).toEqual(["nail_trim", "bath_only"]);
    expect(isQuickService("classic_groom")).toBe(false);
    expect(isQuickService("deshed")).toBe(false);
    expect(isQuickService(null)).toBe(false);
  });

  it("reads on the board the way Andy asked for it", () => {
    expect(quickBoardLabel("nail_trim")).toBe("Walk-In: Nail Clip");
    expect(quickBoardLabel("bath_only")).toBe("Walk-In: Quick Bath & Dry");
  });

  it("does not pretend to know a service it was not given", () => {
    expect(quickServiceLabel("classic_groom")).toBe("Quick appointment");
  });
});

describe("it does not go through the grooming stages", () => {
  it("has three steps and the two endings, and no bath queue", () => {
    // A nail clip does not wait for a bath, get dried, then wait for a
    // groom. Put one through those and it sits in a queue it does not
    // belong to all morning, and the bath priority list counts a dog
    // that needs no bath.
    expect([...QUICK_WORKFLOW_STATES].sort())
      .toEqual(["cancelled", "checked_in", "complete", "no_show", "scheduled"]);
    for (const grooming of ["waiting_for_bath", "bathing", "waiting_for_dry", "drying", "waiting_for_groom", "grooming", "ready"]) {
      expect(isQuickWorkflowState(grooming), grooming).toBe(false);
    }
  });

  it("walks forward in three and then stops", () => {
    expect(nextQuickWorkflowState("scheduled")).toBe("checked_in");
    expect(nextQuickWorkflowState("checked_in")).toBe("complete");
    expect(nextQuickWorkflowState("complete")).toBeNull();
    expect(nextQuickWorkflowState("cancelled")).toBeNull();
  });
});

describe("what a walk-in has to tell you", () => {
  /*
   * Andy asked on 06/11/2026 for first name, last name, dog name,
   * breed, phone AND email, all mandatory — "just in case anything
   * goes wrong, they have a record of who came in and when."
   *
   * Four are enforced, not six. A mandatory field that is awkward at a
   * counter with a dog on the table does not produce better data; it
   * produces `a@a.com` and a breed of "x", and a record that looks
   * complete and is not is worse for an incident than an honest blank.
   */
  const full = {
    firstName: "Jo", lastName: "Gerard", petName: "Bella", phone: "0412 345 678",
  };

  it("takes a walk-in with the four that matter", () => {
    expect(missingQuickFields(full)).toEqual([]);
    expect(quickWalkInError(full)).toBeNull();
  });

  it("does not require breed or email", () => {
    // Prompted on the form, never enforced. Half of walk-ins have no
    // email to hand for a $25 nail clip, and a street-found mixed breed
    // is a guess.
    expect(quickWalkInError({ ...full, breed: null, email: null })).toBeNull();
    expect(quickWalkInError({ ...full, breed: "", email: "" })).toBeNull();
  });

  it("names what is missing rather than saying 'required fields'", () => {
    // The person is holding a dog and should not have to hunt for the
    // red box.
    expect(quickWalkInError({ firstName: "Jo" }))
      .toBe("Still needed: last name, dog's name and phone number.");
    expect(quickWalkInError({ ...full, phone: "" })).toBe("Still needed: phone number.");
  });

  it("treats whitespace as empty", () => {
    expect(missingQuickFields({ ...full, petName: "   " })).toEqual(["petName"]);
  });

  it("refuses a phone number too short to ring", () => {
    // The one field with a shape check, because it is the one that does
    // the work: if a dog is hurt you ring them that afternoon.
    expect(missingQuickFields({ ...full, phone: "123" })).toEqual(["phone"]);
    expect(missingQuickFields({ ...full, phone: "n/a" })).toEqual(["phone"]);
  });

  it("accepts the ways a number actually gets typed", () => {
    /*
     * Deliberately loose. A strict Australian-mobile check rejects a
     * landline, an international number and a perfectly good number
     * written with spaces — and teaches staff to type 0400000000 to get
     * past it, which is exactly the junk the rule exists to prevent.
     */
    for (const phone of ["0412345678", "0412 345 678", "(07) 3123 4567",
                         "+61 412 345 678", "07-3123-4567"]) {
      expect(looksLikeAPhoneNumber(phone), phone).toBe(true);
      expect(missingQuickFields({ ...full, phone }), phone).toEqual([]);
    }
  });

  it("asks for everything when given nothing", () => {
    expect(missingQuickFields({})).toEqual([...QUICK_REQUIRED_FIELDS]);
  });
});

describe("a price typed at a counter", () => {
  /*
   * appointments.price is decimal(10,2), and under strict sql_mode "$25"
   * fails the insert. The walk-in creates a client and a dog BEFORE the
   * appointment, so before this existed a rejected price left a real
   * person and a real dog on the books with no booking — and every retry
   * made another pair.
   */
  it("takes the ways money actually gets typed", () => {
    for (const [typed, expected] of [
      ["25", "25.00"], ["$25", "25.00"], ["25.50", "25.50"], ["$25.50", "25.50"],
      [" 25 ", "25.00"], ["$1,250", "1250.00"], ["0", "0.00"],
    ] as const) {
      const result = parseCounterPrice(typed);
      expect(result, typed).toEqual({ ok: true, price: expected });
    }
  });

  it("treats nothing typed as no price, not as zero", () => {
    // A walk-in can genuinely be free, and "unpriced" and "free" are not
    // the same thing — the same distinction priceForCoveredAppointment
    // makes.
    expect(parseCounterPrice("")).toEqual({ ok: true, price: null });
    expect(parseCounterPrice("   ")).toEqual({ ok: true, price: null });
    expect(parseCounterPrice(null)).toEqual({ ok: true, price: null });
    expect(parseCounterPrice("0")).toEqual({ ok: true, price: "0.00" });
  });

  it("refuses what the column would refuse, and says so in English", () => {
    for (const bad of ["free", "twenty five", "25.555", "-25", "$", "1e5"]) {
      const result = parseCounterPrice(bad);
      expect(result.ok, bad).toBe(false);
      if (!result.ok) expect(result.reason).toContain("try something like");
    }
  });
});
