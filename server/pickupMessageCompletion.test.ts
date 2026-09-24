import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * NOTE ON APPROACH — these are source-text assertions, not behavioural tests.
 *
 * vitest.config.ts runs only `server/**` in a node environment, so there is no
 * jsdom and no way to render WorkflowBoard.tsx. Until a client test environment
 * exists, this file guards the pickup-SMS contract by reading source text.
 *
 * That makes it brittle: it asserts structure, not behaviour, and a harmless
 * refactor can break it (it already did once — the prompt moved from `complete`
 * to `ready` and these assertions went stale). Anchors below are therefore
 * chosen to be as stable as possible, and each has an explicit failure message.
 *
 * Do not add more tests of this kind. Extract logic into `shared/` as a pure
 * function and test that instead. See CLAUDE.md §7.
 */

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

  it("opens the reviewable recipient picker when a dog becomes READY, not on completion", () => {
    // The prompt deliberately fires on the `ready` transition rather than on
    // `complete`: by the time a dog is marked complete/OUT the client may
    // already have collected them (commit 16bf5e3). See the comment in the
    // `update` callback in WorkflowBoard.tsx.
    const updateStart = workflowSource.indexOf("const update = useCallback");
    const updateEnd = workflowSource.indexOf("const sendPickupMessage");
    expect(updateStart, "update callback not found").toBeGreaterThan(-1);
    expect(updateEnd).toBeGreaterThan(updateStart);
    const updateHandler = workflowSource.slice(updateStart, updateEnd);

    expect(updateHandler).toContain('fields.workflowState === "ready"');
    expect(updateHandler).toContain("setPickupMessageAppointment");
    // Opening a picker is not sending. Nothing here may transmit.
    expect(updateHandler).not.toContain("sendPickupMessage.mutate");

    // Completion must NOT re-open the picker or send anything.
    const completionStart = workflowSource.indexOf("const completeAppointment");
    const completionEnd = workflowSource.indexOf("const advanceStage");
    expect(completionStart, "completeAppointment not found").toBeGreaterThan(-1);
    expect(completionEnd).toBeGreaterThan(completionStart);
    const completionHandler = workflowSource.slice(completionStart, completionEnd);

    expect(completionHandler).not.toContain("setPickupMessageAppointment");
    expect(completionHandler).not.toContain("sendPickupMessage.mutate");
  });

  it("never sends the pickup SMS automatically — only from an explicit user action", () => {
    // The single call site must be an onClick handler. If a mutation success
    // handler ever calls it, clients get texted without anyone reviewing the
    // recipient or the message body.
    const callSites = workflowSource.split("sendPickupMessage.mutate").length - 1;
    expect(callSites, "expected exactly one sendPickupMessage.mutate call site").toBe(1);

    const callIndex = workflowSource.indexOf("sendPickupMessage.mutate");
    const enclosing = workflowSource.slice(Math.max(0, callIndex - 400), callIndex);
    expect(enclosing, "the only send must be inside an onClick").toContain("onClick");

    // And the review UI the operator confirms through must exist.
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
