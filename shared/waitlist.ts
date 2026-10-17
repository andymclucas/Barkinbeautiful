/**
 * Clients waiting for a slot that does not exist yet.
 *
 * The salon cancels about 105 bookings a quarter — more than one a day —
 * and every one is a slot somebody else wanted. December fills by
 * October, so "can you let me know if anything comes up" is a sentence
 * staff hear constantly and have nowhere to put.
 *
 * The shape is deliberately two-sided:
 *
 *   an ENTRY is a standing wish — this dog, this window, ideally this
 *   groomer. It outlives any particular slot;
 *   an OFFER is one freed slot put in front of one waiting client, with
 *   a link and a deadline. A slot can be offered to several at once, and
 *   whoever taps it is making a request, not taking the slot.
 *
 * That second part is why claims need approving: offering one slot to
 * three people means two of them can tap it, and approval is what
 * decides between them rather than a race on the database.
 */

import crypto from "crypto";
import { calculateSmsCost } from "./smsSegments";

/** How long an offer stands before it lapses. */
export const WAITLIST_OFFER_TTL_HOURS = 24;

/**
 * A window longer than this is not a waitlist entry, it is a standing
 * order — and a client who would take anything in the next six months
 * will be offered slots they have long since forgotten asking for.
 */
export const MAX_WAITLIST_WINDOW_DAYS = 120;

export type TimeOfDay = "any" | "morning" | "afternoon";

/** Noon Brisbane. Before it is a morning slot, from it an afternoon one. */
export const AFTERNOON_FROM_MINUTE = 12 * 60;

export type WaitlistEntry = {
  /** Null means any groomer will do. */
  preferredStaffId?: number | null;
  /** Brisbane calendar dates, inclusive at both ends. */
  earliestDate: string;
  latestDate: string;
  timeOfDay: TimeOfDay;
  serviceType?: string | null;
};

export type FreedSlot = {
  staffId: number | null;
  /** Brisbane calendar date of the slot, YYYY-MM-DD. */
  dateKey: string;
  /** Minutes from Brisbane midnight. */
  startMinutes: number;
  serviceType?: string | null;
};

export type MatchResult =
  | { matches: true; exactGroomer: boolean }
  | { matches: false; reason: "outside_window" | "wrong_groomer" | "wrong_time" | "wrong_service" };

/**
 * Would this client want this slot?
 *
 * Dates compare as strings because they are Brisbane calendar dates in
 * YYYY-MM-DD, which sorts correctly as text and cannot drift by a
 * timezone the way parsing them into instants can.
 *
 * A preferred groomer is a PREFERENCE, not a filter — the entry still
 * matches, and `exactGroomer` tells the caller whether it was the person
 * asked for, so staff can offer the right ones first rather than having
 * the choice made for them.
 */
export function matchesSlot(entry: WaitlistEntry, slot: FreedSlot): MatchResult {
  if (slot.dateKey < entry.earliestDate || slot.dateKey > entry.latestDate) {
    return { matches: false, reason: "outside_window" };
  }
  if (entry.serviceType && slot.serviceType && entry.serviceType !== slot.serviceType) {
    return { matches: false, reason: "wrong_service" };
  }
  if (entry.timeOfDay === "morning" && slot.startMinutes >= AFTERNOON_FROM_MINUTE) {
    return { matches: false, reason: "wrong_time" };
  }
  if (entry.timeOfDay === "afternoon" && slot.startMinutes < AFTERNOON_FROM_MINUTE) {
    return { matches: false, reason: "wrong_time" };
  }
  return {
    matches: true,
    exactGroomer: entry.preferredStaffId != null && entry.preferredStaffId === slot.staffId,
  };
}

/**
 * Who to put in front of staff first.
 *
 * The groomer the client actually asked for comes first, then whoever
 * has waited longest. Longest-waiting alone would offer a Tuesday with
 * Megs to somebody who asked specifically for Charlotte, ahead of the
 * person who wanted Megs — which is how a waitlist stops feeling like a
 * service and starts feeling like a lottery.
 */
