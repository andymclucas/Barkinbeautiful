/**
 * Video on a staff problem report (stage 2, 11/11/2026).
 *
 * No file storage is configured for this app, so the bytes go into the
 * database like every photo — but in pieces (issue_report_video_chunks),
 * because one video is far over TiDB's ~6 MB per-row limit.
 *
 * Upload: the browser cuts the file into ISSUE_VIDEO_CHUNK_BYTES pieces
 * and sends them in order. The first piece creates the key; the rest must
 * come from the same person. Every piece but the last is exactly the chunk
 * size, so a byte offset maps straight to a piece when playing it back.
 *
 * Playback: owners only, with HTTP byte ranges — Safari will not play a
 * video, or let you scrub one, from a server that cannot answer a range.
 *
 * Like the images, the sender is any staff login and the viewer an owner,
 * so it is treated as untrusted: allow-listed types, the container's magic
 * bytes checked, served as that video type with nosniff and a sandboxing
 * CSP, and capped per person per hour.
 */
import express, { type Router } from "express";
import { and, asc, eq } from "drizzle-orm";
import { sdk } from "./_core/sdk";
import { getDb } from "./db";
import { issueReportVideoChunks } from "../drizzle/schema";
import { requireApprovedStaffTenant } from "./staffAccess";
import { canAdministerStaff } from "@shared/staffAdministrators";
import {
  ISSUE_VIDEO_CHUNK_BYTES, ISSUE_VIDEO_KEY_PREFIX, ISSUE_VIDEO_MAX_BYTES, ISSUE_VIDEO_MAX_CHUNKS,
  isIssueVideoKey, isIssueVideoType, videoChunkCount, type IssueVideoType,
} from "@shared/issueReports";

/** Does this look like the start of an MP4/QuickTime or WebM file? */
export function looksLikeVideoStart(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  const box = buf.subarray(4, 8).toString("latin1");
  if (["ftyp", "moov", "mdat", "wide", "free", "skip"].includes(box)) return true;
  return buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
}

/**
 * An HTTP Range header against a file of `size` bytes. Only the single
 * "bytes=a-b" form browsers send for media. null = serve the whole file;
 * "unsatisfiable" = 416.
 */
