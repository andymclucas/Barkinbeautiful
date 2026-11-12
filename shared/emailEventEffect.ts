/**
 * What one Resend event does to one campaign send.
 *
 * Andy, 12/11/2026: "Let's build in reporting for email clicks and opens in
 * the email campaigns section." The columns were there from the start —
 * opened_at, clicked_at, total_opened, total_clicked — and the stats dialog
 * already printed an open rate. Nothing ever wrote to them, so every
 * campaign read 0% opened.
 *
 * Counted once per client, not once per event. Resend reports every open
 * (a client re-reading the email, or a mail app pre-fetching images), and
 * the number the salon wants is how many PEOPLE opened, not how many times.
 *
 * A click counts as an open as well. Opens are measured with a tracking
 * image, which Apple Mail's privacy protection and most corporate mail
 * block or fake; a click proves the email was read. Without this a
 * campaign can show more clicks than opens, which reads as a bug.
 */

export type CampaignSendState = {
  openedAt: Date | null;
  clickedAt: Date | null;
  status: "pending" | "sent" | "failed" | "bounced";
};

export type EmailEventEffect = {
  /** Columns to write on the send row. Empty when nothing changes. */
  patch: Partial<Pick<CampaignSendState, "openedAt" | "clickedAt" | "status">>;
  /** How much each campaign total goes up by: 0 or 1. */
  opened: 0 | 1;
  clicked: 0 | 1;
};

const NOTHING: EmailEventEffect = { patch: {}, opened: 0, clicked: 0 };

export function emailEventEffect(
  send: CampaignSendState,
  eventType: string,
  at: Date,
): EmailEventEffect {
  switch (eventType) {
    case "email.opened":
      if (send.openedAt) return NOTHING;
      return { patch: { openedAt: at }, opened: 1, clicked: 0 };

    case "email.clicked": {
      if (send.clickedAt) return NOTHING;
      const opensToo = !send.openedAt;
      return {
        patch: { clickedAt: at, ...(opensToo ? { openedAt: at } : {}) },
        opened: opensToo ? 1 : 0,
        clicked: 1,
      };
    }

    case "email.bounced":
      // A bounce after "sent" is the truth arriving late: it never landed.
      return send.status === "bounced" ? NOTHING : { patch: { status: "bounced" }, opened: 0, clicked: 0 };

    default:
      return NOTHING;
  }
}

/** "42%" of the emails that went, or "—" before anything has. */
export function rateOf(count: number | null | undefined, sent: number | null | undefined): string {
  const s = Number(sent ?? 0);
  if (!Number.isFinite(s) || s <= 0) return "—";
  return `${Math.round((Number(count ?? 0) / s) * 100)}%`;
}
