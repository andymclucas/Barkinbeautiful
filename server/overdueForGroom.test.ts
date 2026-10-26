import { describe, it, expect } from "vitest";
import {
  petCadences, overduePets, describeOverdue, OVERDUE_BAND_LABEL,
} from "../shared/overdueForGroom";

const TZ = "Australia/Brisbane";
const NOW = new Date("2026-10-26T04:00:00Z"); // Mon 26 Oct, 14:00 Brisbane
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** A dog on a steady `weeks` rhythm, `count` visits, last one `lastAgo` days back. */
const regular = (petId: number, weeks: number, count: number, lastAgoDays: number) => {
  const visits = [];
  for (let i = 0; i < count; i += 1) {
    const back = lastAgoDays + (count - 1 - i) * weeks * 7;
    visits.push({ petId, scheduledStart: new Date(NOW.getTime() - back * 86_400_000) });
  }
  return visits;
};

describe("petCadences", () => {
  it("learns each dog's own rhythm, not the salon's average", () => {
    // A 4-weekly cavoodle and a 12-weekly labrador are both regulars.
    const cadences = petCadences([...regular(1, 4, 4, 0), ...regular(2, 12, 4, 0)]);
    expect(cadences.get(1)!.medianWeeks).toBe(4);
    expect(cadences.get(2)!.medianWeeks).toBe(12);
  });

  it("uses the median, so one long gap does not reset the rhythm", () => {
    // Four-weekly, then a six-month absence, then four-weekly again. A
    // mean would read ~11 weeks and the dog would never look late again.
    const visits = [
      { petId: 1, scheduledStart: day("2026-01-05") },
      { petId: 1, scheduledStart: day("2026-02-02") }, // 4w
      { petId: 1, scheduledStart: day("2026-08-03") }, // 26w — the holiday
      { petId: 1, scheduledStart: day("2026-08-31") }, // 4w
      { petId: 1, scheduledStart: day("2026-09-28") }, // 4w
    ];
    expect(petCadences(visits).get(1)!.medianWeeks).toBe(4);
  });

  it("ignores a same-day duplicate rather than reading it as a zero rhythm", () => {
    const visits = [
      { petId: 1, scheduledStart: day("2026-09-01") },
      { petId: 1, scheduledStart: new Date("2026-09-01T06:00:00Z") }, // duplicate
      { petId: 1, scheduledStart: day("2026-09-29") },
    ];
    const cadence = petCadences(visits).get(1)!;
    expect(cadence.intervalCount).toBe(1);
    expect(cadence.medianWeeks).toBe(4);
  });

  it("has nothing to say about a dog that has been in once", () => {
    expect(petCadences([{ petId: 1, scheduledStart: day("2026-09-01") }]).has(1)).toBe(false);
  });

  it("skips unusable rows instead of throwing", () => {
    const cadences = petCadences([
      { petId: 1, scheduledStart: "not a date" },
      { petId: null as unknown as number, scheduledStart: day("2026-09-01") },
    ]);
    expect(cadences.size).toBe(0);
  });
});

