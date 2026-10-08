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

export type CapacityState = "unknown" | "space" | "full" | "over";

export type GroomerDayLoad = {
  /** Clips already booked for that groomer on that day. */
  booked: number;
  /** What they said they can do, or null if nobody has said. */
  capacity: number | null;
  state: CapacityState;
  /** "6/8", or just "6" when there is nothing to compare against. */
  label: string;
  /** How many more will fit. Null when there is no capacity set. */
  remaining: number | null;
};

export function groomerDayLoad(booked: number, capacity: number | null | undefined): GroomerDayLoad {
  const safeBooked = Math.max(0, Math.floor(booked));
  // Null, zero and anything negative all mean "no usable figure". Zero in
  // particular must not read as "this groomer can do no dogs" — it is what
  // an empty input box saves as.
  const cap = typeof capacity === "number" && capacity > 0 ? Math.floor(capacity) : null;

  if (cap === null) {
    return { booked: safeBooked, capacity: null, state: "unknown", label: String(safeBooked), remaining: null };
  }
  const remaining = cap - safeBooked;
  const state: CapacityState = remaining < 0 ? "over" : remaining === 0 ? "full" : "space";
  return { booked: safeBooked, capacity: cap, state, label: `${safeBooked}/${cap}`, remaining };
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
  const by = after - load.capacity;
  return `${groomerName} would be ${by} clip${by === 1 ? "" : "s"} over ${indefiniteArticle(load.capacity)} ${load.capacity}-dog day (${after} booked).`;
}
