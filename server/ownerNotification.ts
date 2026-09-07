/**
 * Sends an alert to the business owner (e.g. payment failures, campaign
 * sends) by email via Resend, instead of Manus's push-notification service.
 *
 * Set OWNER_EMAIL in the environment to the address that should receive
 * these alerts. If it's not set, or RESEND_API_KEY isn't configured, this
 * silently no-ops — same fire-and-forget behaviour callers already expect
 * (they wrap calls in `.catch(() => {})`).
 */
import { sendEmail } from "./email";

export type NotificationPayload = {
  title: string;
  content: string;
};

export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  const ownerEmail = process.env.OWNER_EMAIL;

  if (!ownerEmail) {
    console.warn("[OwnerNotification] OWNER_EMAIL not set — alert not sent:", payload.title);
    return false;
  }

  return sendEmail({
    to: ownerEmail,
    subject: payload.title,
    html: `<p>${payload.content.replace(/\n/g, "<br/>")}</p>`,
  });
}
