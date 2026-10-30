/**
 * What the "Email invoice" confirmation box says.
 *
 * Andy, 30/10/2026: "if there an email on file bring up a confirmation
 * box to say 'email invoice to client on xxxxx email?' If it doesn't
 * have an email address attached, give an option to add an email
 * address to send to."
 *
 * Pure, because the decisions here are the feature: which of four
 * states the booking is in, whether the box may send, and whether it
 * has to ask for an address first. None of that is about rendering,
 * and it is the part worth pinning.
 *
 * The "no email" case is the COMMON one, not the edge: 2,760 of this
 * salon's 10,108 clients have an address on file. A box that treats it
 * as an error state would be wrong three times out of four.
 */

export type InvoiceEmailTarget =
  | {
      ready: false;
      reason: "no-invoice";
      clientName?: string | null;
      email?: string | null;
    }
  | {
      ready: true;
      invoiceNumber: string;
      clientName?: string | null;
      email?: string | null;
      total: number;
      amountDue: number;
      paidInFull: boolean;
      emailedAt?: Date | string | null;
      emailedTo?: string | null;
    };

export type InvoiceEmailPrompt = {
  title: string;
  /** The question or explanation under the title. */
  body: string;
  /** Show the address field, and require it before sending. */
  needsEmail: boolean;
  /** Whether the send button does anything. */
  canSend: boolean;
  /** Shown in amber. Null when there is nothing to warn about. */
  warning: string | null;
  /** What the confirm button says. */
  confirmLabel: string;
};

function money(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `$${n.toFixed(2)}`;
}

function who(name?: string | null): string {
  const n = (name ?? "").trim();
  return n || "this client";
}

export function describeInvoiceEmailPrompt(
  target: InvoiceEmailTarget,
): InvoiceEmailPrompt {
  if (!target.ready) {
    return {
      title: "No bill yet",
      body: "There is no invoice for this booking. Use Create Bill or One Bill for All first, then email it.",
      needsEmail: false,
      canSend: false,
      warning: null,
      confirmLabel: "Email invoice",
    };
  }

  const amount = target.paidInFull
    ? `${money(target.total)}, paid in full`
    : `${money(target.amountDue)} due`;

  const noun = target.paidInFull ? "receipt" : "invoice";
  const email = (target.email ?? "").trim();

  /* Already sent is a warning, not a block. Re-sending is a normal
     thing to want — the first one went to a typo, or the client says
     they never got it — and refusing would send staff back to their
     own mail client, which is what this replaces. */
  const warning = target.emailedAt
    ? `Already emailed${target.emailedTo ? ` to ${target.emailedTo}` : ""}. Sending again will replace that record.`
    : null;

  if (!email) {
    return {
      title: `No email for ${who(target.clientName)}`,
      body: `There is no email address on file. Add one to send ${noun} ${target.invoiceNumber} — ${amount}. It will be saved to their record.`,
      needsEmail: true,
      canSend: false,
      warning,
      confirmLabel: `Save and send ${noun}`,
    };
  }

  return {
    title: `Email ${noun} to ${who(target.clientName)}?`,
    body: `${noun === "receipt" ? "Receipt" : "Invoice"} ${target.invoiceNumber} — ${amount} — will be emailed to ${email}.`,
    needsEmail: false,
    canSend: true,
    warning,
    confirmLabel: `Email ${noun}`,
  };
}

/**
 * Good enough to stop an obvious typo reaching Resend, and no stricter.
 *
 * The server validates properly with zod; this is only so the button
 * can be disabled rather than letting someone press send on "marie@"
 * and read an error afterwards. Deliberately not an RFC 5322 attempt —
 * those reject real addresses, and the cost of being wrong here is a
 * briefly disabled button, while the cost of rejecting a valid address
 * is a bill that cannot be sent at all.
 */
export function looksLikeEmail(value: string): boolean {
  const v = value.trim();
  if (v.length < 6 || v.length > 320) return false;
  if (/\s/.test(v)) return false;
  const at = v.indexOf("@");
  if (at < 1 || at !== v.lastIndexOf("@")) return false;
  const domain = v.slice(at + 1);
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}
