import { afterEach, describe, expect, it } from "vitest";
import {
  APPOINTMENT_DELETE_UNDO_WINDOW_MS,
  clearAppointmentDeletionUndosForTest,
  consumeAppointmentDeletionUndo,
  createAppointmentDeletionUndo,
  type AppointmentDeletionSnapshot,
} from "./appointmentDeletionUndo";

const snapshot: AppointmentDeletionSnapshot = {
  appointments: [{ id: 42, tenantId: 1, petId: 9 }],
  workflowLogs: [{ id: 7, appointmentId: 42 }],
  groomingReports: [],
  invoiceLinks: [{ id: 3, appointmentId: 42 }],
  petPhotoLinks: [],
  styleNoteLinks: [],
  smsLogLinks: [],
};

afterEach(() => clearAppointmentDeletionUndosForTest());

describe("appointment deletion undo token", () => {
  it("returns the original booking snapshot once within the undo window", () => {
    const { token } = createAppointmentDeletionUndo(snapshot, 1_000);

    expect(consumeAppointmentDeletionUndo(token, 1_001)).toEqual(snapshot);
    expect(consumeAppointmentDeletionUndo(token, 1_002)).toBeNull();
  });

  it("rejects a token after the short undo window has elapsed", () => {
    const { token } = createAppointmentDeletionUndo(snapshot, 1_000);

    expect(consumeAppointmentDeletionUndo(token, 1_000 + APPOINTMENT_DELETE_UNDO_WINDOW_MS)).toBeNull();
  });
});
