/**
 * The invoice a client receives by email.
 *
 * Lauren, 30/10/2026, on a two-dog booking: "This customer - I email the
 * invoice to usually. I'll invoice through MoeGo until it's ready in
 * Groomigo." Andy asked for it to look like Groomigo rather than copy
 * MoeGo's layout.
 *
 * Pure, so the wording, the arithmetic and the escaping can all be
 * tested without Resend, a database or a network. The caller supplies
 * every figure; nothing is looked up here.
 *
 * ## Three decisions worth knowing
 *
 * **It is the SALON's invoice, not Groomigo's.** Groomigo is the design
 * — the card, the type, the spacing — and every colour comes from the
 * tenant's own brand fields. Barkin' Beautiful's is pink; the next
 * salon's will not be. A client has a relationship with their groomer,
 * not with the software, and a multi-tenant product that mails out the
 * vendor's branding is one that cannot be sold twice.
 *
 * **Tables and inline styles, not a stylesheet.** Gmail strips `<style>`
 * blocks, Outlook renders with Word, and neither does flexbox or grid.
 * This looks like 2004 HTML because email still is.
 *
 * **No "pay now" button.** `invoices.stripeCheckoutUrl` is built from
 * the request's Origin header rather than `getAppBaseUrl()`, so a link
 * made during a staff session can carry whatever host that session was
 * on. Mailing it to a client would publish that mistake. The invoice
 * tells them what is owed and lets the salon take it the way they
 * already do; the button can come once that URL is built properly.
 */

import { escapeHtml } from "./escapeHtml";
import { gstBreakdown } from "./gst";

export type InvoiceEmailSalon = {
  name: string;
  abn?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  /** Tenant brand colours. Defaults are Groomigo's own, not this salon's. */
  brandPrimary?: string | null;
  brandAccent?: string | null;
};

export type InvoiceEmailLine = {
  description: string;
  quantity: number;
  /** Line total, GST inclusive, in dollars. */
  amount: number;
  /** Which dog this line is for, when a bill covers more than one. */
  petName?: string | null;
};

export type InvoiceEmailInput = {
  salon: InvoiceEmailSalon;
  clientName?: string | null;
  invoiceNumber: string;
  /** Rendered date strings. Formatting is the caller's job — it owns the
      salon timezone, and date-fns has no business in a pure module that
      the tests want to pin exact output for. */
  issuedOn: string;
  dueOn?: string | null;
  serviceOn?: string | null;
  lines: readonly InvoiceEmailLine[];
  /** GST-inclusive total owed. */
  total: number;
  /** Already received against this bill. */
  amountPaid: number;
};

export type BuiltInvoiceEmail = {
  subject: string;
  html: string;
  /** What is still owed, after payments. Never negative. */
  amountDue: number;
  paidInFull: boolean;
};

const GROOMIGO_PRIMARY = "#7c5cff";
const GROOMIGO_ACCENT = "#efeaff";
const INK = "#1f1430";
const MUTED = "#6b6477";
const HAIRLINE = "#e8e4ef";

