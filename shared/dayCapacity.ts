/**
 * Whether a day still has room to take a dog.
 *
 * Lauren, 30/10/2026: "I used moego to rebook dogs yesterday still cause
 * it's really hard to see where I have spots left until Xmas... we need
 * something similar to see at a glance days that aren't at full Capacity.
 * Moego has a green dot on the whole month calendar on days that aren't
 * at full capacity."
 *
 * Counted PER GROOMER, not as one salon total, because the total lies.
 * On 06/01/2027 the board holds 24 dogs against a nominal 33 and reads
 * busy — but Ashleigh is full at 5 of 5 while Brooklyn and Zakaria have
 * nine clips free between them. A salon-wide number cannot tell those
 * apart, and "can I fit this dog in" is always a question about one
 * groomer's day.
 *
 * Only staff with a `dailyClipCapacity` are counted. Bathers and
 * managers have none, and a bath is not clip work — folding Stephanie's
 * four baths into the groomers' numbers would show the day fuller than
 * it is.
 */

export type CapacityStaff = {
  id: number;
  name: string;
  /** Clips this person can do in a day. Null means they do not clip. */
  dailyClipCapacity?: number | null;
  isActive?: boolean | number | null;
};

export type CapacityBooking = {
  /** Null for a dog nobody has been assigned to yet. */
  staffId: number | null;
};

export type GroomerDay = {
  staffId: number;
  name: string;
  capacity: number;
  booked: number;
  /** Never negative — see `over` for the other direction. */
  remaining: number;
  /** How many past capacity, when the day has been overbooked. */
  over: number;
};

export type DayCapacity = {
  capacity: number;
  booked: number;
  /** Spare clips, summed over groomers who HAVE spare ones. */
  remaining: number;
  /** True when at least one groomer could still take a dog. */
  hasRoom: boolean;
  /** Groomers already past their own capacity. */
  overbooked: GroomerDay[];
  /** Dogs on the day with nobody assigned yet. */
  unassigned: number;
  perGroomer: GroomerDay[];
  /** No groomer working at all — a closed day, not a full one. */
  closed: boolean;
};

const active = (s: CapacityStaff) => s.isActive === undefined || s.isActive === null || Boolean(s.isActive);

export function dayCapacity(
  bookings: readonly CapacityBooking[],
  staff: readonly CapacityStaff[],
  /** Staff ids not working that day — leave, or a full-day blockout. */
  awayStaffIds: readonly number[] = [],
): DayCapacity {
  const away = new Set(awayStaffIds);
  const groomers = staff.filter(
    (s) => active(s) && typeof s.dailyClipCapacity === "number" && s.dailyClipCapacity > 0 && !away.has(s.id),
  );

  const bookedBy = new Map<number, number>();
  let unassigned = 0;
  for (const b of bookings) {
    if (b.staffId === null) { unassigned++; continue; }
    bookedBy.set(b.staffId, (bookedBy.get(b.staffId) ?? 0) + 1);
  }

  const perGroomer: GroomerDay[] = groomers.map((s) => {
    const capacity = s.dailyClipCapacity as number;
    const booked = bookedBy.get(s.id) ?? 0;
    return {
      staffId: s.id, name: s.name, capacity, booked,
      remaining: Math.max(0, capacity - booked),
      over: Math.max(0, booked - capacity),
    };
  });

  return {
    capacity: perGroomer.reduce((n, g) => n + g.capacity, 0),
    /* Only the groomers' own bookings. A bath on the same day belongs to
       nobody here, and counting it would overstate how full the day is. */
    booked: perGroomer.reduce((n, g) => n + g.booked, 0),
    remaining: perGroomer.reduce((n, g) => n + g.remaining, 0),
    hasRoom: perGroomer.some((g) => g.remaining > 0),
    overbooked: perGroomer.filter((g) => g.over > 0),
    unassigned,
    perGroomer,
    closed: perGroomer.length === 0,
  };
}

export type CapacityState = "closed" | "room" | "tight" | "full" | "over";

