/**
 * Resend's delivery events — opened, clicked, bounced — written onto the
 * campaign send they belong to (Andy, 12/11/2026: opens and clicks in the
 * email campaigns section).
 *
 * Resend posts to /api/resend/webhook, signed with the webhook's secret
 * (RESEND_WEBHOOK_SECRET on Render). Unsigned or wrongly signed requests
 * are refused before anything is read.
 *
 * Each column is written with a guard (`opened_at IS NULL`, ...) and the
 * campaign total only goes up when that guarded write changed a row. So a
 * repeated event, or two arriving at once, counts once — the decision in
 * shared/emailEventEffect.ts says WHAT to try, the guards make it safe.
 *
 * Only campaign sends are tracked: they are the only emails that keep
 * Resend's message id. An event for any other email finds no row and is
 * acknowledged and ignored.
 */
import type { Express, Request, Response } from "express";
import express from "express";
import { Resend } from "resend";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { getDb } from "./db";
import { emailCampaignSends, emailCampaigns } from "../drizzle/schema";
import { emailEventEffect } from "../shared/emailEventEffect";

type ResendEvent = { type?: string; created_at?: string; data?: { email_id?: string } };

const affected = (result: unknown) => Number((result as any)?.[0]?.affectedRows ?? 0);

export async function applyResendEvent(event: ResendEvent): Promise<{ matched: boolean }> {
  const messageId = event.data?.email_id;
  const type = event.type ?? "";
  if (!messageId || !type) return { matched: false };
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const [send] = await db.select({
    id: emailCampaignSends.id,
    campaignId: emailCampaignSends.campaignId,
    openedAt: emailCampaignSends.openedAt,
    clickedAt: emailCampaignSends.clickedAt,
    status: emailCampaignSends.status,
  }).from(emailCampaignSends).where(eq(emailCampaignSends.resendMessageId, messageId)).limit(1);
  if (!send) return { matched: false };

  const parsed = event.created_at ? new Date(event.created_at) : new Date();
  const at = Number.isFinite(parsed.getTime()) ? parsed : new Date();
  const effect = emailEventEffect(send, type, at);

  let opened = 0;
  let clicked = 0;
  if (effect.patch.clickedAt) {
    const r = await db.update(emailCampaignSends).set({ clickedAt: effect.patch.clickedAt })
      .where(and(eq(emailCampaignSends.id, send.id), isNull(emailCampaignSends.clickedAt)));
    clicked = affected(r);
  }
  if (effect.patch.openedAt) {
    const r = await db.update(emailCampaignSends).set({ openedAt: effect.patch.openedAt })
      .where(and(eq(emailCampaignSends.id, send.id), isNull(emailCampaignSends.openedAt)));
    opened = affected(r);
  }
  if (effect.patch.status === "bounced") {
    await db.update(emailCampaignSends).set({ status: "bounced" })
      .where(and(eq(emailCampaignSends.id, send.id), ne(emailCampaignSends.status, "bounced")));
  }
  if (opened || clicked) {
    await db.update(emailCampaigns).set({
      ...(opened ? { totalOpened: sql`COALESCE(${emailCampaigns.totalOpened}, 0) + 1` } : {}),
      ...(clicked ? { totalClicked: sql`COALESCE(${emailCampaigns.totalClicked}, 0) + 1` } : {}),
    }).where(eq(emailCampaigns.id, send.campaignId));
  }
  return { matched: true };
}

/** Registered before the JSON body parser: the signature covers the raw bytes. */
export function registerResendWebhook(app: Express) {
  app.post("/api/resend/webhook", express.raw({ type: "application/json" }), async (req: Request, res: Response) => {
    const secret = process.env.RESEND_WEBHOOK_SECRET ?? "";
    const apiKey = process.env.RESEND_API_KEY ?? "";
    if (!secret || !apiKey) return res.status(503).json({ error: "Resend webhook is not configured" });
    const payload = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
    let event: ResendEvent;
    try {
      const header = (name: string) => {
        const value = req.headers[name];
        return typeof value === "string" ? value : "";
      };
      const headers = { id: header("svix-id"), timestamp: header("svix-timestamp"), signature: header("svix-signature") };
      if (!headers.id || !headers.timestamp || !headers.signature) throw new Error("Missing webhook signature headers");
      event = new Resend(apiKey).webhooks.verify({ payload, headers, webhookSecret: secret }) as ResendEvent;
    } catch (error) {
      console.error("[Resend] Webhook verification failed", error);
      return res.status(400).send("Webhook verification failed");
    }
    try {
      await applyResendEvent(event);
      return res.json({ received: true });
    } catch (error) {
      // 500 so Resend retries: the guarded writes make a retry harmless.
      console.error("[Resend] Could not record event", event.type, error);
      return res.status(500).json({ error: "Could not record event" });
    }
  });
  app.get("/api/resend/webhook", (_req: Request, res: Response) => {
    res.status(405).type("text/plain").send(
      "This is the Barkin' Beautiful Resend webhook endpoint and it is live.\n"
      + "It accepts signed POSTs from Resend only.\n",
    );
  });
}
