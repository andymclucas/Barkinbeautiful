/**
 * What a client sees about their own money in the client portal.
 *
 * Payments reach this salon by three different routes — an invoice settled
 * at the counter, a membership subscription charge, and a one-off card or
 * cash payment against an appointment — and they live in three tables. A
 * client does not care which table they came from; they want one list that
 * reconciles against their bank statement. Merging them is this module's
 * job, and it is pure so the ordering and the money arithmetic can be
 * tested without a database.
 */

export type PortalInvoice = {
  id: number;
  invoiceNumber?: string | null;
  total?: string | number | null;
  status?: string | null;
  paidAt?: Date | string | null;
  createdAt?: Date | string | null;
  paymentMethod?: string | null;
  lineItems?: { description?: string | null; quantity?: number | null; lineTotal?: string | number | null }[];
};

export type PortalPayment = {
  /** Stable key for React; source-prefixed because ids repeat across tables. */
  key: string;
  source: "invoice" | "membership" | "appointment";
  amount: number;
  /** 0 when the source row carried no date at all; sorts to the bottom. */
  at: Date | string | number;
  method?: string | null;
  description: string;
};

export type PaymentSources = {
  invoices?: PortalInvoice[];
  membershipPayments?: { id: number; amount?: string | number | null; paidAt?: Date | string | null; status?: string | null }[];
  appointmentPayments?: { id: number; amount?: string | number | null; createdAt?: Date | string | null; method?: string | null; note?: string | null }[];
};

/** Decimal strings out of MySQL; never trust them to be numbers already. */
export function toAmount(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function formatMoney(value: string | number | null | undefined): string {
  return `$${toAmount(value).toFixed(2)}`;
}

function time(value: Date | string | number | null | undefined): number {
  if (!value) return 0;
  const ms = new Date(value as string).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/** Only an invoice that is actually settled counts as a payment. */
export function isPaidInvoice(invoice: PortalInvoice): boolean {
  return (invoice.status ?? "").toLowerCase() === "paid";
}

/**
 * A voided invoice is not owed.
 *
 * "Outstanding" used to mean anything not marked paid, which is fine while
 * every invoice is either paid or due. It stops being fine the moment an
 * invoice is cancelled: 6,871 imported invoices were voided on 05/10/2026
 * because they asserted payments that never happened, and under the old
 * reading every one of them would have reappeared as debt.
 */
export function isVoidInvoice(invoice: PortalInvoice): boolean {
  return (invoice.status ?? "").toLowerCase() === "cancelled";
}

export function invoiceOutstanding(invoices: readonly PortalInvoice[]): number {
  return invoices
    .filter((i) => !isPaidInvoice(i) && !isVoidInvoice(i))
    .reduce((sum, i) => sum + toAmount(i.total), 0);
}

/**
 * One timeline, newest first.
 *
 * A membership payment with a non-paid status is left out: a failed charge
 * is not money the client parted with, and showing it as a payment on their
 * own statement would be alarming and wrong.
 */
export function buildPaymentTimeline(sources: PaymentSources): PortalPayment[] {
  const rows: PortalPayment[] = [];

  for (const invoice of sources.invoices ?? []) {
    if (!isPaidInvoice(invoice)) continue;
    rows.push({
      key: `invoice-${invoice.id}`,
      source: "invoice",
      amount: toAmount(invoice.total),
      at: invoice.paidAt ?? invoice.createdAt ?? 0,
      method: invoice.paymentMethod ?? null,
      description: invoice.invoiceNumber ? `Invoice ${invoice.invoiceNumber}` : "Invoice",
    });
  }

  for (const payment of sources.membershipPayments ?? []) {
    if ((payment.status ?? "").toLowerCase() !== "paid") continue;
    rows.push({
      key: `membership-${payment.id}`,
      source: "membership",
      amount: toAmount(payment.amount),
      at: payment.paidAt ?? 0,
      method: "card",
      description: "Membership payment",
    });
  }

  for (const payment of sources.appointmentPayments ?? []) {
    rows.push({
      key: `appointment-${payment.id}`,
      source: "appointment",
      amount: toAmount(payment.amount),
      at: payment.createdAt ?? 0,
      method: payment.method ?? null,
      description: payment.note?.trim() || "Payment for grooming",
    });
  }

  return rows.sort((a, b) => time(b.at) - time(a.at));
}

export function totalPaid(payments: readonly PortalPayment[]): number {
  return payments.reduce((sum, p) => sum + p.amount, 0);
}
