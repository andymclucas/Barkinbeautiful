/**
 * The staff problem-report queue, for working through in a Claude session.
 *
 * Reports come from the "Report a problem" button (shared/issueReports.ts).
 * This prints the open ones as markdown and saves each screenshot/photo to
 * a folder, so a session can look at the pictures, not just read about
 * them. See .claude/skills/issue-queue/SKILL.md for the whole routine.
 *
 *   node --import tsx scripts/issue-queue.ts                 # open reports
 *   node --import tsx scripts/issue-queue.ts --all           # include done (last 50)
 *   node --import tsx scripts/issue-queue.ts --out <dir>     # where images go
 *   node --import tsx scripts/issue-queue.ts --start 12      # mark "working on it"
 *   node --import tsx scripts/issue-queue.ts --fixed 12 --note "Shipped in abc123"
 *   node --import tsx scripts/issue-queue.ts --dismiss 12 --note "Not a bug"
 *
 * Reading is safe. The three status flags write ONE row each, by id.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const value = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const brisbane = (d: Date | null) =>
  d ? d.toLocaleString("en-AU", { timeZone: "Australia/Brisbane", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }) : "";

type Json<T> = T | string | null;
const parse = <T,>(v: Json<T>): T | null => (typeof v === "string" ? (JSON.parse(v) as T) : v ?? null);

async function main() {
  const db = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    timezone: "Z",
    connectTimeout: 20_000,
  });
  try {
    const statusChange =
      value("--start") ? { id: Number(value("--start")), status: "in_progress" } :
      value("--fixed") ? { id: Number(value("--fixed")), status: "fixed" } :
      value("--dismiss") ? { id: Number(value("--dismiss")), status: "dismissed" } : null;

    if (statusChange) {
      if (!Number.isInteger(statusChange.id) || statusChange.id <= 0) throw new Error("Give a report id");
      const note = value("--note");
      const [res] = await db.execute(
        `UPDATE issue_reports SET status = ?, status_changed_at = UTC_TIMESTAMP()${note !== undefined ? ", resolution_note = ?" : ""} WHERE id = ? LIMIT 1`,
        note !== undefined ? [statusChange.status, note, statusChange.id] : [statusChange.status, statusChange.id],
      );
      const affected = (res as { affectedRows: number }).affectedRows;
      console.log(affected === 1 ? `Report #${statusChange.id} → ${statusChange.status}` : `No report #${statusChange.id}`);
      return;
    }

    const all = flag("--all");
    const [rows] = await db.query(
      all
        ? "SELECT * FROM issue_reports ORDER BY created_at DESC LIMIT 50"
        : "SELECT * FROM issue_reports WHERE status IN ('new','in_progress') ORDER BY created_at ASC",
    );
    const reports = rows as Array<Record<string, any>>;
    if (reports.length === 0) {
      console.log(all ? "No reports yet." : "No open reports. 🎉");
      return;
    }

    const out = value("--out") ?? join(tmpdir(), "issue-queue");
    mkdirSync(out, { recursive: true });

    console.log(`# ${all ? "Recent" : "Open"} problem reports (${reports.length})\n`);
    for (const r of reports) {
      const context = parse<Record<string, unknown>>(r.context) ?? {};
      const errors = parse<Array<{ kind: string; message: string; at: string }>>(r.recent_errors) ?? [];
      const images = parse<Array<{ key: string; kind: string }>>(r.image_keys) ?? [];

      let clientLine = "";
      if (typeof context.clientId === "number") {
        const [c] = await db.query("SELECT first_name, last_name FROM clients WHERE id = ? AND tenant_id = ?", [context.clientId, r.tenant_id]);
        const row = (c as any[])[0];
        clientLine = `client ${context.clientId}${row ? ` (${row.first_name} ${row.last_name})` : ""}`;
      }

      const files: string[] = [];
      for (const [i, img] of images.entries()) {
        const [found] = await db.query("SELECT photo_data, photo_content_type FROM uploaded_images WHERE storage_key = ? LIMIT 1", [img.key]);
        const row = (found as any[])[0];
        if (!row) continue;
        const ext = String(row.photo_content_type).split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "jpg";
        const file = join(out, `report-${r.id}-${i + 1}-${img.kind}.${ext}`);
        writeFileSync(file, Buffer.from(row.photo_data, "base64"));
        files.push(file);
      }

      console.log(`## #${r.id} · ${r.status} · ${r.reporter_name ?? "unknown"} · ${brisbane(r.created_at)}${r.tenant_id !== 1 ? ` · tenant ${r.tenant_id}` : ""}`);
      console.log("");
      console.log(String(r.message).split("\n").map((l: string) => `> ${l}`).join("\n"));
      console.log("");
      console.log(`- Page: ${r.page_path ?? "?"}${context.search ?? ""}`);
      const bits = [
        clientLine,
        typeof context.petId === "number" ? `pet ${context.petId}` : "",
        typeof context.appointmentId === "number" ? `appointment ${context.appointmentId}` : "",
        typeof context.staffId === "number" ? `staff ${context.staffId}` : "",
        typeof context.date === "string" ? `day ${context.date}` : "",
      ].filter(Boolean);
      if (bits.length) console.log(`- About: ${bits.join(", ")}`);
      if (context.viewport || context.userAgent) console.log(`- Device: ${context.viewport ?? ""} ${context.userAgent ?? ""}`.trimEnd());
      for (const e of errors) console.log(`- Error ${brisbane(new Date(e.at))}: ${e.message}`);
      for (const f of files) console.log(`- Image: ${f}`);
      if (r.resolution_note) console.log(`- Note: ${r.resolution_note}`);
      console.log("");
    }
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
