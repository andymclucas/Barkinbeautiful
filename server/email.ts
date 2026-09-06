/**
 * Transactional email helper using Resend.
 * Set RESEND_API_KEY in environment variables to enable sending.
 * Set RESEND_FROM_EMAIL to the verified sender address (e.g. "noreply@barkinbeautiful.com.au").
 */
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "noreply@barkinbeautiful.com.au";

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  if (!resend) {
    console.warn("[Email] RESEND_API_KEY not set — email not sent:", subject);
    return false;
  }
  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });
    if (error) {
      console.error("[Email] Resend error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Email] Failed to send email:", err);
    return false;
  }
}

/** Email template: admin alert for first failed payment */
export function buildAdminFailedPaymentEmail({
  clientName,
  petName,
  membershipName,
  pricePerCycle,
  failedPaymentCount,
  retryDate,
}: {
  clientName: string;
  petName: string;
  membershipName: string;
  pricePerCycle: string;
  failedPaymentCount: number;
  retryDate: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; color: #1a1a1a; background: #f9f9f9; margin: 0; padding: 0; }
  .container { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb; }
  h2 { color: #dc2626; margin-top: 0; }
  .detail { background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 16px; margin: 16px 0; }
  .detail table { width: 100%; border-collapse: collapse; }
  .detail td { padding: 4px 0; font-size: 14px; }
  .detail td:first-child { color: #6b7280; width: 160px; }
  .footer { margin-top: 24px; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 16px; }
</style></head>
<body>
<div class="container">
  <h2>⚠️ Membership Payment Failed</h2>
  <p>A membership payment has failed and requires your attention.</p>
  <div class="detail">
    <table>
      <tr><td>Client</td><td><strong>${clientName}</strong></td></tr>
      <tr><td>Pet</td><td>${petName}</td></tr>
      <tr><td>Membership</td><td>${membershipName}</td></tr>
      <tr><td>Amount</td><td>$${pricePerCycle}/week</td></tr>
      <tr><td>Failure #</td><td>${failedPaymentCount}</td></tr>
      <tr><td>Retry scheduled</td><td>${retryDate}</td></tr>
    </table>
  </div>
  <p>The system will automatically retry on the next business day (<strong>${retryDate}</strong>).</p>
  <p>If this is the <strong>second failure</strong>, the client has been notified by email and their bookings have been suspended.</p>
  <div class="footer">Groomigo — Barkin' Beautiful Grooming Studio</div>
</div>
</body>
</html>`;
}

/** Email template: client notification after 2 failed payments */
export function buildClientFailedPaymentEmail({
  clientFirstName,
  petName,
  membershipName,
  pricePerCycle,
  businessName,
  businessPhone,
  businessEmail,
}: {
  clientFirstName: string;
  petName: string;
  membershipName: string;
  pricePerCycle: string;
  businessName: string;
  businessPhone?: string | null;
  businessEmail?: string | null;
}): string {
  const contactLine = [businessPhone, businessEmail].filter(Boolean).join(" or ");
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: Arial, sans-serif; color: #1a1a1a; background: #f9f9f9; margin: 0; padding: 0; }
  .container { max-width: 560px; margin: 32px auto; background: #fff; border-radius: 8px; padding: 32px; border: 1px solid #e5e7eb; }
  h2 { color: #dc2626; margin-top: 0; }
  .detail { background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 16px; margin: 16px 0; }
  .detail table { width: 100%; border-collapse: collapse; }
  .detail td { padding: 4px 0; font-size: 14px; }
  .detail td:first-child { color: #6b7280; width: 140px; }
  .footer { margin-top: 24px; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 16px; }
</style></head>
<body>
<div class="container">
  <h2>Important: Membership Payment Issue</h2>
  <p>Hi ${clientFirstName},</p>
  <p>We've been unable to process your membership payment after two attempts. Your membership has been temporarily suspended.</p>
  <div class="detail">
    <table>
      <tr><td>Pet</td><td><strong>${petName}</strong></td></tr>
      <tr><td>Membership</td><td>${membershipName}</td></tr>
      <tr><td>Weekly amount</td><td>$${pricePerCycle}</td></tr>
    </table>
  </div>
  <p>To reinstate your membership and resume bookings, please update your payment details or contact us as soon as possible.</p>
  ${contactLine ? `<p><strong>Contact us:</strong> ${contactLine}</p>` : ""}
  <p>We value your membership and look forward to continuing to care for ${petName}.</p>
  <p>Warm regards,<br/><strong>${businessName}</strong></p>
  <div class="footer">This is an automated message from ${businessName}. Please do not reply to this email.</div>
</div>
</body>
</html>`;
}
