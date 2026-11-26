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
// Each mock declares the parameters the real function takes, so that
// mock.calls is typed. Written as `vi.fn(async () => true)` the call list
// is an EMPTY TUPLE: every `mock.calls[0][0]` below is then an index into a
// tuple that cannot have a first element, and the `as { subject, html }`
// casts were converting `undefined`. The assertions passed at runtime and
// were checked against nothing, which only showed up once *.test.ts came
// inside tsc. These shapes mirror server/email.ts and server/sms.ts.
const sendEmail = vi.fn(
  async (_message: {
    to: string; subject: string; html: string;
    fromName?: string; replyTo?: string;
  }) => true,
);
const sendSms = vi.fn(
  async (_to: string, _body: string, _trigger?: unknown) =>
    ({ success: true, sid: "SM_test" }),
);
const insertValues = vi.fn(async (_row: Record<string, unknown>) => undefined);

vi.mock("./email", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...(a as Parameters<typeof sendEmail>)),
}));
vi.mock("./sms", () => ({
  sendSms: (...a: unknown[]) => sendSms(...(a as Parameters<typeof sendSms>)),
}));
const sendPushToUser = vi.fn(
  async (_tenantId: number, _userId: number, _payload: Record<string, unknown>) =>
    ({ sent: 1, pruned: 0, failed: 0 }),
);
vi.mock("./webPush", () => ({
  sendPushToUser: (...a: unknown[]) => sendPushToUser(...(a as Parameters<typeof sendPushToUser>)),
}));
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
  sendPushToUser.mockClear();
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

describe("the push to the salon's phones (Andy, 27/11/2026)", () => {
  it("goes to the two people who read the online-booking bell, and nobody else", async () => {
    const { notifyOnlineBooking } = await import("./onlineBookingNotify");
    const { STAFF_ADMINISTRATOR_USER_IDS } = await import("../shared/staffAdministrators");
    const out = await notifyOnlineBooking(BASE);
    expect(out.pushed).toBe(true);
    expect(sendPushToUser.mock.calls.map((c) => c[1]).sort()).toEqual([...STAFF_ADMINISTRATOR_USER_IDS].sort());
    for (const [tenantId, , payload] of sendPushToUser.mock.calls) {
      expect(tenantId).toBe(1);
      expect(payload.kind).toBe("online-booking");
      expect(payload.title).toBe("New online booking");
      expect(payload.url).toBe("/clients/1162");
      expect(payload.body).toContain("Andy McLucas");
      expect(payload.body).toContain("Thursday 29 October");
      expect(payload.body).not.toContain("$");
    }
  });

  it("is pushed even when SMS automation is off", async () => {
    process.env.SMS_AUTOMATION_ENABLED = "false";
    const { notifyOnlineBooking } = await import("./onlineBookingNotify");
    await notifyOnlineBooking(BASE);
    expect(sendPushToUser).toHaveBeenCalled();
  });

  it("says Test on a preview booking, so a trial is not mistaken for a real one", async () => {
    const { notifyOnlineBooking } = await import("./onlineBookingNotify");
    await notifyOnlineBooking({ ...BASE, preview: true });
    expect(sendPushToUser.mock.calls[0][2].title).toBe("Test online booking");
  });

  it("does not fail the booking when a push throws", async () => {
    sendPushToUser.mockRejectedValueOnce(new Error("push service down"));
    const { notifyOnlineBooking } = await import("./onlineBookingNotify");
    const out = await notifyOnlineBooking(BASE);
    expect(out.notified).toBe(true);
    expect(out.emailed).toBe(true);
  });
});
