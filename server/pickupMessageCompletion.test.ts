import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const workflowSource = readFileSync(new URL("../client/src/pages/WorkflowBoard.tsx", import.meta.url), "utf8");
const clientProfileSource = readFileSync(new URL("../client/src/pages/ClientDetail.tsx", import.meta.url), "utf8");

describe("completed Workflow pickup messaging", () => {
  it("uses only appointment-scoped primary or saved additional contacts", () => {
    expect(routerSource).toContain("getPickupRecipients: operationalProcedure");
    expect(routerSource).toContain("sendPickupMessage: operationalProcedure");
    expect(routerSource).toContain('recipientType: z.enum(["primary", "additional"])');
    expect(routerSource).toContain("eq(clientContacts.clientId, appointment.clientId)");
    expect(routerSource).toContain("eq(clientContacts.tenantId, appointment.tenantId)");
    expect(routerSource).toContain("requireApprovedStaffAppointmentAccess(db, ctx.user, appointment.id)");
  });

  it("allows a pickup message only after completion and only through the explicit send route", () => {
    const pickupStart = routerSource.indexOf("getPickupRecipients: operationalProcedure");
    const pickupSection = routerSource.slice(pickupStart, routerSource.indexOf("getLogs: protectedProcedure", pickupStart));
    expect(pickupSection.split("Pickup messages are available after the dog is marked complete").length - 1).toBe(2);
    expect(pickupSection).toContain("const result = await sendSms(recipient.phone, body)");
    expect(pickupSection).toContain('type: "ready_pickup"');
  });

  it("opens a reviewable recipient picker after a successful completion without automatically sending an SMS", () => {
    const completionStart = workflowSource.indexOf("const completeAppointment");
    const completionEnd = workflowSource.indexOf("const advanceStage");
    const completionHandler = workflowSource.slice(completionStart, completionEnd);
    expect(completionHandler).toContain("onSuccess: () => {");
    expect(completionHandler).toContain("setPickupMessageAppointment");
    expect(completionHandler).not.toContain("sendPickupMessage.mutate");
    expect(workflowSource).toContain("Send ready-for-pickup message");
    expect(workflowSource).toContain("SMS preview");
    expect(workflowSource).toContain('"Send SMS"');
    expect(workflowSource).toContain("Not now");
  });

  it("keeps alternate pickup contact management administrator-only in the client profile", () => {
    expect(routerSource).toContain("addContact: adminProcedure");
    expect(routerSource).toContain("removeContact: adminProcedure");
    expect(clientProfileSource).toContain("Pickup contacts");
    expect(clientProfileSource).toContain("Additional pickup contact saved");
  });
});
