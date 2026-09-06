export type CompletedGroomVisit = {
  petId: number | null;
  scheduledStart: Date | string;
};

export type GroomIntervalStats = {
  averageWeeks: number | null;
  medianWeeks: number | null;
  intervalCount: number;
  returningPetCount: number;
};

/**
 * Calculates the elapsed time between consecutive completed grooms for each pet.
 * Same-day duplicates are ignored so a corrected duplicate appointment cannot
 * artificially lower the salon's repeat-groom interval.
 */
export function calculateGroomIntervalStats(visits: CompletedGroomVisit[]): GroomIntervalStats {
  const visitsByPet = new Map<number, Date[]>();

  for (const visit of visits) {
    if (visit.petId == null) continue;
    const date = new Date(visit.scheduledStart);
    if (Number.isNaN(date.getTime())) continue;
    const petVisits = visitsByPet.get(visit.petId) ?? [];
    petVisits.push(date);
    visitsByPet.set(visit.petId, petVisits);
  }

  const intervalsInWeeks: number[] = [];
  let returningPetCount = 0;

  for (const petVisits of Array.from(visitsByPet.values())) {
    petVisits.sort((a: Date, b: Date) => a.getTime() - b.getTime());
    let petHasInterval = false;
    for (let index = 1; index < petVisits.length; index += 1) {
      const elapsedMs = petVisits[index].getTime() - petVisits[index - 1].getTime();
      if (elapsedMs <= 0) continue;
      intervalsInWeeks.push(elapsedMs / (7 * 24 * 60 * 60 * 1000));
      petHasInterval = true;
    }
    if (petHasInterval) returningPetCount += 1;
  }

  if (intervalsInWeeks.length === 0) {
    return { averageWeeks: null, medianWeeks: null, intervalCount: 0, returningPetCount: 0 };
  }

  const averageWeeks = intervalsInWeeks.reduce((sum, value) => sum + value, 0) / intervalsInWeeks.length;
  const sorted = [...intervalsInWeeks].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const medianWeeks = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];

  return {
    averageWeeks: Math.round(averageWeeks * 10) / 10,
    medianWeeks: Math.round(medianWeeks * 10) / 10,
    intervalCount: intervalsInWeeks.length,
    returningPetCount,
  };
}