export function rankMatches<T extends { exactGroomer: boolean; createdAt: Date | string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.exactGroomer !== b.exactGroomer) return a.exactGroomer ? -1 : 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export type OfferRow = {
  status: "offered" | "claimed" | "approved" | "declined" | "withdrawn";
  expiresAt: Date | string;
};

export type OfferState =
  | { ok: true }
  | { ok: false; reason: "expired" | "taken" | "withdrawn" | "already_claimed"; message: string };

/**
 * Can this offer still be claimed?
 *
 * Order matters. A client tapping a link for a slot somebody else has
 * been given should be told it has gone, not that it expired — the
 * first is true and the second is a different apology.
 */
export function offerState(offer: OfferRow, now: Date = new Date()): OfferState {
  if (offer.status === "withdrawn") {
    return { ok: false, reason: "withdrawn", message: "This offer has been withdrawn. Please contact the salon." };
  }
  if (offer.status === "approved" || offer.status === "declined") {
    return { ok: false, reason: "taken", message: "Sorry, this time has already been taken." };
  }
  if (offer.status === "claimed") {
    return { ok: false, reason: "already_claimed", message: "You've already asked for this time — the salon will confirm shortly." };
  }
  const expires = offer.expiresAt instanceof Date ? offer.expiresAt : new Date(offer.expiresAt);
  if (!Number.isFinite(expires.getTime()) || expires.getTime() <= now.getTime()) {
    return { ok: false, reason: "expired", message: "This offer has expired. You're still on the waitlist for the next one." };
  }
  return { ok: true };
}

/** 128 bits, for the same reason as the photo links: it must fit in a text. */
export function createWaitlistToken(now: Date = new Date()): { token: string; tokenHash: string; expiresAt: Date } {
  const token = crypto.randomBytes(16).toString("hex");
  return {
    token,
    tokenHash: hashWaitlistToken(token),
    expiresAt: new Date(now.getTime() + WAITLIST_OFFER_TTL_HOURS * 60 * 60 * 1000),
  };
}

export function hashWaitlistToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function waitlistOfferUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/slot/${token}`;
}

/**
 * The text an offer goes out as.
 *
 * One segment, like the photo link — the salon sends one of these per
 * freed slot per client and a second segment doubles that bill. The day
 * and time are in it because a client should be able to tell from the
 * notification alone whether it is worth tapping.
 *
 * The wording is as short as it is because the URL takes 73 of the 160
 * characters and a long salon name, a long dog name and a day-and-time
 * take 55 more. "First to claim it:" read better and did not fit.
 */
export function waitlistOfferSms(input: {
  salonName: string;
  petName: string;
  whenLabel: string;
  url: string;
}): string {
  return `${input.salonName}: spot for ${input.petName}, ${input.whenLabel}. Claim: ${input.url}`;
}

export function waitlistOfferSmsCost(input: Parameters<typeof waitlistOfferSms>[0]) {
  return calculateSmsCost(waitlistOfferSms(input));
}

/** "between 1 and 30 November", for a staff list and the client's page. */
export function describeWindow(entry: Pick<WaitlistEntry, "earliestDate" | "latestDate" | "timeOfDay">): string {
  const fmt = (key: string) =>
    new Date(`${key}T00:00:00Z`).toLocaleDateString("en-AU", {
      day: "numeric", month: "short", timeZone: "UTC",
    });
  const when = entry.earliestDate === entry.latestDate
    ? fmt(entry.earliestDate)
    : `${fmt(entry.earliestDate)} – ${fmt(entry.latestDate)}`;
  const time = entry.timeOfDay === "any" ? "" : `, ${entry.timeOfDay}s only`;
  return `${when}${time}`;
}

/** Days a window covers, for refusing one that is really a standing order. */
export function windowLengthDays(earliestDate: string, latestDate: string): number {
  const from = Date.parse(`${earliestDate}T00:00:00Z`);
  const to = Date.parse(`${latestDate}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0;
  return Math.round((to - from) / 86_400_000) + 1;
}