/**
 * The dot.
 *
 * The question it answers is "can I put a dog in this day", so ROOM
 * wins over everything except the day being shut. An earlier version
 * checked overbooking first and painted Wed 18/11/2026 red because
 * Ashleigh was one past her five — on a day with fifteen clips free.
 * That steers Lauren away from a day she can comfortably book, which
 * is the exact opposite of what she asked for.
 *
 * One groomer over on an otherwise open day is a rebalancing job, not
 * a capacity one. It still appears, in `describeCapacity`, which is
 * what the day's tooltip reads from.
 *
 * `closed` is deliberately NOT "full": a Monday with nobody rostered
 * has no capacity, and showing it as booked out would read as a busy
 * day rather than a shut one.
 */
export function capacityState(day: DayCapacity): CapacityState {
  if (day.closed) return "closed";
  if (day.hasRoom) {
    return day.remaining <= Math.max(1, Math.round(day.capacity * 0.15)) ? "tight" : "room";
  }
  return day.overbooked.length > 0 ? "over" : "full";
}

export function describeCapacity(day: DayCapacity): string {
  if (day.closed) return "Nobody rostered";
  const parts = [`${day.booked} of ${day.capacity} clips`];
  if (day.remaining > 0) parts.push(`${day.remaining} free`);
  if (day.overbooked.length) parts.push(`${day.overbooked.map((g) => `${g.name} over by ${g.over}`).join(", ")}`);
  if (day.unassigned) parts.push(`${day.unassigned} unassigned`);
  return parts.join(" · ");
}

/**
 * Services that put a dog through the bath.
 *
 * Nearly everything does: the workflow runs bath → dry → groom, and 37
 * of the 39 dogs on 29/10/2026 were bathed. A nail trim and a day care
 * stay are the exceptions, and counting them would overstate the queue.
 */
export function needsBath(serviceType: string | null | undefined): boolean {
  const t = (serviceType ?? "").toLowerCase();
  if (t === "nail_trim" || t === "daycare") return false;
  return true;
}

export type BathCapacityBooking = {
  serviceType?: string | null;
};

export type BathDayCapacity = {
  capacity: number;
  booked: number;
  remaining: number;
  hasRoom: boolean;
  over: number;
  /** Nobody on the bathing team is in — not the same as being full. */
  closed: boolean;
};

/**
 * The bath queue's day, as a salon total rather than per person.
 *
 * Deliberately different in shape from `dayCapacity`. A groom belongs
 * to one named groomer and "can Charlotte take this dog" is the real
 * question; a bath is handed to whoever is free, so the question is
 * whether the TEAM can get through the day. Modelling it per bather
 * would invent an assignment the salon does not make at booking time.
 *
 * Why this exists at all: the salon has had a clip capacity per
 * groomer since the online-booking work and nothing for bathing, yet
 * the bath queue is what the floor waits on. On 29/10/2026 every bath
 * ran 13-33 minutes, inside every threshold, while dogs sat up to
 * 2h30 waiting for one.
 */
export function bathDayCapacity(
  bookings: readonly BathCapacityBooking[],
  staff: readonly (CapacityStaff & { dailyBathCapacity?: number | null })[],
  awayStaffIds: readonly number[] = [],
): BathDayCapacity {
  const away = new Set(awayStaffIds);
  const capacity = staff
    .filter((s) => active(s) && typeof s.dailyBathCapacity === "number" && s.dailyBathCapacity > 0 && !away.has(s.id))
    .reduce((n, s) => n + (s.dailyBathCapacity as number), 0);

  const booked = bookings.filter((b) => needsBath(b.serviceType)).length;

  /* No bath capacity configured is NOT a full bath queue. Until Andy
     and Lauren set the figures this reads as "not measured" and never
     as "stop booking" — without the guard an unconfigured salon shows
     every dog as over, which is the false alarm this is meant to
     avoid. */
  if (capacity === 0) {
    return { capacity: 0, booked, remaining: 0, hasRoom: false, over: 0, closed: true };
  }

  return {
    capacity,
    booked,
    remaining: Math.max(0, capacity - booked),
    hasRoom: booked < capacity,
    over: Math.max(0, booked - capacity),
    closed: false,
  };
}

export function describeBathCapacity(day: BathDayCapacity): string {
  if (day.closed) return "No bath capacity set";
  const parts = [`${day.booked} of ${day.capacity} baths`];
  if (day.remaining > 0) parts.push(`${day.remaining} free`);
  if (day.over > 0) parts.push(`${day.over} over`);
  return parts.join(" · ");
}
