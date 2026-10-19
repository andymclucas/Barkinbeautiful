/**
 * How full a groomer's day is.
 *
 * Lauren asked the girls on 08/10/2026: Charlotte and Megs 8 clips a day,
 * Brooklyn and Zakaria 6, Ashleigh 5. The diary was already past three of
 * those — Ashleigh had eight booked for 13 October against a five — which
 * is the whole reason this is worth showing while somebody is booking
 * rather than on the morning itself.
 *
 * Clips only. Lauren: "Desheds will be on the bathers." A deshed, a bath,
 * a nail trim and a daycare all take salon time but none of them take a
 * groomer's clipping day, and counting them would make every number wrong
 * in the direction that stops a bookable dog being booked.
 */

/**
 * "an 8-dog day", not "a 8-dog day".
 *
 * Spoken, not spelled: 8 and 11 and 18 begin with a vowel sound and 1 does
 * not. A warning that reads like a typo is a warning people trust less.
 */
function indefiniteArticle(n: number): "a" | "an" {
  const digits = String(n);
  if (digits === "8" || digits === "11" || digits === "18") return "an";
  if (digits.startsWith("8") && digits.length === 2) return "an";
  return "a";
}

/** The services that use up a groomer's clipping day. */
export const CLIP_SERVICE_TYPES = ["classic_groom", "styled_groom"] as const;

export function isClip(serviceType: string | null | undefined): boolean {
  return (CLIP_SERVICE_TYPES as readonly string[]).includes(serviceType ?? "");
}

/**
 * A tidy is half a clip.
 *
 * Lauren, 08/10/2026: "That's not including baths and tidys. Rule of
 * thumb.. 2 tidys = a clip time." Counting a tidy as nothing was wrong
 * in the opposite direction from counting it as a whole clip — over the
 * last 60 days, 10 groomer-days read as within capacity and were over
 * once tidies counted, including Charlotte on 6 clips and 5 tidies
 * against an 8.
 *
 * `isClip` is deliberately unchanged and still says false for a tidy: a
 * tidy is not a clip, it just consumes part of a clip's time. The two
 * questions have different answers and the booking screens ask both.
 */
export const TIDY_SERVICE_TYPES = ["fft"] as const;

/** Two tidies to a clip. */
export const TIDY_CLIP_FRACTION = 0.5;

export function isTidy(serviceType: string | null | undefined): boolean {
  return (TIDY_SERVICE_TYPES as readonly string[]).includes(serviceType ?? "");
}

/** What one booking costs a groomer's clipping day: 1, a half, or nothing. */
export function clipLoadFor(serviceType: string | null | undefined): number {
  if (isClip(serviceType)) return 1;
  if (isTidy(serviceType)) return TIDY_CLIP_FRACTION;
  return 0;
}

/** The day's load across several bookings. */
export function clipLoadOf(serviceTypes: readonly (string | null | undefined)[]): number {
  return serviceTypes.reduce((sum: number, service) => sum + clipLoadFor(service), 0);
}

export type CapacityState = "unknown" | "space" | "full" | "over";

export type GroomerDayLoad = {
  /** Clip-equivalents booked that day: a clip is 1, a tidy a half. */
  booked: number;
  /** What they said they can do, or null if nobody has said. */
  capacity: number | null;
  state: CapacityState;
  /** "6/8" or "6.5/8", or just the number when no capacity is set. */
  label: string;
  /** How many more will fit. Null when there is no capacity set. */
  remaining: number | null;
};

export function groomerDayLoad(booked: number, capacity: number | null | undefined): GroomerDayLoad {
  // Rounded to the nearest half, not floored: a day of 7 clips and 3
  // tidies is 8.5, and flooring it to 8 hides the half that tips a
  // groomer over their 8.
  const safeBooked = Math.max(0, Math.round(booked * 2) / 2);
  // Null, zero and anything negative all mean "no usable figure". Zero in
  // particular must not read as "this groomer can do no dogs" — it is what
  // an empty input box saves as.
  const cap = typeof capacity === "number" && capacity > 0 ? Math.floor(capacity) : null;

  if (cap === null) {
    return { booked: safeBooked, capacity: null, state: "unknown", label: formatLoad(safeBooked), remaining: null };
  }
  const remaining = cap - safeBooked;
  const state: CapacityState = remaining < 0 ? "over" : remaining === 0 ? "full" : "space";
  return { booked: safeBooked, capacity: cap, state, label: `${formatLoad(safeBooked)}/${cap}`, remaining };
}

/** "6" or "6.5" — never "6.0", which reads like a precision nobody has. */
export function formatLoad(load: number): string {
  return Number.isInteger(load) ? String(load) : load.toFixed(1);
}

/**
 * What to say before adding one more.
 *
 * Null means nothing needs saying. This never blocks a booking — the salon
 * squeezes dogs in for good reasons and a system that refuses would simply
 * be worked around — it just makes sure nobody does it by accident.
 */
export function overbookingWarning(
  load: GroomerDayLoad,
  groomerName: string,
  adding = 1,
): string | null {
  if (load.capacity === null) return null;
  const after = load.booked + adding;
  if (after <= load.capacity) return null;
  const by = Math.round((after - load.capacity) * 2) / 2;
  // "half a clip over" rather than "0.5 clips over", which reads like a
  // rounding artefact rather than a tidy.
  const amount = by === 0.5 ? "half a clip" : `${formatLoad(by)} clip${by === 1 ? "" : "s"}`;
  return `${groomerName} would be ${amount} over ${indefiniteArticle(load.capacity)} ${load.capacity}-dog day (${formatLoad(after)} booked).`;
}
