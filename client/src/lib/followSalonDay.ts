import { useEffect } from "react";
import { isDayBefore } from "@shared/calendarDay";

/**
 * Keep a board that is left open following the salon into the new day.
 *
 * ## Why this is a shared hook and not four lines in each page
 *
 * It was four lines in one page. WorkflowDisplay read its date once at
 * mount and nothing ever moved it, so a wall screen left on overnight
 * kept asking for yesterday — staff walked in to yesterday's dogs, all
 * complete, and none of today's. That was found and fixed there.
 *
 * WorkflowBoard has the same date state, and "Open TV Screen" drives
 * WorkflowBoard — so the salon's actual wall screen went on breaking
 * every morning after the bug was "fixed". Lauren reported it again on
 * 06/11/2026.
 *
 * One implementation, called by both, is the only version of this fix
 * that cannot be applied to one screen and not the other.
 *
 * ## Only forward, and only when behind
 *
 * Someone looking at a future day — WorkflowDisplay's "reset for
 * tomorrow", or the board's forward arrow — is doing it deliberately and
 * must not be dragged back. `salonToday` changes once a day, so despite
 * the one-second clock tick driving it this runs once, at midnight.
 */
export function useFollowSalonDay(
  salonToday: string | null | undefined,
  setBoardDate: (update: (current: string) => string) => void,
): void {
  useEffect(() => {
    if (!salonToday) return;
    setBoardDate((current) => (isDayBefore(current, salonToday) ? salonToday : current));
    // setBoardDate is a setState function and stable; salonToday is the
    // only thing that should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salonToday]);
}
