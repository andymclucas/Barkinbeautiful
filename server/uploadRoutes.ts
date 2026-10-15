import { Router } from "express";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import { appointments, staff, pets, petPhotos, uploadedImages, groomingReports, clientPhotoRequests, clientPhotos } from "../drizzle/schema";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { hashClientPhotoToken, photoRequestState } from "@shared/clientPhotoRequest";
import { requireApprovedStaffTenant } from "./staffAccess";
import sharp from "sharp";

// TiDB rejects a single row/entry over ~6 MB (a TiKV-level limit, not
// something we can raise). A base64-encoded image is ~33% larger than its
// raw bytes, so storing an uncompressed high-resolution phone photo (often
// several MB already) blows straight through that. Resize and recompress
// every image before it's stored in uploaded_images or pet_photos, so the
// stored row always stays safely under the limit regardless of what the
// original upload looked like.
async function compressForStorage(buffer: Buffer, contentType: string): Promise<{ buffer: Buffer; contentType: string }> {
  // Already-small, non-photo images (icons, etc.) don't need reprocessing.
  if (buffer.length < 400 * 1024) return { buffer, contentType };
  try {
    let quality = 82;
    let maxDimension = 2000;
    for (let attempt = 0; attempt < 5; attempt++) {
      const out = await sharp(buffer, { failOn: "none" })
        .rotate() // apply EXIF orientation before dropping it, so photos don't end up sideways
        .resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      // Target well under the ~6 MB TiKV entry limit once base64-encoded
      // (base64 adds ~33%), leaving headroom for the rest of the row.
      if (out.length < 3.5 * 1024 * 1024) return { buffer: out, contentType: "image/jpeg" };
      quality -= 15;
      maxDimension = Math.round(maxDimension * 0.75);
    }
    // Last resort after repeated attempts: whatever the final pass produced.
    const out = await sharp(buffer, { failOn: "none" }).rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 50, mozjpeg: true }).toBuffer();
    return { buffer: out, contentType: "image/jpeg" };
  } catch (err) {
    console.error("[compressForStorage] falling back to original bytes:", err);
    return { buffer, contentType };
  }
}