/** A hex colour we are willing to put in a style attribute. */
function safeColour(value: string | null | undefined, fallback: string): string {
  const v = (value ?? "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
}

export function formatMoney(amount: number): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

export function buildInvoiceEmail(input: InvoiceEmailInput): BuiltInvoiceEmail {
  const salonName = (input.salon.name ?? "").trim() || "Your groomer";
  const primary = safeColour(input.salon.brandPrimary, GROOMIGO_PRIMARY);
  const accent = safeColour(input.salon.brandAccent, GROOMIGO_ACCENT);

  const total = Number.isFinite(input.total) ? Math.max(0, input.total) : 0;
  const paid = Number.isFinite(input.amountPaid) ? Math.max(0, input.amountPaid) : 0;
  /* Rounded in cents. 0.1 + 0.2 arithmetic leaves a tenth of a cent
     outstanding on perfectly settled bills, and an invoice that says
     "Amount due $0.00" in red is worse than one that says Paid. */
  const dueCents = Math.max(0, Math.round(total * 100) - Math.round(paid * 100));
  const amountDue = dueCents / 100;
  const paidInFull = dueCents === 0 && total > 0;

  const { gst, exGst } = gstBreakdown(total);

  const firstName = (input.clientName ?? "").trim().split(/\s+/)[0] ?? "";
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi there,";

  const subject = paidInFull
    ? `Your receipt from ${salonName} — ${input.invoiceNumber}`
    : `Your invoice from ${salonName} — ${input.invoiceNumber}`;

  const statusPill = paidInFull
    ? pill("PAID IN FULL", "#0f7a4d", "#e4f6ed")
    : pill(`${formatMoney(amountDue)} DUE`, "#9a3412", "#fdecd8");

  const lineRows = input.lines.length > 0
    ? input.lines.map((line) => {
        const pet = (line.petName ?? "").trim();
        const qty = Number.isFinite(line.quantity) ? line.quantity : 1;
        return `
          <tr>
            <td style="padding:10px 0;border-bottom:1px solid ${HAIRLINE};font-size:14px;color:${INK};">
              ${escapeHtml(line.description)}${
                pet ? `<div style="font-size:12px;color:${MUTED};padding-top:2px;">${escapeHtml(pet)}</div>` : ""
              }
            </td>
            <td align="center" style="padding:10px 8px;border-bottom:1px solid ${HAIRLINE};font-size:14px;color:${MUTED};white-space:nowrap;">
              ${qty > 1 ? `&times;${escapeHtml(String(qty))}` : ""}
            </td>
            <td align="right" style="padding:10px 0;border-bottom:1px solid ${HAIRLINE};font-size:14px;color:${INK};white-space:nowrap;">
              ${escapeHtml(formatMoney(line.amount))}
            </td>
          </tr>`;
      }).join("")
    : `<tr><td colspan="3" style="padding:10px 0;border-bottom:1px solid ${HAIRLINE};font-size:14px;color:${MUTED};">Grooming services</td></tr>`;

  const meta = [
    ["Invoice", input.invoiceNumber],
    ["Issued", input.issuedOn],
    input.serviceOn ? ["Groomed", input.serviceOn] : null,
    !paidInFull && input.dueOn ? ["Due", input.dueOn] : null,
  ].filter(Boolean) as [string, string][];

  const footerBits = [
    input.salon.abn ? `ABN ${input.salon.abn}` : null,
    input.salon.address,
    input.salon.phone,
    input.salon.email,
  ].filter((b): b is string => Boolean(b && String(b).trim()));

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f6f4fa;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">
  ${escapeHtml(paidInFull ? `Paid in full — thank you. ${formatMoney(total)}` : `${formatMoney(amountDue)} due`)}
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4fa;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif;">

      <tr><td style="background:${primary};padding:20px 24px;">
        <div style="font-size:17px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">${escapeHtml(salonName)}</div>
        <div style="font-size:12px;color:#ffffff;opacity:.85;padding-top:2px;letter-spacing:.08em;">TAX INVOICE</div>
      </td></tr>

      <tr><td style="padding:24px 24px 8px;">
        <p style="margin:0 0 14px;font-size:15px;color:${INK};">${greeting}</p>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.55;color:${MUTED};">
          ${paidInFull
            ? "Thanks very much — here is your receipt."
            : "Here is your invoice. Thank you for bringing your dog to us."}
        </p>
        ${statusPill}
      </td></tr>

      <tr><td style="padding:14px 24px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${accent};border-radius:10px;">
          <tr><td style="padding:12px 14px;">
            ${meta.map(([k, v]) => `
              <div style="font-size:12px;color:${INK};padding:2px 0;">
                <span style="opacity:.6;">${escapeHtml(k)}</span>
                &nbsp;<strong style="font-weight:600;">${escapeHtml(v)}</strong>
              </div>`).join("")}
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:18px 24px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <th align="left" style="padding:0 0 6px;font-size:11px;letter-spacing:.06em;color:${MUTED};font-weight:600;border-bottom:2px solid ${HAIRLINE};">DESCRIPTION</th>
            <th align="center" style="padding:0 8px 6px;font-size:11px;letter-spacing:.06em;color:${MUTED};font-weight:600;border-bottom:2px solid ${HAIRLINE};">QTY</th>
            <th align="right" style="padding:0 0 6px;font-size:11px;letter-spacing:.06em;color:${MUTED};font-weight:600;border-bottom:2px solid ${HAIRLINE};">AMOUNT</th>
          </tr>
          ${lineRows}
        </table>
      </td></tr>

      <tr><td style="padding:14px 24px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${totalRow("Subtotal (ex GST)", formatMoney(exGst), MUTED)}
          ${totalRow("GST", formatMoney(gst), MUTED)}
          ${totalRow("Total", formatMoney(total), INK, true)}
          ${paid > 0 ? totalRow("Paid", `&minus;${formatMoney(paid)}`, MUTED) : ""}
          ${!paidInFull ? totalRow("Amount due", formatMoney(amountDue), INK, true) : ""}
        </table>
        <p style="margin:12px 0 0;font-size:11px;color:${MUTED};">All prices include GST.</p>
      </td></tr>

      <tr><td style="padding:22px 24px 24px;">
        <div style="border-top:1px solid ${HAIRLINE};padding-top:14px;font-size:11px;line-height:1.7;color:${MUTED};">
          <strong style="color:${INK};font-weight:600;">${escapeHtml(salonName)}</strong><br>
          ${footerBits.map((b) => escapeHtml(String(b))).join("<br>")}
        </div>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

  return { subject, html, amountDue, paidInFull };
}

function pill(label: string, fg: string, bg: string): string {
  return `<span style="display:inline-block;background:${bg};color:${fg};font-size:12px;font-weight:700;letter-spacing:.05em;padding:6px 12px;border-radius:999px;">${escapeHtml(label)}</span>`;
}

function totalRow(label: string, value: string, colour: string, strong = false): string {
  const weight = strong ? "700" : "400";
  const size = strong ? "15px" : "13px";
  return `
    <tr>
      <td style="padding:3px 0;font-size:${size};font-weight:${weight};color:${colour};">${escapeHtml(label)}</td>
      <td align="right" style="padding:3px 0;font-size:${size};font-weight:${weight};color:${colour};white-space:nowrap;">${value}</td>
    </tr>`;
}
