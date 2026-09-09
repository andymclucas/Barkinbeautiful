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
import { appointments, clients, smsLogs, pets, staff } from "../../drizzle/schema";
import { and, asc, desc, eq, gt, gte, lte, inArray, isNotNull } from "drizzle-orm";
import { classifyInboundReply, normaliseAustralianMobile, phoneMatchesInboundNumber } from "../inboundSms";
import Stripe from "stripe";
import { processStripeEvent } from "../stripePayments";
import { appEvents, emitNewMessage } from "../eventBus";
import { sdk } from "./sdk";

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
      emitNewMessage(1);
    }
    res.set("Content-Type", "text/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  });

  // Server-Sent Events: pushes real-time notifications (e.g. a new inbound
  // SMS just arrived) to connected browser tabs, so the notification bell
  // updates instantly instead of waiting for the next poll.
  app.get("/api/events", async (req, res) => {
    try {
      await sdk.authenticateRequest(req);
    } catch {
      res.sendStatus(401);
      return;
    }

    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    res.flushHeaders?.();

    const send = (event: unknown) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    send({ type: "connected" });

    const onAppEvent = (event: unknown) => send(event);
    appEvents.on("app-event", onAppEvent);

    // Keep the connection alive through proxies/load balancers that would
    // otherwise time out an idle HTTP connection.
    const heartbeat = setInterval(() => res.write(`: heartbeat\n\n`), 25000);

    req.on("close", () => {
      clearInterval(heartbeat);
      appEvents.off("app-event", onAppEvent);
    });
  });

  // Full report export (CSV): financial summary, workflow timing summary,
  // and a per-appointment detail table for the selected date range.
  app.get("/api/reports/export", async (req, res) => {
    try {
      await sdk.authenticateRequest(req);
    } catch {
      res.sendStatus(401);
      return;
    }

    const db = await getDb();
    if (!db) {
      res.sendStatus(503);
      return;
    }

    const tenantId = Number(req.query.tenantId ?? 1);
    const dateFrom = new Date(String(req.query.dateFrom ?? ""));
    const dateTo = new Date(String(req.query.dateTo ?? ""));
    if (Number.isNaN(dateFrom.getTime()) || Number.isNaN(dateTo.getTime())) {
      res.status(400).send("Invalid dateFrom/dateTo");
      return;
    }

    const csvEscape = (value: unknown) => {
      const s = value === null || value === undefined ? "" : String(value);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const toRow = (cells: unknown[]) => cells.map(csvEscape).join(",");
    const minutesBetween = (from: number | null, to: number | null) =>
      from && to && to > from ? Math.round(((to - from) / 60000) * 10) / 10 : "";

    const rows = await db.select({
      id: appointments.id,
      scheduledStart: appointments.scheduledStart,
      serviceType: appointments.serviceType,
      price: appointments.price,
      membershipId: appointments.membershipId,
      clientFirstName: clients.firstName,
      clientLastName: clients.lastName,
      petName: pets.name,
      staffName: staff.name,
      checkedInAt: appointments.checkedInAt,
      bathingStartedAt: appointments.bathingStartedAt,
      bathingCompletedAt: appointments.bathingCompletedAt,
      dryingStartedAt: appointments.dryingStartedAt,
      dryingCompletedAt: appointments.dryingCompletedAt,
      groomingStartedAt: appointments.groomingStartedAt,
      groomingCompletedAt: appointments.groomingCompletedAt,
      readyAt: appointments.readyAt,
      pickedUpAt: appointments.pickedUpAt,
      completedAt: appointments.completedAt,
    }).from(appointments)
      .leftJoin(clients, eq(appointments.clientId, clients.id))
      .leftJoin(pets, eq(appointments.petId, pets.id))
      .leftJoin(staff, eq(appointments.staffId, staff.id))
      .where(and(
        eq(appointments.tenantId, tenantId),
        eq(appointments.workflowState, "complete"),
        gte(appointments.scheduledStart, dateFrom),
        lte(appointments.scheduledStart, dateTo),
      ))
      .orderBy(appointments.scheduledStart);

    // ── Financial summary ──
    const revenueByService = new Map<string, { count: number; revenue: number }>();
    let totalRevenue = 0;
    let membershipRevenue = 0;
    for (const r of rows) {
      const price = parseFloat(r.price ?? "0");
      totalRevenue += price;
      if (r.membershipId) membershipRevenue += price;
      const key = r.serviceType ?? "other";
      const existing = revenueByService.get(key) ?? { count: 0, revenue: 0 };
      existing.count += 1;
      existing.revenue += price;
      revenueByService.set(key, existing);
    }

    // ── Workflow timing summary ──
    const stageDefs: { label: string; from: keyof typeof rows[0]; to: keyof typeof rows[0] }[] = [
      { label: "Check-in to bathing start", from: "checkedInAt", to: "bathingStartedAt" },
      { label: "Bathing", from: "bathingStartedAt", to: "bathingCompletedAt" },
      { label: "Drying", from: "dryingStartedAt", to: "dryingCompletedAt" },
      { label: "Grooming", from: "groomingStartedAt", to: "groomingCompletedAt" },
      { label: "Ready to picked up", from: "readyAt", to: "pickedUpAt" },
      { label: "Total (check-in to complete)", from: "checkedInAt", to: "completedAt" },
    ];
    const stageAverages = stageDefs.map(def => {
      const durations: number[] = [];
      for (const r of rows) {
        const from = r[def.from] as number | null;
        const to = r[def.to] as number | null;
        if (from && to && to > from) durations.push((to - from) / 60000);
      }
      const avg = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null;
      return { label: def.label, avgMinutes: avg === null ? "" : Math.round(avg * 10) / 10, sampleSize: durations.length };
    });

    const lines: string[] = [];
    lines.push(toRow(["Barkin' Beautiful \u2014 Full Report"]));
    lines.push(toRow([`Period: ${req.query.dateFrom} to ${req.query.dateTo}`]));
    lines.push("");
    lines.push(toRow(["FINANCIAL SUMMARY"]));
    lines.push(toRow(["Total revenue", totalRevenue.toFixed(2)]));
    lines.push(toRow(["Membership revenue", membershipRevenue.toFixed(2)]));
    lines.push(toRow(["One-off revenue", (totalRevenue - membershipRevenue).toFixed(2)]));
    lines.push(toRow(["Completed appointments", rows.length]));
    lines.push("");
    lines.push(toRow(["Service Type", "Count", "Revenue"]));
    for (const [type, v] of Array.from(revenueByService.entries()).sort((a, b) => b[1].revenue - a[1].revenue)) {
      lines.push(toRow([type, v.count, v.revenue.toFixed(2)]));
    }
    lines.push("");
    lines.push(toRow(["WORKFLOW TIMING SUMMARY (average minutes)"]));
    lines.push(toRow(["Stage", "Avg Minutes", "Sample Size"]));
    for (const s of stageAverages) lines.push(toRow([s.label, s.avgMinutes, s.sampleSize]));
    lines.push("");
    lines.push(toRow(["APPOINTMENT DETAIL"]));
    lines.push(toRow([
      "Date", "Client", "Pet", "Staff", "Service Type", "Price", "Membership Appointment",
      "Wait (Check-in\u2192Bath) min", "Bathing min", "Drying min", "Grooming min", "Ready\u2192Pickup min", "Total min",
    ]));
    for (const r of rows) {
      lines.push(toRow([
        new Date(r.scheduledStart).toISOString(),
        [r.clientFirstName, r.clientLastName].filter(Boolean).join(" "),
        r.petName ?? "",
        r.staffName ?? "",
        r.serviceType ?? "",
        parseFloat(r.price ?? "0").toFixed(2),
        r.membershipId ? "Yes" : "No",
        minutesBetween(r.checkedInAt, r.bathingStartedAt),
        minutesBetween(r.bathingStartedAt, r.bathingCompletedAt),
        minutesBetween(r.dryingStartedAt, r.dryingCompletedAt),
        minutesBetween(r.groomingStartedAt, r.groomingCompletedAt),
        minutesBetween(r.readyAt, r.pickedUpAt),
        minutesBetween(r.checkedInAt, r.completedAt),
      ]));
    }

    const csv = lines.join("\n");
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="barkin-beautiful-report-${req.query.dateFrom}-to-${req.query.dateTo}.csv"`,
    });
    res.send(csv);
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
