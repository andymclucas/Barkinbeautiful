import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { registerUploadRoutes } from "../uploadRoutes";
import { paymentRetryHandler, appointmentReminderHandler } from "../scheduledHandlers";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getDb } from "../db";
import { appointments, clients, smsLogs } from "../../drizzle/schema";
import { and, asc, desc, eq, gt, inArray, isNotNull } from "drizzle-orm";
import { classifyInboundReply, normaliseAustralianMobile, phoneMatchesInboundNumber } from "../inboundSms";
import Stripe from "stripe";
import { processStripeEvent } from "../stripePayments";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Stripe requires the exact raw body for signature verification. This must be
  // registered before the global JSON parser.
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
    const key = process.env.STRIPE_SECRET_KEY ?? "";
    if (!secret || !key) return res.status(503).json({ error: "Stripe webhook is not configured" });
    try {
      const stripe = new Stripe(key, { typescript: true });
      const signature = req.headers["stripe-signature"];
      if (typeof signature !== "string") return res.status(400).send("Missing Stripe signature");
      const event = stripe.webhooks.constructEvent(req.body, signature, secret);
      if (event.id.startsWith("evt_test_")) return res.json({ verified: true });
      await processStripeEvent(event);
      return res.json({ received: true });
    } catch (error) {
      console.error("[Stripe] Webhook verification failed", error);
      return res.status(400).send("Webhook verification failed");
    }
  });
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // Raw body parser for image uploads (must come before tRPC)
  app.use("/api/upload", express.raw({ type: "image/*", limit: "20mb" }));
  registerUploadRoutes(app as any);
  // Scheduled / Heartbeat handlers
  app.post("/api/scheduled/payment-retry", paymentRetryHandler);
  app.post("/api/scheduled/appointment-reminders", appointmentReminderHandler);

  // Twilio webhook for SMS status callbacks
  app.post("/api/twilio/status", express.urlencoded({ extended: false }), async (req, res) => {
    const { MessageSid, MessageStatus, To } = req.body;
    console.log(`[Twilio] SMS ${MessageSid} to ${To}: ${MessageStatus}`);
    const mappedStatus = MessageStatus === "delivered" ? "delivered" :
      ["failed", "undelivered"].includes(MessageStatus) ? "failed" : "sent";
    const db = await getDb();
    if (db && MessageSid) {
      await db.update(smsLogs).set({ status: mappedStatus }).where(eq(smsLogs.twilioSid, MessageSid));
    }
    res.sendStatus(200);
  });

  // Twilio webhook for inbound SMS (reply handling)
  app.post("/api/twilio/inbound", express.urlencoded({ extended: false }), async (req, res) => {
    const { From, Body, MessageSid } = req.body;
    console.log(`[Twilio] Inbound SMS from ${From}: ${Body}`);
    const db = await getDb();
    const intent = classifyInboundReply(String(Body ?? ""));
    let clientId: number | undefined;
    let appointmentId: number | undefined;

    if (db && From) {
      const inboundNumber = normaliseAustralianMobile(From);
      const numberVariants = Array.from(new Set([
        From,
        inboundNumber,
        inboundNumber.replace(/^\+61/, "0"),
        inboundNumber.replace(/^\+/, ""),
      ]));
      const clientCandidates = await db.select({ id: clients.id, phone: clients.phone })
        .from(clients)
        .where(and(eq(clients.tenantId, 1), inArray(clients.phone, numberVariants)));
      const client = clientCandidates.find(candidate => phoneMatchesInboundNumber(candidate.phone, inboundNumber));
      clientId = client?.id;

      // Link every reply to the latest future reminder where the match is clear.
      // No inbound reply can change an appointment without an explicit staff review.
      if (clientId) {
        const [reminder] = await db.select({ appointmentId: smsLogs.appointmentId })
          .from(smsLogs)
          .where(and(
            eq(smsLogs.clientId, clientId),
            eq(smsLogs.type, "reminder"),
            eq(smsLogs.direction, "outbound"),
            isNotNull(smsLogs.appointmentId)
          ))
          .orderBy(desc(smsLogs.sentAt))
          .limit(1);
        if (reminder?.appointmentId) {
          const [appointment] = await db.select({ id: appointments.id })
            .from(appointments)
            .where(and(
              eq(appointments.id, reminder.appointmentId),
              eq(appointments.clientId, clientId),
              gt(appointments.scheduledStart, new Date())
            ))
            .orderBy(asc(appointments.scheduledStart))
            .limit(1);
          if (appointment) appointmentId = appointment.id;
        }
      }

      await db.insert(smsLogs).values({
        tenantId: 1,
        clientId,
        appointmentId,
        toNumber: inboundNumber,
        body: String(Body ?? ""),
        twilioSid: MessageSid,
        status: "received",
        type: "inbound",
        direction: "inbound",
        replyIntent: intent,
      });
    }
    res.set("Content-Type", "text/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