// Logo-specific variant: preserves PNG (and its transparency) rather than
// always converting to JPEG, since a branding logo is very often a PNG with
// a transparent background that would otherwise get a black/white fill.
async function compressLogoForStorage(buffer: Buffer, contentType: string): Promise<{ buffer: Buffer; contentType: string }> {
  if (buffer.length < 400 * 1024) return { buffer, contentType };
  const isPng = contentType.includes("png");
  try {
    let maxDimension = 1600;
    for (let attempt = 0; attempt < 4; attempt++) {
      const pipeline = sharp(buffer, { failOn: "none" }).resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true });
      const out = isPng ? await pipeline.png({ compressionLevel: 9 }).toBuffer() : await pipeline.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
      if (out.length < 3.5 * 1024 * 1024) return { buffer: out, contentType: isPng ? "image/png" : "image/jpeg" };
      maxDimension = Math.round(maxDimension * 0.75);
    }
    return { buffer, contentType };
  } catch (err) {
    console.error("[compressLogoForStorage] falling back to original bytes:", err);
    return { buffer, contentType };
  }
}

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

        const db = await getDb();
        if (!db) { res.status(503).json({ error: "Database unavailable" }); return; }
        const compressed = await compressForStorage(buffer, String(contentType));
        const ext = compressed.contentType.split("/")[1]?.split(";")[0] ?? "jpg";
        const key = `style-notes/photos/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
        await db.insert(uploadedImages).values({
          storageKey: key,
          photoData: compressed.buffer.toString("base64"),
          photoContentType: compressed.contentType,
        });

        res.json({ url: `/api/style-note-photo?key=${encodeURIComponent(key)}`, key });
      } catch (err: any) {
        console.error("[upload/style-note-photo]", err);
        res.status(500).json({ error: err.message ?? "Upload failed" });
      }
    }
  );

  // Serves a style-note image stored in uploaded_images by its key.
  app.get("/api/style-note-photo", async (req, res) => {
    try {
      let user;
      try { user = await sdk.authenticateRequest(req as any); } catch { user = null; }
      if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
      const key = typeof req.query.key === "string" ? req.query.key : "";
      if (!key.startsWith("style-notes/")) { res.status(400).json({ error: "Invalid photo" }); return; }
      const db = await getDb();
      if (!db) { res.status(503).json({ error: "Database unavailable" }); return; }
      const [image] = await db.select({ photoData: uploadedImages.photoData, photoContentType: uploadedImages.photoContentType })
        .from(uploadedImages).where(eq(uploadedImages.storageKey, key)).limit(1);
      if (!image) { res.status(404).json({ error: "Photo unavailable" }); return; }
      res.set({ "Content-Type": image.photoContentType, "Cache-Control": "private, max-age=86400" });
      res.send(Buffer.from(image.photoData, "base64"));
    } catch (err: any) {
      console.error("[style-note-photo]", err);
      res.status(404).json({ error: "Photo unavailable" });
    }
  });

  // POST /api/upload/grooming-report-photo
  // Stores directly in the database (uploaded_images) rather than external
  // Forge storage, which isn't configured in this environment. Keeps the
  // same {url, key} response shape and GET /api/grooming-report-photo?key=
  // serving pattern the client already expects.
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
        const db = await getDb();
        if (!db) { res.status(503).json({ error: "Database unavailable" }); return; }
        const compressed = await compressForStorage(buffer, String(contentType));
        const ext = compressed.contentType.split("/")[1]?.split(";")[0] ?? "jpg";
        const key = `grooming-reports/photos/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
        await db.insert(uploadedImages).values({
          storageKey: key,
          photoData: compressed.buffer.toString("base64"),
          photoContentType: compressed.contentType,
        });
        res.json({ url: `/api/grooming-report-photo?key=${encodeURIComponent(key)}`, key });
      } catch (err: any) {
        console.error("[upload/grooming-report-photo]", err);
        res.status(500).json({ error: err.message ?? "Upload failed" });
      }
    }
  );

  // Serves a grooming-card image stored in uploaded_images by its key.
  app.get("/api/grooming-report-photo", async (req, res) => {
    try {
      let user;
      try { user = await sdk.authenticateRequest(req as any); } catch { user = null; }
      if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
      const key = typeof req.query.key === "string" ? req.query.key : "";
      if (!key.startsWith("grooming-reports/")) { res.status(400).json({ error: "Invalid report photo" }); return; }
      const db = await getDb();
      if (!db) { res.status(503).json({ error: "Database unavailable" }); return; }
      const [image] = await db.select({ photoData: uploadedImages.photoData, photoContentType: uploadedImages.photoContentType })
        .from(uploadedImages).where(eq(uploadedImages.storageKey, key)).limit(1);
      if (!image) { res.status(404).json({ error: "Report photo unavailable" }); return; }
      res.set({ "Content-Type": image.photoContentType, "Cache-Control": "private, max-age=86400" });
      res.send(Buffer.from(image.photoData, "base64"));
    } catch (err: any) {
      console.error("[grooming-report-photo]", err);
      res.status(404).json({ error: "Report photo unavailable" });
    }
  });

  // Serves a grooming card's own before/after photo to whoever holds the
  // card's share link.
  //
  // /api/grooming-report-photo above needs a staff session, so without this a
  // client opening /card/:token saw two broken images — the photos are the
  // part of the card they actually want.
  //
  // Scoped to the card rather than taking a key: the token unlocks THAT
  // report's two photos and nothing else, so a share link can never be bent
  // into a reader for the whole uploaded_images table.
  app.get("/api/card/:token/photo/:which", async (req, res) => {
    try {
      const { isGroomingShareToken } = await import("@shared/groomingShareToken");
      const token = String(req.params.token ?? "");
      const which = String(req.params.which ?? "");
      if (!isGroomingShareToken(token) || (which !== "before" && which !== "after")) {
        res.status(404).json({ error: "Photo unavailable" });
        return;
      }
      const db = await getDb();
      if (!db) { res.status(503).json({ error: "Database unavailable" }); return; }
      const [report] = await db
        .select({ beforeKey: groomingReports.beforePhotoKey, afterKey: groomingReports.afterPhotoKey })
        .from(groomingReports)
        .where(and(
          eq(groomingReports.shareToken, token),
          // Same rule as the card itself: a draft does not resolve.
          eq(groomingReports.status, "sent"),
        ))
        .limit(1);
      const key = which === "before" ? report?.beforeKey : report?.afterKey;
      if (!key) { res.status(404).json({ error: "Photo unavailable" }); return; }
      const [image] = await db
        .select({ photoData: uploadedImages.photoData, photoContentType: uploadedImages.photoContentType })
        .from(uploadedImages).where(eq(uploadedImages.storageKey, key)).limit(1);
      if (!image) { res.status(404).json({ error: "Photo unavailable" }); return; }
      // Public, because the token already gates it and the card is something
      // clients re-open and forward.
      res.set({ "Content-Type": image.photoContentType, "Cache-Control": "public, max-age=86400" });
      res.send(Buffer.from(image.photoData, "base64"));
    } catch (err: any) {
      console.error("[card photo]", err);
      res.status(404).json({ error: "Photo unavailable" });
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
      const compressed = await compressForStorage(buffer, String(contentType));
      const ext = compressed.contentType.split("/")[1]?.split(";")[0] ?? "jpg";
      const key = `grooming-reports/staff/${appointmentId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
      await db.insert(uploadedImages).values({
        storageKey: key,
        photoData: compressed.buffer.toString("base64"),
        photoContentType: compressed.contentType,
      });
      res.json({ url: `/api/grooming-report-photo?key=${encodeURIComponent(key)}`, key });
    } catch (err: any) {
      console.error("[upload/staff-grooming-card-photo]", err);
      res.status(500).json({ error: err.message ?? "Upload failed" });
    }
  });

  // POST /api/upload/pet-groom-photo?petId=123&caption=...&appointmentId=456
  // Stores the photo directly in the database (same approach as the pet
  // profile photo below) rather than external Forge storage, which isn't
  // configured in this environment. Creates the pet_photos row in one step
  // \u2014 the client just needs to refetch afterward, no separate tRPC call.
  app.post(
    "/api/upload/pet-groom-photo",
    async (req, res) => {
      try {
        let user;
        try { user = await sdk.authenticateRequest(req as any); } catch { user = null; }
        if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
        const petId = Number(req.query.petId);
        if (!Number.isInteger(petId) || petId <= 0) { res.status(400).json({ error: "Missing or invalid petId" }); return; }
        const contentType = req.headers["content-type"] ?? "image/jpeg";
        if (!contentType.startsWith("image/")) { res.status(400).json({ error: "Only image uploads are allowed" }); return; }
        const buffer: Buffer = req.body;
        if (!buffer || buffer.length === 0) { res.status(400).json({ error: "Empty file" }); return; }
        if (buffer.length > 20 * 1024 * 1024) { res.status(413).json({ error: "File too large (max 20 MB)" }); return; }

        const db = await getDb();
        if (!db) { res.status(503).json({ error: "Database unavailable" }); return; }
        const [pet] = await db.select({ id: pets.id, tenantId: pets.tenantId }).from(pets).where(eq(pets.id, petId)).limit(1);
        if (!pet) { res.status(404).json({ error: "Pet not found" }); return; }

        const appointmentIdParam = req.query.appointmentId ? Number(req.query.appointmentId) : null;
        const caption = typeof req.query.caption === "string" ? req.query.caption.slice(0, 500) : null;
        const compressed = await compressForStorage(buffer, String(contentType));
        const [created] = await db.insert(petPhotos).values({
          tenantId: pet.tenantId,
          petId: pet.id,
          appointmentId: Number.isInteger(appointmentIdParam) ? appointmentIdParam : null,
          url: "", // superseded by the DB-served image below; kept for the not-null column
          storageKey: null,
          caption: caption,
          photoData: compressed.buffer.toString("base64"),
          photoContentType: compressed.contentType,
        });
        const insertId = (created as any).insertId;
        await db.update(petPhotos).set({ url: `/api/pet-photos/${insertId}/image` }).where(eq(petPhotos.id, insertId));
        res.json({ success: true, id: insertId, url: `/api/pet-photos/${insertId}/image` });
      } catch (err: any) {
        console.error("[upload/pet-groom-photo]", err);
        res.status(500).json({ error: err.message ?? "Upload failed" });
      }
    }
  );

  // POST /api/upload/salon-logo — authenticated branding asset, max 5 MB.
  // ── Staff profile photo ────────────────────────────────────────────────────
  // Stored like the salon logo (base64 in uploaded_images) rather than external
  // storage, so it works without Forge credentials. Cropped square and small,
  // because it is only ever shown as a little circular avatar on the calendar
  // and workflow board.
  app.post("/api/upload/staff-photo", async (req, res) => {
    try {
      let user;
      try { user = await sdk.authenticateRequest(req as any); } catch { user = null; }
      if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
      const contentType = req.headers["content-type"] ?? "image/jpeg";
      if (!contentType.startsWith("image/")) { res.status(400).json({ error: "Only image uploads are allowed" }); return; }
      const buffer: Buffer = req.body;
      if (!buffer?.length) { res.status(400).json({ error: "Empty file" }); return; }
      if (buffer.length > 8 * 1024 * 1024) { res.status(413).json({ error: "File too large (max 8 MB)" }); return; }

      // Square cover-crop at 256px: the avatar is never displayed larger, and it
      // keeps the stored row tiny regardless of what came off the phone.
      let out: Buffer;
      try {
        out = await sharp(buffer, { failOn: "none" })
          .rotate() // honour EXIF orientation before it is discarded
          .resize({ width: 256, height: 256, fit: "cover", position: "attention" })
          .jpeg({ quality: 86, mozjpeg: true })
          .toBuffer();
      } catch (err) {
        // Do NOT fall back to storing the original bytes. They would be saved
        // under a .jpg key with photoContentType "image/jpeg" while actually
        // being whatever sharp could not read. The browser would then get those
        // bytes labelled as JPEG, fail to decode them, and StaffAvatar would
        // silently fall back to initials — the upload reporting success while
        // the photo never appears. Fail loudly instead.
        console.error("[upload/staff-photo] could not process image:", err);
        res.status(415).json({
          error: "That image could not be processed. Please try a JPEG, PNG or WebP.",
        });
        return;
      }

      const key = `staff-photos/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
      const db = await getDb();
      if (!db) { res.status(503).json({ error: "Database unavailable" }); return; }
      await db.insert(uploadedImages).values({
        storageKey: key,
        photoData: out.toString("base64"),
        photoContentType: "image/jpeg",
      });
      res.json({ url: `/api/staff-photo?key=${encodeURIComponent(key)}`, key });
    } catch (err: any) {
      console.error("[upload/staff-photo]", err);
      res.status(500).json({ error: err.message ?? "Upload failed" });
    }
  });

  // Serves a staff profile photo by key. Requires a signed-in user: unlike the
  // salon logo this is a photograph of an employee, so it is not public.
  app.get("/api/staff-photo", async (req, res) => {
    try {
      let user;
      try { user = await sdk.authenticateRequest(req as any); } catch { user = null; }
      if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
      const key = typeof req.query.key === "string" ? req.query.key : "";
      if (!key.startsWith("staff-photos/")) { res.status(400).json({ error: "Invalid photo" }); return; }
      const db = await getDb();
      if (!db) { res.status(503).json({ error: "Database unavailable" }); return; }
      const [image] = await db.select({ photoData: uploadedImages.photoData, photoContentType: uploadedImages.photoContentType })
        .from(uploadedImages).where(eq(uploadedImages.storageKey, key)).limit(1);
      if (!image) { res.status(404).json({ error: "Photo unavailable" }); return; }
      res.set({ "Content-Type": image.photoContentType, "Cache-Control": "private, max-age=86400" });
      res.send(Buffer.from(image.photoData, "base64"));
    } catch (err: any) {
      console.error("[staff-photo]", err);
      res.status(404).json({ error: "Photo unavailable" });
    }
  });

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
      const compressed = await compressLogoForStorage(buffer, String(contentType));
      const ext = compressed.contentType.split("/")[1]?.split(";")[0] ?? "png";
      const key = `salon-branding/logos/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
      const db = await getDb();
      if (!db) { res.status(503).json({ error: "Database unavailable" }); return; }
      await db.insert(uploadedImages).values({
        storageKey: key,
        photoData: compressed.buffer.toString("base64"),
        photoContentType: compressed.contentType,
      });
      res.json({ url: `/api/salon-logo?key=${encodeURIComponent(key)}`, key });
    } catch (err: any) {
      console.error("[upload/salon-logo]", err);
      res.status(500).json({ error: err.message ?? "Upload failed" });
    }
  });

  // Serves the salon logo by key. Public (no auth) since it may be shown on
  // the client portal and other unauthenticated surfaces too.
  app.get("/api/salon-logo", async (req, res) => {
    try {
      const key = typeof req.query.key === "string" ? req.query.key : "";
      if (!key.startsWith("salon-branding/")) { res.status(400).json({ error: "Invalid logo" }); return; }
      const db = await getDb();
      if (!db) { res.status(503).json({ error: "Database unavailable" }); return; }
      const [image] = await db.select({ photoData: uploadedImages.photoData, photoContentType: uploadedImages.photoContentType })
        .from(uploadedImages).where(eq(uploadedImages.storageKey, key)).limit(1);
      if (!image) { res.status(404).json({ error: "Logo unavailable" }); return; }
      res.set({ "Content-Type": image.photoContentType, "Cache-Control": "public, max-age=86400" });
      res.send(Buffer.from(image.photoData, "base64"));
    } catch (err: any) {
      console.error("[salon-logo]", err);
      res.status(404).json({ error: "Logo unavailable" });
    }
  });

  // GET /api/pets/:id/photo — a dog's profile photo, straight from the
  // database (base64, from the MoeGo migration) rather than external storage.
  //
  // Served RESIZED by default. The stored photos are full-size camera images -
  // up to about a megabyte each - and the Workflow board draws them as 28px
  // circles. A full board is 38 dogs, so the untouched originals meant tens of
  // megabytes to render one screen, and on the salon's iPad the photos simply
  // never arrived. `?size=full` returns the original for the profile page.
  //
  // Falls back to the dog's most recent gallery photo when no profile photo
  // has been set, so a picture taken at grooming shows up on the board without
  // anyone having to set it as the profile.
  const PET_THUMB_PX = 96;
  const petThumbCache = new Map<string, Buffer>();

  app.get("/api/pets/:id/photo", async (req, res) => {
    try {
      let user;
      try { user = await sdk.authenticateRequest(req as any); } catch { user = null; }
      if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
      const petId = Number(req.params.id);
      if (!Number.isInteger(petId) || petId <= 0) { res.status(400).json({ error: "Invalid pet id" }); return; }
      const wantsFull = req.query.size === "full";

      if (!wantsFull) {
        const cached = petThumbCache.get(String(petId));
        if (cached) {
          res.set({ "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" });
          res.send(cached);
          return;
        }
      }

      const db = await getDb();
      if (!db) { res.status(503).json({ error: "Database unavailable" }); return; }
      const [pet] = await db.select({ photoData: pets.photoData, photoContentType: pets.photoContentType })
        .from(pets).where(eq(pets.id, petId)).limit(1);

      let data = pet?.photoData ?? null;
      let contentType = pet?.photoContentType ?? null;
      if (!data) {
        // No profile photo - use the newest grooming photo of this dog.
        const [gallery] = await db.select({ photoData: petPhotos.photoData, photoContentType: petPhotos.photoContentType })
          .from(petPhotos)
          .where(eq(petPhotos.petId, petId))
          .orderBy(desc(petPhotos.takenAt))
          .limit(1);
        data = gallery?.photoData ?? null;
        contentType = gallery?.photoContentType ?? null;
      }
      if (!data) { res.status(404).json({ error: "No photo" }); return; }

      const original = Buffer.from(data, "base64");
      if (wantsFull) {
        res.set({ "Content-Type": contentType || "image/jpeg", "Cache-Control": "private, max-age=86400" });
        res.send(original);
        return;
      }

      // A failed resize must not blank the board: fall back to the original.
      let thumb = original;
      try {
        thumb = await sharp(original, { failOn: "none" })
          .rotate()
          .resize({ width: PET_THUMB_PX, height: PET_THUMB_PX, fit: "cover", position: "attention" })
          .jpeg({ quality: 72, mozjpeg: true })
          .toBuffer();
        // Bounded so a large client list cannot grow this without limit.
        if (petThumbCache.size > 500) petThumbCache.clear();
        petThumbCache.set(String(petId), thumb);
      } catch (err) {
        console.error("[pets/:id/photo] resize failed, serving original", err);
      }
      res.set({ "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" });
      res.send(thumb);
    } catch (err: any) {
      console.error("[pets/:id/photo]", err);
      res.status(500).json({ error: err.message ?? "Failed to load photo" });
    }
  });

  // GET /api/pet-photos/:id/image — serves one groom-photo-gallery entry
  // stored directly in the database (see the upload route above).
  app.get("/api/pet-photos/:id/image", async (req, res) => {
    try {
      let user;
      try { user = await sdk.authenticateRequest(req as any); } catch { user = null; }
      if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
      const photoId = Number(req.params.id);
      if (!Number.isInteger(photoId) || photoId <= 0) { res.status(400).json({ error: "Invalid photo id" }); return; }
      const db = await getDb();
      if (!db) { res.status(503).json({ error: "Database unavailable" }); return; }
      const [photo] = await db.select({ photoData: petPhotos.photoData, photoContentType: petPhotos.photoContentType })
        .from(petPhotos).where(eq(petPhotos.id, photoId)).limit(1);
      if (!photo?.photoData) { res.status(404).json({ error: "No photo" }); return; }
      const buffer = Buffer.from(photo.photoData, "base64");
      res.set({
        "Content-Type": photo.photoContentType || "image/jpeg",
        "Cache-Control": "private, max-age=86400",
      });
      res.send(buffer);
    } catch (err: any) {
      console.error("[pet-photos/:id/image]", err);
      res.status(500).json({ error: err.message ?? "Failed to load photo" });
    }
  });

  // POST /api/upload/client-photo?token=<32 hex>
  //
  // The one upload route with no login behind it. The token IS the
  // authority: it was texted to one client, it expires in a week, it can
  // be revoked, and it stops accepting after MAX_PHOTOS_PER_REQUEST. The
  // client holding it is on their phone with no account and no intention
  // of making one, which is the entire reason the feature exists.
  //
  // Nothing from the request decides whose photo it is. The client, the
  // tenant and the dog all come off the stored row, so a token cannot be
  // pointed at somebody else's record by adding a query parameter.
  app.post("/api/upload/client-photo", async (req, res) => {
    try {
      const token = typeof req.query.token === "string" ? req.query.token : "";
      if (!/^[0-9a-f]{32}$/.test(token)) { res.status(400).json({ error: "This photo link is not valid." }); return; }
      const db = await getDb();
      if (!db) { res.status(503).json({ error: "Database unavailable" }); return; }

      const [request] = await db.select({
        id: clientPhotoRequests.id,
        tenantId: clientPhotoRequests.tenantId,
        clientId: clientPhotoRequests.clientId,
        petId: clientPhotoRequests.petId,
        expiresAt: clientPhotoRequests.expiresAt,
        revokedAt: clientPhotoRequests.revokedAt,
        uploadCount: clientPhotoRequests.uploadCount,
      }).from(clientPhotoRequests)
        .where(eq(clientPhotoRequests.tokenHash, hashClientPhotoToken(token)))
        .limit(1);
      // An unknown token and a dead one read the same, so this cannot be
      // used to find out which links are live.
      if (!request) { res.status(404).json({ error: "This photo link is not valid. Please ask the salon for a new one." }); return; }
      const state = photoRequestState(request);
      if (!state.ok) { res.status(410).json({ error: state.message }); return; }

      const contentType = req.headers["content-type"] ?? "image/jpeg";
      if (!String(contentType).startsWith("image/")) { res.status(400).json({ error: "Please choose a photo." }); return; }
      const buffer: Buffer = req.body;
      if (!buffer?.length) { res.status(400).json({ error: "That file was empty - please try again." }); return; }
      if (buffer.length > 20 * 1024 * 1024) { res.status(413).json({ error: "That photo is too large (max 20 MB)." }); return; }

      const compressed = await compressForStorage(buffer, String(contentType));
      const ext = compressed.contentType.split("/")[1]?.split(";")[0] ?? "jpg";
      const key = `client-photos/${request.tenantId}/${request.clientId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

      await db.insert(uploadedImages).values({
        storageKey: key,
        photoData: compressed.buffer.toString("base64"),
        photoContentType: compressed.contentType,
      });
      await db.insert(clientPhotos).values({
        tenantId: request.tenantId, clientId: request.clientId,
        requestId: request.id, petId: request.petId,
        storageKey: key, contentType: compressed.contentType, byteSize: compressed.buffer.length,
      });
      // In SQL, not read-then-written: two photos sent at once must not
      // both see the same count and slip past the ceiling.
      await db.update(clientPhotoRequests).set({
        uploadCount: sql`${clientPhotoRequests.uploadCount} + 1`,
        lastUploadAt: new Date(),
      }).where(eq(clientPhotoRequests.id, request.id));

      res.json({ ok: true, remaining: Math.max(0, state.remaining - 1) });
    } catch (err: any) {
      console.error("[upload/client-photo]", err);
      res.status(500).json({ error: "We could not save that photo. Please try again." });
    }
  });

  // GET /api/client-photo?key=... — staff only, and only their own salon's.
  app.get("/api/client-photo", async (req, res) => {
    try {
      let user;
      try { user = await sdk.authenticateRequest(req as any); } catch { user = null; }
      if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
      const key = typeof req.query.key === "string" ? req.query.key : "";
      if (!key.startsWith("client-photos/")) { res.status(400).json({ error: "Invalid photo" }); return; }
      const db = await getDb();
      if (!db) { res.status(503).json({ error: "Database unavailable" }); return; }

      // Tenant comes off the photo row, then is checked against the
      // viewer. A key alone must not be enough to read another salon's
      // client photos, however it was come by.
      const [photo] = await db.select({ tenantId: clientPhotos.tenantId })
        .from(clientPhotos).where(eq(clientPhotos.storageKey, key)).limit(1);
      if (!photo) { res.status(404).json({ error: "Photo not found" }); return; }
      const portalStaff = await requireApprovedStaffTenant(db, user as any);
      if (portalStaff && portalStaff.tenantId !== photo.tenantId) {
        res.status(403).json({ error: "This photo is not available to your salon profile" }); return;
      }

      const [image] = await db.select({ photoData: uploadedImages.photoData, photoContentType: uploadedImages.photoContentType })
        .from(uploadedImages).where(eq(uploadedImages.storageKey, key)).limit(1);
      if (!image) { res.status(404).json({ error: "Photo not found" }); return; }
      res.setHeader("Content-Type", image.photoContentType);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(Buffer.from(image.photoData, "base64"));
    } catch (err: any) {
      console.error("[client-photo]", err);
      res.status(500).json({ error: err.message ?? "Failed to load photo" });
    }
  });
}
