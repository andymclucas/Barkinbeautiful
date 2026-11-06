/**
 * A walk-in nail clip or a quick bath — in and out in ten minutes.
 *
 * Andy, 06/11/2026: a Quick Appointment button on the calendar, with the
 * client and dog name optional, a two-item service list, free pricing,
 * and a dog that shows on the board as "Walk-In: Nail Clip" without
 * going through the normal stages, "as these appts are usually done in
 * 10-15 mins".
 *
 * ## Why this is a flag and not two new service types
 *
 * The obvious move is to add "quick_bath" and "nail_clip" to
 * appointments.service_type. It is also the expensive one: that enum is
 * named in 54 places across the client, the server and shared, and
 * CLAUDE.md is explicit that adding a value means auditing every switch,
 * map and exhaustive check over it or the UI silently renders nothing.
 *
 * The existing values already say what the work is — nail_trim is a nail
 * clip, bath_only is a bath — so what was actually missing is "and it is
 * a ten-minute walk-in". That is one boolean, and reporting can still
 * tell a $25 quick bath from a $70 booked one by reading it.
 *
 * ## It deliberately does not use the 12-state machine
 *
 * A nail clip does not wait for a bath, get dried, then wait for a
 * groom. Put one through those stages and it sits on the board all
 * morning in a queue it does not belong to, and the bath priority list
 * counts a dog that needs no bath.
 */

export type QuickService = "nail_trim" | "bath_only";

export const QUICK_SERVICES: readonly { value: QuickService; label: string }[] = [
  { value: "nail_trim", label: "Nail Clip" },
  { value: "bath_only", label: "Quick Bath & Dry" },
];

export function isQuickService(value: unknown): value is QuickService {
  return value === "nail_trim" || value === "bath_only";
}

/** What staff picked, in their words. */
export function quickServiceLabel(serviceType: string): string {
  return QUICK_SERVICES.find((s) => s.value === serviceType)?.label ?? "Quick appointment";
}

/**
 * How it reads on the workflow board.
 *
 * Andy asked for it in these words — "Walk-In: then either the nail clip
 * or quick bath and dry" — and the prefix is what tells a groomer at a
 * glance that this one is not part of the day's run.
 */
export function quickBoardLabel(serviceType: string): string {
  return `Walk-In: ${quickServiceLabel(serviceType)}`;
}

/**
 * The only states a quick appointment moves through.
 *
 * Here, being done, done. Plus the two ways any booking can end.
 * `ready` is deliberately absent: there is no waiting around for
 * collection on a job the owner stands there for.
 */
export const QUICK_WORKFLOW_STATES: readonly string[] = [
  "scheduled", "checked_in", "complete", "cancelled", "no_show",
];

export function isQuickWorkflowState(state: string | null | undefined): boolean {
  return !!state && QUICK_WORKFLOW_STATES.includes(state);
}

/**
 * The next state a quick appointment goes to, or null when it is done.
 *
 * Three steps rather than ten, so the board's forward button means
 * something on a dog that is already in the chair.
 */
export function nextQuickWorkflowState(current: string): string | null {
  if (current === "scheduled") return "checked_in";
  if (current === "checked_in") return "complete";
  return null;
}

/** Ten to fifteen minutes, per Andy. Used for the end time when none is given. */
export const QUICK_DEFAULT_MINUTES = 15;

/**
 * What a walk-in has to tell you before the dog goes on the table.
 *
 * ## It changed, and why
 *
 * The first version of this feature made the client and dog name
 * optional — Andy, 06/11/2026: "client or dog name isn't mandatory".
 * He reversed it the same day, and he is right: "just in case anything
 * goes wrong, they have a record of who came in and when."
 *
 * ## Four required, not six
 *
 * He asked for first name, last name, dog name, breed, phone AND email.
 * Breed and email are prompted here and not enforced, because a
 * mandatory field that is awkward at the counter does not produce
 * better data — it produces `a@a.com` and a breed of "x". A record that
 * LOOKS like it has contact details and does not is worse than an
 * honest blank, because nobody finds out until the day it matters.
 *
 * Phone is the one that does the work he described. If a dog is hurt,
 * or hurts somebody, you ring them that afternoon; you do not email.
 *
 * The database agrees, for what it is worth: clients.first_name and
 * clients.last_name are NOT NULL, pets.name is NOT NULL, and email,
 * phone and breed are all nullable.
 *
 * ## And the real reason it matters
 *
 * These four are what make a walk-in a REAL client and pet rather than
 * a row hanging off a placeholder. That is what makes the record
 * permanent and searchable, lets paperwork hang off the dog, and makes
 * the second visit one tap instead of retyping.
 */
export type QuickWalkInDetails = {
  firstName: string;
  lastName: string;
  petName: string;
  phone: string;
  /** Prompted, never enforced. */
  breed?: string | null;
  email?: string | null;
};

export const QUICK_REQUIRED_FIELDS = ["firstName", "lastName", "petName", "phone"] as const;
export type QuickRequiredField = (typeof QUICK_REQUIRED_FIELDS)[number];

export const QUICK_FIELD_LABELS: Readonly<Record<QuickRequiredField, string>> = {
  firstName: "First name",
  lastName: "Last name",
  petName: "Dog's name",
  phone: "Phone number",
};

/**
 * A phone number with enough digits to ring.
 *
 * Deliberately loose. The salon takes mobiles, landlines and numbers
 * read out badly over a counter, and a strict Australian-format check
 * would reject a perfectly good number and teach staff to type
 * "0400000000" to get past it. Six digits is the line between a number
 * and a typo.
 */
export function looksLikeAPhoneNumber(value: string | null | undefined): boolean {
  return (value ?? "").replace(/\D/g, "").length >= 6;
}

/** Which required fields are still missing, in the order they are asked. */
export function missingQuickFields(details: Partial<QuickWalkInDetails>): QuickRequiredField[] {
  return QUICK_REQUIRED_FIELDS.filter((field) => {
    const value = (details[field] ?? "").trim();
    if (value === "") return true;
    return field === "phone" ? !looksLikeAPhoneNumber(value) : false;
  });
}

/** One sentence naming what is still needed, or null when it is complete. */
export function quickWalkInError(details: Partial<QuickWalkInDetails>): string | null {
  const missing = missingQuickFields(details);
  if (missing.length === 0) return null;
  const names = missing.map((field) => QUICK_FIELD_LABELS[field].toLowerCase());
  const list = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  // Named rather than "fill in the required fields": the person is
  // holding a dog and should not have to hunt for the red one.
  return `Still needed: ${list}.`;
}
