/**
 * Move an HTML date input value without converting it through the browser's
 * local timezone. `toISOString()` on a local midnight can otherwise return
 * the previous UTC day and cause a Next button to appear unresponsive.
 */
export function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
  return shifted.toISOString().slice(0, 10);
}
