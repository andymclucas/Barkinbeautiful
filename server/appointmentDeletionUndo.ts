import { nanoid } from "nanoid";

export const APPOINTMENT_DELETE_UNDO_WINDOW_MS = 30_000;

export type AppointmentDeletionSnapshot = {
  appointments: Record<string, unknown>[];
  workflowLogs: Record<string, unknown>[];
  groomingReports: Record<string, unknown>[];
  invoiceLinks: Array<{ id: number; appointmentId: number }>;
  petPhotoLinks: Array<{ id: number; appointmentId: number }>;
  styleNoteLinks: Array<{ id: number; appointmentId: number }>;
  smsLogLinks: Array<{ id: number; appointmentId: number }>;
};

type StoredSnapshot = {
  expiresAt: number;
  snapshot: AppointmentDeletionSnapshot;
};

const pendingUndos = new Map<string, StoredSnapshot>();

function removeExpired(now = Date.now()) {
  for (const [token, entry] of Array.from(pendingUndos.entries())) {
    if (entry.expiresAt <= now) pendingUndos.delete(token);
  }
}

export function createAppointmentDeletionUndo(snapshot: AppointmentDeletionSnapshot, now = Date.now()) {
  removeExpired(now);
  const token = nanoid(18);
  const expiresAt = now + APPOINTMENT_DELETE_UNDO_WINDOW_MS;
  pendingUndos.set(token, { expiresAt, snapshot });
  return { token, expiresAt };
}

/**
 * Checks that an undo token is still valid without consuming it. This lets the
 * caller complete tenant authorisation before the one-use snapshot is removed.
 */
export function getAppointmentDeletionUndo(token: string, now = Date.now()) {
  removeExpired(now);
  return pendingUndos.get(token)?.snapshot ?? null;
}

/**
 * Returns an unexpired snapshot exactly once. The one-use rule prevents a
 * repeated toast click from recreating the same booking twice.
 */
export function consumeAppointmentDeletionUndo(token: string, now = Date.now()) {
  const snapshot = getAppointmentDeletionUndo(token, now);
  if (!snapshot) return null;
  pendingUndos.delete(token);
  return snapshot;
}

export function clearAppointmentDeletionUndosForTest() {
  pendingUndos.clear();
}
