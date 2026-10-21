import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The preview path must not message anyone.
 *
 * `/book/preview` tells the tester, in those words, that "no client
 * messages, automatic confirmations or live booking release will occur",
 * and the form lets them type any details they like — including a real
 * client's. A text sent because somebody was trying the form cannot be
 * recalled.
 */
const sendEmail = vi.fn(async () => true);
const sendSms = vi.fn(async () => ({ success: true, sid: "SM_test" }));
const insertValues = vi.fn(async () => undefined);

vi.mock("./email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...(a as [])) }));
vi.mock("./sms", () => ({ sendSms: (...a: unknown[]) => sendSms(...(a as [])) }));
vi.mock("./db", () => ({
  getDb: async () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{
            firstName: "Andy", lastName: "McLucas",
            email: "test@example.invalid", phone: "0400000000",
            name: "Barkin' Beautiful", // tenant row reuses this shape
          }],
        }),
      }),
    }),
    insert: () => ({ values: insertValues }),
  }),
}));

const BASE = {
  tenantId: 1, clientId: 1162, petId: 1574, appointmentId: 999,
  serviceType: "classic_groom", scheduledStart: new Date("2026-10-28T23:30:00Z"),
  weightKg: 42, estimatePrice: "325.00",
};

beforeEach(() => {
  sendEmail.mockClear();
  sendSms.mockClear();
  insertValues.mockClear();
  process.env.SMS_AUTOMATION_ENABLED = "true";
});
afterEach(() => { delete process.env.SMS_AUTOMATION_ENABLED; });

describe("a preview booking", () => {
  it("sends no email and no text", async () => {
    const { notifyOnlineBooking } = await import("./onlineBookingNotify");
    const out = await notifyOnlineBooking({ ...BASE, preview: true });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
    expect(out.emailed).toBe(false);
    expect(out.texted).toBe(false);
  });

  it("says why, so the test is not mistaken for a failure", async () => {
    const { notifyOnlineBooking } = await import("./onlineBookingNotify");
    const out = await notifyOnlineBooking({ ...BASE, preview: true });
    expect(out.skipped).toContain("preview: no client email");
    expect(out.skipped).toContain("preview: no client SMS");
  });

  it("still writes the bell row, which is how the test proves anything", async () => {
    const { notifyOnlineBooking } = await import("./onlineBookingNotify");
    const out = await notifyOnlineBooking({ ...BASE, preview: true });
    expect(out.notified).toBe(true);
    expect(insertValues).toHaveBeenCalledOnce();
    const row = insertValues.mock.calls[0][0] as Record<string, string>;
    expect(row.kind).toBe("online_booking_received");
    expect(row.detail).toContain("(test booking)");
  });
});

describe("a real booking", () => {
  it("emails and texts the client", async () => {
    const { notifyOnlineBooking } = await import("./onlineBookingNotify");
    const out = await notifyOnlineBooking(BASE);
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendSms).toHaveBeenCalledOnce();
    expect(out).toMatchObject({ notified: true, emailed: true, texted: true });
  });

  it("carries the estimate and its disclaimer into both", async () => {
    const { notifyOnlineBooking } = await import("./onlineBookingNotify");
    await notifyOnlineBooking(BASE);
    const email = sendEmail.mock.calls[0][0] as { subject: string; html: string };
    expect(email.html).toContain("$325.00");
    expect(email.html).toContain("can change on the day");
    const smsBody = sendSms.mock.calls[0][1] as string;
    expect(smsBody).toContain("$325.00");
    expect(smsBody).toContain("estimate");
  });

  it("never tells the client the booking is confirmed", async () => {
    const { notifyOnlineBooking } = await import("./onlineBookingNotify");
    await notifyOnlineBooking(BASE);
    const email = sendEmail.mock.calls[0][0] as { html: string };
    const smsBody = sendSms.mock.calls[0][1] as string;
    for (const text of [email.html, smsBody]) {
      expect(text).not.toMatch(/\bis confirmed\b/);
    }
  });

  it("holds the text back when SMS automation is off", async () => {
    process.env.SMS_AUTOMATION_ENABLED = "false";
    const { notifyOnlineBooking } = await import("./onlineBookingNotify");
    const out = await notifyOnlineBooking(BASE);
    expect(sendSms).not.toHaveBeenCalled();
    expect(out.skipped).toContain("SMS automation disabled");
    // The email and the bell are not gated on the SMS switch.
    expect(out.emailed).toBe(true);
    expect(out.notified).toBe(true);
  });

  it("writes the date in Brisbane time, not the server's", async () => {
    // 2026-10-28T23:30Z is 09:30 on the 29th in Brisbane. Getting this
    // wrong is bug e6a4662 all over again.
    const { notifyOnlineBooking } = await import("./onlineBookingNotify");
    await notifyOnlineBooking(BASE);
    const smsBody = sendSms.mock.calls[0][1] as string;
    expect(smsBody).toContain("Thursday 29 October");
    expect(smsBody).toMatch(/9:30\s*am/i);
  });
});
