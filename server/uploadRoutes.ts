import { Router } from "express";
import { storageGet, storagePut } from "./storage";
import { sdk } from "./_core/sdk";
import { buildPetPhotoStorageKey } from "./petPhotoStorage";
import { getDb } from "./db";
import { appointments, staff } from "../drizzle/schema";
import { and, eq, or } from "drizzle-orm";

export function registerUploadRoutes(app: Router) {
  // POST /api/upload/style-note-photo
  // Accepts raw image bytes with Content-Type header, returns { url, key }
  app.post(
    "/api/upload/style-note-photo",
    async (req, res) => {
      try {
        // Auth check via session cookie (sdk parses cookies from raw header)
        let user;
        try {
          user = await sdk.authenticateRequest(req as any);
        } catch {
          user = null;
        }
        if (!user) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }

        const contentType = req.headers["content-type"] ?? "image/jpeg";
        if (!contentType.startsWith("image/")) {
          res.status(400).json({ error: "Only image uploads are allowed" });
          return;
        }

        // Body is raw bytes (express.raw middleware applied below)
        const buffer: Buffer = req.body;
        if (!buffer || buffer.length === 0) {
          res.status(400).json({ error: "Empty file" });
          return;
        }
        if (buffer.length > 10 * 1024 * 1024) {
          res.status(413).json({ error: "File too large (max 10 MB)" });
          return;
        }

        const ext = contentType.split("/")[1]?.split(";")[0] ?? "jpg";
        const key = `style-notes/photos/photo.${ext}`;
        const { url, key: finalKey } = await storagePut(key, buffer, contentType);

        res.json({ url, key: finalKey });
      } catch (err: any) {
        console.error("[upload/style-note-photo]", err);
        res.status(500).json({ error: err.message ?? "Upload failed" });
      }
    }
  );

  // POST /api/upload/grooming-report-photo
  app.post(
    "/api/upload/grooming-report-photo",
    async (req, res) => {
      try {
        let user;
        try { user = await sdk.authenticateRequest(req as any); } catch { user = null; }
        if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
        const contentType = req.headers["content-type"] ?? "image/jpeg";
        if (!contentType.startsWith("image/")) { res.status(400).json({ error: "Only image uploads are allowed" }); return; }
        const buffer: Buffer = req.body;
        if (!buffer || buffer.length === 0) { res.status(400).json({ error: "Empty file" }); return; }
        if (buffer.length > 20 * 1024 * 1024) { res.status(413).json({ error: "File too large (max 20 MB)" }); return; }
        const ext = contentType.split("/")[1]?.split(";")[0] ?? "jpg";
        const key = `grooming-reports/photos/${Date.now()}-photo.${ext}`;
        const { url, key: finalKey } = await storagePut(key, buffer, contentType);
        res.json({ url, key: finalKey });
      } catch (err: any) {
        console.error("[upload/grooming-report-photo]", err);
        res.status(500).json({ error: err.message ?? "Upload failed" });
      }
    }
  );

  // Serve grooming-card images through a fresh authenticated storage redirect so
  // preview iframes, printing and later report views do not rely on stale URLs.
  app.get("/api/grooming-report-photo", async (req, res) => {
    try {
      let user;
      try { user = await sdk.authenticateRequest(req as any); } catch { user = null; }
      if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
      const key = typeof req.query.key === "string" ? req.query.key : "";
      if (!key.startsWith("grooming-reports/")) { res.status(400).json({ error: "Invalid report photo" }); return; }
      const { url } = await storageGet(key);
      res.redirect(url);
    } catch (err: any) {
      console.error("[grooming-report-photo]", err);
      res.status(404).json({ error: "Report photo unavailable" });
    }
  });

  // POST /api/upload/staff-grooming-card-photo?appointmentId=123
  // Approved staff may upload only within their own salon tenant.
  app.post("/api/upload/staff-grooming-card-photo", async (req, res) => {
    try {
      let user;
      try { user = await sdk.authenticateRequest(req as any); } catch { user = null; }
      if (!user || user.role !== "staff") { res.status(403).json({ error: "Approved staff access is required" }); return; }
      const appointmentId = Number(req.query.appointmentId);
      if (!Number.isInteger(appointmentId) || appointmentId <= 0) { res.status(400).json({ error: "A valid appointment is required" }); return; }
      const db = await getDb();
      if (!db) { res.status(503).json({ error: "Database unavailable" }); return; }
      const [portalStaff] = await db.select({ id: staff.id, tenantId: staff.tenantId, portalStatus: staff.portalStatus })
        .from(staff).where(eq(staff.userId, user.id)).limit(1);
      if (!portalStaff || portalStaff.portalStatus !== "approved") { res.status(403).json({ error: "Staff access is awaiting approval" }); return; }
      const [appointment] = await db.select({ id: appointments.id }).from(appointments).where(and(
        eq(appointments.id, appointmentId),
        eq(appointments.tenantId, portalStaff.tenantId),
      )).limit(1);
      if (!appointment) { res.status(403).json({ error: "This appointment is not available to your salon staff profile" }); return; }
      const contentType = req.headers["content-type"] ?? "image/jpeg";
      if (!contentType.startsWith("image/")) { res.status(400).json({ error: "Only image uploads are allowed" }); return; }
      const buffer: Buffer = req.body;
      if (!buffer?.length) { res.status(400).json({ error: "Empty file" }); return; }
      if (buffer.length > 20 * 1024 * 1024) { res.status(413).json({ error: "File too large (max 20 MB)" }); return; }
      const ext = contentType.split("/")[1]?.split(";")[0] ?? "jpg";
      const { url, key } = await storagePut(`grooming-reports/staff/${appointmentId}/${Date.now()}-photo.${ext}`, buffer, contentType);
      res.json({ url, key });
    } catch (err: any) {
      console.error("[upload/staff-grooming-card-photo]", err);
      res.status(500).json({ error: err.message ?? "Upload failed" });
    }
  });

  // POST /api/upload/pet-groom-photo
  // The authenticated staff member uploads raw image bytes; photo metadata is
  // then associated with a pet through the protected tRPC procedure.
  app.post(
    "/api/upload/pet-groom-photo",
    async (req, res) => {
      try {
        let user;
        try { user = await sdk.authenticateRequest(req as any); } catch { user = null; }
        if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
        const contentType = req.headers["content-type"] ?? "image/jpeg";
        if (!contentType.startsWith("image/")) { res.status(400).json({ error: "Only image uploads are allowed" }); return; }
        const buffer: Buffer = req.body;
        if (!buffer || buffer.length === 0) { res.status(400).json({ error: "Empty file" }); return; }
        if (buffer.length > 20 * 1024 * 1024) { res.status(413).json({ error: "File too large (max 20 MB)" }); return; }
        const key = buildPetPhotoStorageKey(contentType, Date.now(), Math.random().toString(36).slice(2, 10));
        const { url, key: finalKey } = await storagePut(key, buffer, contentType);
        res.json({ url, key: finalKey });
      } catch (err: any) {
        console.error("[upload/pet-groom-photo]", err);
        res.status(500).json({ error: err.message ?? "Upload failed" });
      }
    }
  );

  // POST /api/upload/salon-logo — authenticated branding asset, max 5 MB.
  app.post("/api/upload/salon-logo", async (req, res) => {
    try {
      let user;
      try { user = await sdk.authenticateRequest(req as any); } catch { user = null; }
      if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
      const contentType = req.headers["content-type"] ?? "image/png";
      if (!contentType.startsWith("image/")) { res.status(400).json({ error: "Only image uploads are allowed" }); return; }
      const buffer: Buffer = req.body;
      if (!buffer?.length) { res.status(400).json({ error: "Empty file" }); return; }
      if (buffer.length > 5 * 1024 * 1024) { res.status(413).json({ error: "File too large (max 5 MB)" }); return; }
      const ext = contentType.split("/")[1]?.split(";")[0] ?? "png";
      const { url, key } = await storagePut(`salon-branding/logos/${Date.now()}-logo.${ext}`, buffer, contentType);
      res.json({ url, key });
    } catch (err: any) {
      console.error("[upload/salon-logo]", err);
      res.status(500).json({ error: err.message ?? "Upload failed" });
    }
  });
}