export function parseRange(header: string | undefined, size: number): { start: number; end: number } | null | "unsatisfiable" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (suffix <= 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

/** Which stored pieces, and which bytes of each, cover [start, end]. */
export function piecesForRange(start: number, end: number, chunkBytes = ISSUE_VIDEO_CHUNK_BYTES) {
  const pieces: Array<{ seq: number; from: number; to: number }> = [];
  for (let seq = Math.floor(start / chunkBytes); seq * chunkBytes <= end; seq++) {
    const base = seq * chunkBytes;
    pieces.push({ seq, from: Math.max(0, start - base), to: Math.min(chunkBytes - 1, end - base) });
  }
  return pieces;
}

/**
 * A finished video, as the database has it: every piece present, sizes
 * consistent. Returns its real type and size, so a report never trusts
 * what the browser claimed about them.
 */
export async function completeVideo(db: any, key: string, userId?: number) {
  if (!isIssueVideoKey(key)) return null;
  const rows: Array<{ seq: number; total: number; byteLength: number; contentType: string; createdByUserId: number }> = await db
    .select({
      seq: issueReportVideoChunks.seq,
      total: issueReportVideoChunks.total,
      byteLength: issueReportVideoChunks.byteLength,
      contentType: issueReportVideoChunks.contentType,
      createdByUserId: issueReportVideoChunks.createdByUserId,
    })
    .from(issueReportVideoChunks)
    .where(eq(issueReportVideoChunks.videoKey, key))
    .orderBy(asc(issueReportVideoChunks.seq));
  if (rows.length === 0) return null;
  const total = rows[0].total;
  if (rows.length !== total || rows.some((r, i) => r.seq !== i)) return null;
  if (userId !== undefined && rows[0].createdByUserId !== userId) return null;
  if (rows.slice(0, -1).some((r) => r.byteLength !== ISSUE_VIDEO_CHUNK_BYTES)) return null;
  if (!isIssueVideoType(rows[0].contentType)) return null;
  return {
    contentType: rows[0].contentType as IssueVideoType,
    bytes: rows.reduce((sum, r) => sum + r.byteLength, 0),
    total,
  };
}

const PER_HOUR_BYTES = 200 * 1024 * 1024;
const recentBytes = new Map<number, Array<{ at: number; bytes: number }>>();
function underByteLimit(userId: number, bytes: number) {
  const now = Date.now();
  const kept = (recentBytes.get(userId) ?? []).filter((e) => now - e.at < 3_600_000);
  const used = kept.reduce((s, e) => s + e.bytes, 0);
  if (used + bytes > PER_HOUR_BYTES) { recentBytes.set(userId, kept); return false; }
  kept.push({ at: now, bytes });
  recentBytes.set(userId, kept);
  return true;
}

const isDuplicateKey = (err: any) =>
  err?.code === "ER_DUP_ENTRY" || err?.cause?.code === "ER_DUP_ENTRY" || /Duplicate entry/i.test(String(err?.message ?? ""));

export function registerIssueVideoRoutes(app: Router) {
  app.post(
    "/api/upload/issue-report-video",
    express.raw({ type: () => true, limit: ISSUE_VIDEO_CHUNK_BYTES + 64 * 1024 }),
    async (req, res) => {
      try {
        let user;
        try { user = await sdk.authenticateRequest(req as any); } catch { user = null; }
        if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
        const db = await getDb();
        if (!db) { res.status(503).json({ error: "Database unavailable" }); return; }
        try { await requireApprovedStaffTenant(db, user as any); } catch (e: any) {
          res.status(403).json({ error: e?.message ?? "Not allowed" }); return;
        }

        const body = req.body;
        if (!Buffer.isBuffer(body) || body.length === 0) { res.status(400).json({ error: "Empty upload" }); return; }
        if (body.length > ISSUE_VIDEO_CHUNK_BYTES) { res.status(413).json({ error: "Piece too large" }); return; }
        const seq = Number(req.query.seq);
        if (!Number.isInteger(seq) || seq < 0 || seq >= ISSUE_VIDEO_MAX_CHUNKS) { res.status(400).json({ error: "Bad piece number" }); return; }
        if (!underByteLimit(user.id, body.length)) { res.status(429).json({ error: "Too much video uploaded in the last hour. Try again later." }); return; }

        let key: string;
        let total: number;
        let contentType: IssueVideoType;
        if (seq === 0) {
          const type = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
          if (!isIssueVideoType(type)) { res.status(400).json({ error: "Attach an MP4, MOV or WebM video." }); return; }
          const size = Number(req.query.size);
          if (!Number.isInteger(size) || size <= 0) { res.status(400).json({ error: "Missing video size" }); return; }
          if (size > ISSUE_VIDEO_MAX_BYTES) { res.status(413).json({ error: "That video is too long — keep it under 60 MB." }); return; }
          total = videoChunkCount(size);
          if (!looksLikeVideoStart(body)) { res.status(400).json({ error: "That file doesn't look like a video." }); return; }
          contentType = type;
          key = `${ISSUE_VIDEO_KEY_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        } else {
          key = String(req.query.key ?? "");
          if (!isIssueVideoKey(key)) { res.status(400).json({ error: "Bad video key" }); return; }
          const [first] = await db.select({
            total: issueReportVideoChunks.total,
            contentType: issueReportVideoChunks.contentType,
            createdByUserId: issueReportVideoChunks.createdByUserId,
          }).from(issueReportVideoChunks)
            .where(and(eq(issueReportVideoChunks.videoKey, key), eq(issueReportVideoChunks.seq, 0)))
            .limit(1);
          if (!first || first.createdByUserId !== user.id) { res.status(404).json({ error: "Start the video upload again." }); return; }
          if (seq >= first.total) { res.status(400).json({ error: "Bad piece number" }); return; }
          total = first.total;
          contentType = first.contentType as IssueVideoType;
        }
        // Every piece but the last is exactly full, so playback can find a
        // byte by arithmetic.
        if (seq < total - 1 && body.length !== ISSUE_VIDEO_CHUNK_BYTES) { res.status(400).json({ error: "Bad piece size" }); return; }

        try {
          await db.insert(issueReportVideoChunks).values({
            videoKey: key, seq, total, contentType,
            byteLength: body.length,
            data: body.toString("base64"),
            createdByUserId: user.id,
          });
        } catch (err) {
          // A retried piece that already landed is fine; anything else is not.
          if (!isDuplicateKey(err)) throw err;
        }
        res.json({ key, seq, total });
      } catch (err) {
        console.error("[upload/issue-report-video]", err);
        res.status(500).json({ error: "Upload failed" });
      }
    },
  );

  app.get("/api/issue-report-video", async (req, res) => {
    try {
      let user;
      try { user = await sdk.authenticateRequest(req as any); } catch { user = null; }
      if (!user) { res.status(401).end(); return; }
      if (!canAdministerStaff(user)) { res.status(403).end(); return; }
      const key = String(req.query.key ?? "");
      const db = await getDb();
      if (!db) { res.status(503).end(); return; }
      const video = await completeVideo(db, key);
      if (!video) { res.status(404).end(); return; }

      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", video.contentType);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
      res.setHeader("Cache-Control", "private, max-age=86400");

      const range = parseRange(req.headers.range, video.bytes);
      if (range === "unsatisfiable") {
        res.status(416).setHeader("Content-Range", `bytes */${video.bytes}`);
        res.end();
        return;
      }
      const start = range?.start ?? 0;
      const end = range?.end ?? video.bytes - 1;
      res.status(range ? 206 : 200);
      if (range) res.setHeader("Content-Range", `bytes ${start}-${end}/${video.bytes}`);
      res.setHeader("Content-Length", String(end - start + 1));

      // One piece at a time, so a 60 MB video never sits in memory whole.
      for (const piece of piecesForRange(start, end)) {
        const [row] = await db.select({ data: issueReportVideoChunks.data }).from(issueReportVideoChunks)
          .where(and(eq(issueReportVideoChunks.videoKey, key), eq(issueReportVideoChunks.seq, piece.seq))).limit(1);
        if (!row) break;
        const buf = Buffer.from(row.data, "base64");
        if (!res.write(buf.subarray(piece.from, piece.to + 1))) {
          await new Promise((resolve) => res.once("drain", resolve));
        }
      }
      res.end();
    } catch (err) {
      console.error("[issue-report-video]", err);
      if (!res.headersSent) res.status(500).end(); else res.end();
    }
  });
}
