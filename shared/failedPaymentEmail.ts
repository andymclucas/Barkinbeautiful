/**
 * The email the salon gets when a membership payment fails.
 *
 * Lauren, 19/11/2026: "These emails dont really give me much information
 * on who it was." It read "Silver VIP Classic - We'll try again", which
 * names the plan and nobody on it, so every one meant opening Groomigo
 * and hunting. It now says whose payment it was, which dogs, how much,
 * why, whether bookings are on hold, and links to the client.
 *
 * The content is HTML (the owner notice wraps it in a paragraph), so
 * every name is escaped here.
 */
export type FailedPaymentEmailInput = {
  clientId: number | null;
  clientName: string | null;
  /** One entry per membership on the failed payment. */
  memberships: ReadonlyArray<{ name: string | null; dogNames: readonly string[] }>;
  /** What the failed invoice asked for, in cents. */
  amountDueCents: number | null;
  reason: string;
  suspended: boolean;
  retryAt: Date | null;
  /** The staff app's base URL, no trailing slash. */
  appBaseUrl: string;
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** "Mon 23 Nov", assembled from parts so the wording does not move with the ICU version. */
const brisbaneDay = (value: Date) => {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}`;
};

const joinNames = (names: readonly string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

export function buildFailedPaymentEmail(input: FailedPaymentEmailInput): { title: string; content: string } {
  const client = input.clientName?.trim() || "A client";
  const dogs = Array.from(
    new Set(input.memberships.flatMap((m) => m.dogNames.map((name) => name.trim()).filter(Boolean))),
  );
  const plans = input.memberships.map((m) => m.name?.trim() || "Membership");

  const who = dogs.length > 0 ? `${client} (${joinNames(dogs)})` : client;
  const title = `${input.suspended ? "⛔ Membership payment failed, bookings on hold" : "⚠️ Membership payment failed"}: ${who}`;

  const lines: string[] = [];
  lines.push(`<strong>${escapeHtml(who)}</strong>`);
  lines.push(`Plan: ${escapeHtml(plans.join(" + "))}`);
  if (input.amountDueCents != null && input.amountDueCents > 0) {
    lines.push(`Amount: ${dollars(input.amountDueCents)}`);
  }
  lines.push(`Why: ${escapeHtml(input.reason)}`);
  if (input.suspended) {
    lines.push("Their bookings are on hold until a payment goes through.");
  } else if (input.retryAt) {
    lines.push(`Groomigo will try the card again on ${brisbaneDay(input.retryAt)}.`);
  }
  if (input.clientId != null) {
    const url = `${input.appBaseUrl.replace(/\/+$/, "")}/clients/${input.clientId}`;
    lines.push(`<a href="${escapeHtml(url)}">Open ${escapeHtml(client)} in Groomigo</a>`);
  }
  return { title, content: lines.join("\n") };
}
