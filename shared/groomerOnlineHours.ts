/**
 * Which start times a groomer takes online bookings at.
 *
 * Lauren, 27/11/2026: "need to add me for online bookings but only
 * afternoon spots 11, 12, 12:30, 1pm", and Ash "finishes work at 2pm so
 * probably need to stop her online bookings at 12:30 latest".
 *
 * Stored on the staff row as a JSON list of "HH:MM" Brisbane times
 * (staff.online_start_times). Empty, NULL or unreadable means no limit of
 * the groomer's own: they take every start the salon offers online
 * (shared/onlineBookingSlots.ts). The salon's rules always apply on top, so
 * a time listed here that the salon does not offer is still not offered.
 */
import { dateTimeFormat } from "./intlCache";

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** Tidy "11", "1pm", "12:30" style input into sorted, unique "HH:MM". Unreadable entries are dropped. */
export function normaliseStartTimes(entries: readonly string[]): string[] {
  const out = new Set<string>();
  for (const raw of entries) {
    const s = raw.trim().toLowerCase().replace(/\s+/g, "");
    if (!s) continue;
    const m = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/.exec(s);
    if (!m) continue;
    let h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    if (m[3] === "pm" && h < 12) h += 12;
    if (m[3] === "am" && h === 12) h = 0;
    if (h > 23 || min > 59) continue;
    out.add(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return Array.from(out).sort();
}

/** The stored list, or null when the groomer has no limit of their own. */
export function parseStartTimes(stored: string | null | undefined): string[] | null {
  if (!stored) return null;
  try {
    const list = JSON.parse(stored);
    if (!Array.isArray(list)) return null;
    const times = list.filter((t): t is string => typeof t === "string" && HHMM.test(t));
    return times.length ? normaliseStartTimes(times) : null;
  } catch {
    return null;
  }
}

function brisbaneHHMM(when: Date): string {
  const parts = dateTimeFormat("en-AU", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Australia/Brisbane" }).formatToParts(when);
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h.padStart(2, "0")}:${m}`;
}

/**
 * Does this groomer take a dog this heavy online?
 *
 * Lauren, 27/11/2026: "I dont really want to book in large dogs in my box".
 * No limit set, or a dog whose weight is not known (a portal dog the salon
 * has never weighed), is allowed: staff approve every online booking
 * before it is confirmed (shared/bookingRequests.ts).
 */
export function groomerTakesDogWeight(maxKg: number | null | undefined, weightKg: number | string | null | undefined): boolean {
  if (maxKg === null || maxKg === undefined || !(maxKg > 0)) return true;
  // A decimal column can arrive as "40.00"; read it as a number.
  const kg = weightKg === null || weightKg === undefined ? NaN : Number(weightKg);
  if (!Number.isFinite(kg) || kg <= 0) return true;
  return kg <= maxKg;
}

/** Does this groomer take an online booking starting then? */
export function groomerTakesOnlineStart(stored: string | null | undefined, scheduledStart: Date): boolean {
  const times = parseStartTimes(stored);
  if (!times) return true;
  return times.includes(brisbaneHHMM(scheduledStart));
}
