/**
 * One invoice for a whole booking, however many dogs are on it.
 *
 * Lauren, 23/10/2026: "I like the split payment thing. But how do I
 * invoice a total double dog invoice?" Create Bills raised one invoice
 * per dog, so a household paying once for Agnes and Shirley got two
 * bills.
 *
 * The line items are the per-dog ones, unchanged — `buildInvoiceLines`
 * already itemises a groom and its extras, and reusing it means a
 * combined bill and two separate ones list the same things at the same
 * prices. All this adds is the envelope: one number, one total, one
 * due date.
 *
 * Membership grooms keep their existing behaviour. A covered groom
 * appears at zero and only its extras are charged, so a combined
 * invoice across a member and a non-member dog bills exactly what two
 * separate invoices would have.
 */

import type { InvoiceLine } from "./appointmentAddOns";

export type CombinableAppointment = {
  appointmentId: number;
  petName: string | null;
  lines: InvoiceLine[];
  subtotalCents: number;
  /** Set when this dog's groom is covered by a membership. */
  membershipCovered: boolean;
};

export type CombinedInvoice = {
  appointmentIds: number[];
  petNames: string[];
  lines: InvoiceLine[];
  subtotal: string;
  subtotalCents: number;
  /** "Agnes and Shirley", for the invoice note. */
  who: string;
};

/** "Agnes and Shirley", "Agnes, Shirley and Bo". */
export function listPets(names: readonly (string | null)[]): string {
  const clean = names.map((n) => String(n ?? "").trim()).filter(Boolean);
  if (clean.length === 0) return "Pet";
  if (clean.length === 1) return clean[0];
  return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}

/**
 * Merge several dogs' lines into one bill.
 *
 * The order is the order given, which is the order the dogs are on the
 * booking — so the invoice reads down the page the way the booking
 * reads across the board.
 *
 * Returns null when there is nothing to bill. That is not an error: a
 * booking where every groom is membership-covered and nobody had an
 * extra genuinely owes nothing, and raising a $0 invoice for it would
 * be a bill the client has to read and ignore.
 */
export function combineInvoice(
  appointments: readonly CombinableAppointment[],
): CombinedInvoice | null {
  const billable = appointments.filter((a) => a.lines.length > 0);
  if (billable.length === 0) return null;

  const subtotalCents = billable.reduce((sum, a) => sum + a.subtotalCents, 0);
  // Every line is zero — a membership booking with no extras. Nothing to
  // charge, so nothing to send.
  if (subtotalCents <= 0) return null;

  return {
    appointmentIds: billable.map((a) => a.appointmentId),
    petNames: billable.map((a) => a.petName ?? "Pet"),
    lines: billable.flatMap((a) => a.lines),
    subtotalCents,
    subtotal: (subtotalCents / 100).toFixed(2),
    who: listPets(billable.map((a) => a.petName)),
  };
}

/**
 * The invoice number for a combined bill.
 *
 * Named for the household rather than a dog, because naming it after
 * one of two dogs makes the other owner's copy look like somebody
 * else's bill. The date and the random tail match the per-dog format so
 * both sort together in a list.
 */
export function combinedInvoiceNumber(input: {
  clientLastName: string | null | undefined;
  date: Date;
  suffix: string;
}): string {
  // Trimmed AFTER the slice as well as before it: "O'Brien-Smith"
  // becomes "O-BRIEN-SMITH", and cutting that to eight characters
  // reintroduces a trailing hyphen — "GROOM-O-BRIEN--231026".
  const slug = String(input.clientLastName ?? "CLIENT")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 8)
    .replace(/-+$/, "") || "CLIENT";
  const datePart = input.date.toLocaleDateString("en-AU", {
    timeZone: "Australia/Brisbane", day: "2-digit", month: "2-digit", year: "2-digit",
  }).replace(/\//g, "");
  return `GROOM-${slug}-${datePart}-${input.suffix}`;
}
