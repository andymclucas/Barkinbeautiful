import { describe, it, expect } from "vitest";
import {
  formatEstimate, buildOnlineBookingRequestSms,
  buildOnlineBookingRequestEmailSubject, buildOnlineBookingRequestEmailBody,
} from "../shared/onlineBookingConfirmation";
import { ESTIMATE_DISCLAIMER, ESTIMATE_DISCLAIMER_SHORT } from "../shared/onlineBookingPrice";

const BASE = {
  clientFirstName: "Jane",
  petName: "Rosie",
  date: "Tuesday 28 October",
  time: "9:30am",
  serviceLabel: "Classic groom",
  estimatePrice: "95.00",
};

describe("formatEstimate", () => {
  it("shows dollars and cents", () => {
    expect(formatEstimate("95")).toBe("$95.00");
    expect(formatEstimate("95.5")).toBe("$95.50");
  });

  it("shows nothing rather than $0.00 or $NaN", () => {
    // A zero or unparseable figure is an absent price, not a free groom.
    for (const bad of [null, undefined, "", "0", "0.00", "-5", "quote on the day"]) {
      expect(formatEstimate(bad)).toBeNull();
    }
  });
});

describe("the text message", () => {
  it("says we will confirm, never that the booking IS confirmed", () => {
    // The appointment lands at status "pending". Telling a stranger it is
    // confirmed commits the salon to a slot nobody has agreed to.
    const sms = buildOnlineBookingRequestSms(BASE);
    expect(sms).toContain("We'll be in touch to confirm");
    expect(sms).not.toMatch(/\bis confirmed\b/);
  });

  it("carries the disclaimer whenever it carries a figure", () => {
    const sms = buildOnlineBookingRequestSms(BASE);
    expect(sms).toContain("$95.00");
    expect(sms).toContain(ESTIMATE_DISCLAIMER_SHORT);
  });

  it("omits the price sentence entirely when there is no estimate", () => {
    const sms = buildOnlineBookingRequestSms({ ...BASE, estimatePrice: null });
    expect(sms).not.toContain("Estimate");
    expect(sms).not.toContain("$");
    // And still reads as a complete message.
    expect(sms).toContain("Rosie");
    expect(sms).toContain("We'll be in touch to confirm");
  });

  it("stays inside two SMS segments", () => {
    // Twilio bills per 160 characters, and this is sent on every booking.
    expect(buildOnlineBookingRequestSms(BASE).length).toBeLessThanOrEqual(320);
  });

  it("names the dog, the day, the time and the service", () => {
    const sms = buildOnlineBookingRequestSms(BASE);
    for (const fact of ["Rosie", "Tuesday 28 October", "9:30am", "Classic groom"]) {
      expect(sms).toContain(fact);
    }
  });
});

describe("the email", () => {
  it("calls it a request in the subject", () => {
    expect(buildOnlineBookingRequestEmailSubject(BASE)).toBe("We've got your booking request for Rosie");
  });

  it("carries the full disclaimer with the figure", () => {
    const body = buildOnlineBookingRequestEmailBody(BASE);
    expect(body).toContain("$95.00");
    expect(body).toContain(ESTIMATE_DISCLAIMER);
  });

  it("says plainly that nothing is confirmed yet", () => {
    const body = buildOnlineBookingRequestEmailBody(BASE);
    expect(body).toContain("not a confirmed booking yet");
  });

  it("drops the price block when there is no estimate, disclaimer and all", () => {
    // A disclaimer with no figure to disclaim reads like a warning about
    // nothing, and invites the reader to wonder what the price is.
    const body = buildOnlineBookingRequestEmailBody({ ...BASE, estimatePrice: null });
    expect(body).not.toContain("Estimate");
    expect(body).not.toContain(ESTIMATE_DISCLAIMER);
    expect(body).toContain("not a confirmed booking yet");
  });

  it("includes the salon phone only when there is one", () => {
    expect(buildOnlineBookingRequestEmailBody({ ...BASE, salonPhone: "07 5555 1234" }))
      .toContain("07 5555 1234");
    expect(buildOnlineBookingRequestEmailBody(BASE)).not.toContain("call us on");
  });

  it("never renders an undefined or null into the body", () => {
    const body = buildOnlineBookingRequestEmailBody({ ...BASE, estimatePrice: null, salonPhone: null });
    expect(body).not.toMatch(/undefined|null/);
  });
});

describe("the three channels agree", () => {
  it("uses the same disclaimer text, long and short, from one source", () => {
    // The whole reason this module exists: the page, the email and the
    // text must not drift into saying different things about the money.
    const sms = buildOnlineBookingRequestSms(BASE);
    const email = buildOnlineBookingRequestEmailBody(BASE);
    expect(sms).toContain(ESTIMATE_DISCLAIMER_SHORT);
    expect(email).toContain(ESTIMATE_DISCLAIMER);
    // Both forms must actually say the price can change.
    for (const text of [ESTIMATE_DISCLAIMER, ESTIMATE_DISCLAIMER_SHORT]) {
      expect(text.toLowerCase()).toContain("estimate");
      expect(text.toLowerCase()).toMatch(/can change|may change/);
    }
  });

  it("quotes the same figure in both", () => {
    expect(buildOnlineBookingRequestSms(BASE)).toContain("$95.00");
    expect(buildOnlineBookingRequestEmailBody(BASE)).toContain("$95.00");
  });
});
