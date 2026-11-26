/**
 * Write the fill and split rows from price-imported-bookings-2026-11-26.ts.
 *
 * Andy, 26/11/2026: "Write next week only".
 *
 *   corepack pnpm exec tsx scripts/apply-price-suggestions-2026-11-26.ts <suggestions.csv> --from 2026-11-30 --to 2026-12-06 --backup <file.json>
 *   ... --apply
 *
 * Without --apply it prints what it would change and writes nothing.
 *
 * Guards, every one of which makes a row a no-op rather than a wrong write:
 *  - only rows whose action is "fill" or "split", inside --from/--to;
 *  - a row is changed only if it still holds the value the dry run saw:
 *    blank (NULL or 0) for a fill or a split sibling, the family total for
 *    a split's carrier. A price Lauren typed since the dry run is left alone;
 *  - never a member booking (membership_id IS NULL in the WHERE);
 *  - one transaction; the before-values are written to --backup first, and
 *    if any guarded update touches other than exactly one row the whole
 *    write rolls back.
 *
 * price and gross_price are both set, matching how an imported family
 * carrier row holds its figure (price = gross_price).
 *
 * Undo: scripts/apply-price-suggestions-2026-11-26.ts --undo <backup.json> --apply
 * puts back exactly the values in the backup.
 */
import { readFileSync, writeFileSync } from "node:fs";
import mysql from "mysql2/promise";

const args = process.argv.slice(2);
const argOf = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes("--apply");
const undoFile = argOf("--undo");

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') q = false; else field += ch; continue; }
    if (ch === '"') q = true; else if (ch === ",") { row.push(field); field = ""; } else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function connect() {
  return mysql.createConnection({ uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true } });
}

async function undo(file: string) {
  const backup: Array<{ id: number; price: string | null; gross_price: string | null }> = JSON.parse(readFileSync(file, "utf8"));
  console.log(`undo: ${backup.length} rows from ${file}${APPLY ? "" : " (dry run)"}`);
  if (!APPLY) return;
  const c = await connect();
  await c.beginTransaction();
  for (const b of backup) await c.query("UPDATE appointments SET price=?, gross_price=? WHERE id=? AND tenant_id=1", [b.price, b.gross_price, b.id]);
  await c.commit(); await c.end();
  console.log("restored");
}

async function main() {
  if (undoFile) return undo(undoFile);
  const file = args.find((a) => !a.startsWith("--") && a.endsWith(".csv"));
  const from = argOf("--from"), to = argOf("--to"), backupFile = argOf("--backup");
  if (!file || !from || !to || !backupFile) throw new Error("usage: <suggestions.csv> --from YYYY-MM-DD --to YYYY-MM-DD --backup <file.json> [--apply]");

  const [header, ...rows] = parseCsv(readFileSync(file, "utf8")).filter((r) => r.length > 1);
  const col = (name: string) => header.indexOf(name);
  const plan = rows
    .filter((r) => (r[col("action")] === "fill" || r[col("action")] === "split") && r[col("date")] >= from && r[col("date")] <= to)
    .map((r) => ({ id: Number(r[col("appointment")]), action: r[col("action")], current: r[col("current")], suggested: r[col("suggested")] }));
  if (plan.some((p) => !Number.isInteger(p.id) || !/^\d+\.\d{2}$/.test(p.suggested))) throw new Error("a row has no id or no suggested price");

  const c = await connect();
  const ids = plan.map((p) => p.id);
  const [before] = await c.query("SELECT id, price, gross_price, membership_id FROM appointments WHERE tenant_id=1 AND id IN (?)", [ids]) as unknown as [Array<{ id: number; price: string | null; gross_price: string | null; membership_id: number | null }>];
  const byId = new Map(before.map((b) => [b.id, b]));

  const isBlank = (v: string | null) => v === null || Number(v) === 0;
  const todo = plan.filter((p) => {
    const b = byId.get(p.id);
    if (!b || b.membership_id !== null) return false;
    const carrier = p.action === "split" && p.current !== "" && Number(p.current) > 0;
    return carrier ? Number(b.price) === Number(p.current) : isBlank(b.price);
  });
  const skipped = plan.filter((p) => !todo.includes(p));
  console.log(`plan ${plan.length}, will write ${todo.length}, skipped (changed since the dry run or member) ${skipped.length}${skipped.length ? ": " + skipped.map((s) => s.id).join(" ") : ""}`);
  console.log(`total written $${todo.reduce((t, p) => t + Number(p.suggested), 0).toFixed(2)}`);
  if (!APPLY) { await c.end(); return; }

  writeFileSync(backupFile, JSON.stringify(todo.map((p) => { const b = byId.get(p.id)!; return { id: b.id, price: b.price, gross_price: b.gross_price }; }), null, 2));
  await c.beginTransaction();
  try {
    for (const p of todo) {
      const b = byId.get(p.id)!;
      const carrier = p.action === "split" && p.current !== "" && Number(p.current) > 0;
      const [res] = carrier
        ? await c.query("UPDATE appointments SET price=?, gross_price=? WHERE id=? AND tenant_id=1 AND membership_id IS NULL AND price=?", [p.suggested, p.suggested, p.id, b.price])
        : await c.query("UPDATE appointments SET price=?, gross_price=? WHERE id=? AND tenant_id=1 AND membership_id IS NULL AND (price IS NULL OR price=0)", [p.suggested, p.suggested, p.id]);
      if ((res as { affectedRows: number }).affectedRows !== 1) throw new Error(`appointment ${p.id} changed under us; nothing written`);
    }
    await c.commit();
    console.log(`written ${todo.length}; backup ${backupFile}`);
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    await c.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
