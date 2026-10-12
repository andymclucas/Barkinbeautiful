import type { StagedAddOn } from "@/components/BookingPetPricing";

/**
 * A booking handed from Add Client to the calendar.
 *
 * Adding a client and booking their first groom is one job, but the two
 * forms live on different pages and the booking one owns the conflict and
 * capacity checks. Duplicating those into the client dialog is how the two
 * drift apart, so Add Client stages what it collected and the calendar
 * opens its own dialog already filled in.
 *
 * sessionStorage rather than the URL: a client id and a pet id are
 * personal data and have no business in a link that gets pasted, logged
 * or shared. It is also per-tab, so two staff members adding clients on
 * one machine cannot collide.
 */
const KEY = "groomigo_pending_booking_v1";

/**
 * Five minutes. Long enough to walk from the client dialog to the diary,
 * short enough that a tab left open overnight does not spring a half-built
 * booking on whoever sits down next.
 */
const MAX_AGE_MS = 5 * 60 * 1000;

export type PendingBooking = {
  clientId: number;
  petIds: number[];
  serviceType: string;
  addOnsByPetId: Record<string, StagedAddOn[]>;
  /** Shown once, so the calendar can say where this came from. */
  clientName?: string;
  createdAt: number;
};

export function stagePendingBooking(booking: Omit<PendingBooking, "createdAt">): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...booking, createdAt: Date.now() }));
  } catch {
    // Private browsing, or storage turned off. The client and pet are
    // already saved by this point; the staff member just books them the
    // ordinary way, so there is nothing to recover from.
  }
}

/**
 * Read it once and remove it.
 *
 * Consume-once matters: without it, every later visit to the calendar
 * would re-open the dialog for a client who was booked in half an hour
 * ago.
 */
export function takePendingBooking(): PendingBooking | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as PendingBooking;
    if (typeof parsed?.clientId !== "number" || !Array.isArray(parsed.petIds)) return null;
    if (!Number.isFinite(parsed.createdAt) || Date.now() - parsed.createdAt > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}