describe("overduePets", () => {
  const opts = { timeZone: TZ, now: NOW };

  it("flags a dog past its own rhythm", () => {
    // 4-weekly, last seen 40 days ago: 12 days past due.
    const [late] = overduePets({ visits: regular(1, 4, 4, 40), options: opts });
    expect(late.petId).toBe(1);
    expect(late.daysOverdue).toBe(12);
    expect(late.band).toBe("overdue_7_13");
  });

  it("puts a dog two weeks past into the worse band", () => {
    const [late] = overduePets({ visits: regular(1, 4, 4, 45), options: opts });
    expect(late.daysOverdue).toBe(17);
    expect(late.band).toBe("overdue_14_plus");
  });

  it("gives a week of grace, because a learned rhythm is approximate", () => {
    // 3 days past due is noise, not a lapsed client.
    expect(overduePets({ visits: regular(1, 4, 4, 31), options: opts })).toEqual([]);
  });

  it("NEVER lists a dog that already has a booking", () => {
    // The one way this list could do harm: telling the salon to chase a
    // client "before they book elsewhere" when they booked yesterday.
    const visits = regular(1, 4, 4, 60);
    expect(overduePets({ visits, options: opts })).toHaveLength(1);
    expect(overduePets({ visits, bookedPetIds: [1], options: opts })).toEqual([]);
  });

  it("leaves out departed pets and duplicates", () => {
    const visits = regular(1, 4, 4, 60);
    expect(overduePets({ visits, excludePetIds: [1], options: opts })).toEqual([]);
  });

  it("will not call a dog late on the strength of one gap", () => {
    // Two visits is one interval. A dog that came twice is a dog that
    // came twice, not a dog with a rhythm.
    expect(overduePets({ visits: regular(1, 4, 2, 60), options: opts })).toEqual([]);
    expect(overduePets({ visits: regular(1, 4, 3, 60), options: opts })).toHaveLength(1);
  });

  it("drops a dog that is long gone rather than burying this week's", () => {
    // Eight months past due is a different conversation from two weeks.
    expect(overduePets({ visits: regular(1, 4, 4, 280), options: opts })).toEqual([]);
  });

  it("ignores a dog with no real cadence to be late against", () => {
    // Seen once a year — not a regular, so "overdue" is meaningless.
    expect(overduePets({ visits: regular(1, 52, 4, 400), options: opts })).toEqual([]);
  });

  it("sorts worst first, so the most at-risk client is at the top", () => {
    const list = overduePets({
      visits: [...regular(1, 4, 4, 40), ...regular(2, 4, 4, 70), ...regular(3, 4, 4, 55)],
      options: opts,
    });
    expect(list.map((p) => p.petId)).toEqual([2, 3, 1]);
  });

  it("says when the dog was last in and when it was due", () => {
    const [late] = overduePets({ visits: regular(1, 4, 4, 40), options: opts });
    expect(late.lastVisit).toBe("2026-09-16");
    expect(late.dueOn).toBe("2026-10-14");
    expect(late.medianWeeks).toBe(4);
    expect(late.intervalCount).toBe(3);
  });
});

describe("unconfirmed visits", () => {
  const opts = { timeZone: TZ, now: NOW };

  it("says nothing about a dog whose last trace was never completed", () => {
    // Measured on the live book 26/10/2026: 368 August appointments were
    // still sitting at "scheduled" — dogs that came in and were groomed
    // but whose workflow never advanced. Without this guard, 29 of 240
    // pets were called overdue on the strength of a visit that actually
    // happened. 12%, every one a client somebody would have rung.
    const visits = regular(1, 4, 4, 60);
    expect(overduePets({ visits, options: opts })).toHaveLength(1);
    const recent = [{ petId: 1, scheduledStart: new Date(NOW.getTime() - 10 * 86_400_000) }];
    expect(overduePets({ visits, unconfirmedVisits: recent, options: opts })).toEqual([]);
  });

  it("still lists the dog when the unconfirmed visit is OLDER than its last groom", () => {
    // An ancient stuck row must not silence a genuine lapse for ever.
    const visits = regular(1, 4, 4, 60);
    const ancient = [{ petId: 1, scheduledStart: new Date(NOW.getTime() - 400 * 86_400_000) }];
    expect(overduePets({ visits, unconfirmedVisits: ancient, options: opts })).toHaveLength(1);
  });

  it("ignores an unconfirmed appointment in the future", () => {
    // A future booking is handled by bookedPetIds and means "coming",
    // not "we lost track". Passing it here must not silently do the same
    // job by accident — the two are different facts.
    const visits = regular(1, 4, 4, 60);
    const future = [{ petId: 1, scheduledStart: new Date(NOW.getTime() + 5 * 86_400_000) }];
    expect(overduePets({ visits, unconfirmedVisits: future, options: opts })).toHaveLength(1);
  });

  it("only silences the pet it belongs to", () => {
    const visits = [...regular(1, 4, 4, 60), ...regular(2, 4, 4, 60)];
    const recent = [{ petId: 1, scheduledStart: new Date(NOW.getTime() - 10 * 86_400_000) }];
    const list = overduePets({ visits, unconfirmedVisits: recent, options: opts });
    expect(list.map((p) => p.petId)).toEqual([2]);
  });
});

describe("describeOverdue", () => {
  it("reads as a badge", () => {
    expect(describeOverdue(3)).toBe("3d");
    expect(describeOverdue(14)).toBe("2w");
    expect(describeOverdue(23)).toBe("3w 2d");
    expect(describeOverdue(0)).toBe("0d");
    expect(describeOverdue(-5)).toBe("0d");
  });
});

describe("OVERDUE_BAND_LABEL", () => {
  it("names both bands", () => {
    expect(OVERDUE_BAND_LABEL.overdue_7_13).toBe("Overdue 7–13 days");
    expect(OVERDUE_BAND_LABEL.overdue_14_plus).toBe("Overdue 14+ days");
  });
});
