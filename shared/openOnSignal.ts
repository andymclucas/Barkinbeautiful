/**
 * "A parent bumped a counter to ask me to do something."
 *
 * The pattern is a number passed as a prop, incremented when the parent
 * wants a child to act — open a dialog, refocus a field. The child watches
 * it in an effect.
 *
 * The trap is that the effect also runs on MOUNT, and the initial value
 * looks exactly like a bump unless you compare it to something. The store
 * credit dialog opened on every visit to a client's Payments tab for
 * precisely this reason: the test was `signal !== undefined`, the parent
 * always passed a number, so the first run matched and the dialog appeared
 * with nobody having asked for it.
 *
 * Comparing against the value last acted on — seeded with the value at
 * mount — means only a genuine change counts, whatever number the parent
 * starts from.
 */
export function shouldActOnSignal(
  signal: number | undefined,
  lastActedOn: number | undefined,
): boolean {
  if (signal === undefined) return false;
  return signal !== lastActedOn;
}
