/**
 * Import MoeGo's client tags and free-text note.
 *
 *   node --import tsx scripts/moego-client-tags.ts "<MoeGo-Export-Client.csv>"          # dry run
 *   node --import tsx scripts/moego-client-tags.ts "<MoeGo-Export-Client.csv>" --apply  # writes
 *
 * 321 clients carry a tag and 609 carry a note, and several are things that
 * should stop a booking dead: BANNED (28), Refuse new bookings (31), DONT
 * BOOK IN (19), MUST PRE-PAY (9), Owes money, DOG AGRESSIVE. Groomigo knows
 * none of it today.
 *
 * The export has NO MoeGo client id column, so matching is on phone, with
 * email as a fallback. That is the dangerous part: the Monday-sync skill's
 * Trap 10 is exactly this, a client matched loosely and the wrong record
 * written. So a row is only written when it resolves to EXACTLY ONE
 * Groomigo client. Anything that matches two households, or none, is
 * reported and skipped — leaving a tag off is recoverable, putting "BANNED"
 * on the wrong family is not.
 *
 * Tags and the note are stored verbatim in their own columns. Nothing is
 * classified here; the vocabulary is the salon's own.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { phoneMatchKey } from "../shared/moegoImport.ts";
import { looksLikeCardNumber } from "../shared/cardNumberDetect.ts";

/**
 * A Brisbane landline written without its area code.
 *
 * phoneMatchKey needs nine digits and the export gives eight for these
 * ("33960485"), so they matched nothing — and one of them, David and Rita
 * Miles, carries DONT BOOK IN. Prefixing 07 recovers them, and the unique-
 * match rule below still decides whether anything is written.
 */
function landlineKey(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length === 8 && /^[23789]/.test(digits) ? phoneMatchKey(`07${digits}`) : "";
}

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const file = args.find((a) => !a.startsWith("--"));
if (!file) throw new Error('Usage: moego-client-tags.ts "<export.csv>" [--apply]');

/** MoeGo quotes every field and separates with TAB then comma. */
function parseRows(raw: string): string[][] {
  const out: string[][] = [];
  let field = "", row: string[] = [], inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"' && raw[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(field.trim()); field = ""; }
    else if (ch === "\n") { row.push(field.trim()); out.push(row); row = []; field = ""; }
    else if (ch === "\r") { /* skip */ }
    else field += ch;
  }
  if (field || row.length) { row.push(field.trim()); out.push(row); }
  return out;
}

const rows = parseRows(readFileSync(file, "utf8"));
const header = rows[0].map((h) => h.trim());
const col = (name: string) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`Column "${name}" not in export: ${header.join(" | ")}`);
  return i;
};
const iFirst = col("First name"), iLast = col("Last name"), iPhone = col("Primary contact");
const iEmail = col("email"), iTags = col("tags"), iNotes = col("notes");

type Incoming = { first: string; last: string; phone: string; email: string; tags: string; notes: string };
const incoming: Incoming[] = [];
for (const r of rows.slice(1)) {
  if (r.length < header.length) continue;
  const tags = (r[iTags] ?? "").trim();
  const notes = (r[iNotes] ?? "").trim();
  if (!tags && !notes) continue;
  incoming.push({
    first: (r[iFirst] ?? "").trim(), last: (r[iLast] ?? "").trim(),
    phone: (r[iPhone] ?? "").trim(), email: (r[iEmail] ?? "").trim().toLowerCase(),
    tags, notes,
  });
}
console.log(`Export: ${incoming.length} clients carrying a tag or a note`);

const db = await mysql.createConnection({
  uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
});
const [clients] = await db.query<any[]>(
  `SELECT id, first_name, last_name, phone, email, moego_tags, moego_notes
   FROM clients WHERE tenant_id = 1`,
);
console.log(`Groomigo: ${clients.length} clients\n`);

const byPhone = new Map<string, any[]>();
const byEmail = new Map<string, any[]>();
for (const c of clients) {
  // Groomigo stores these landlines in the same eight-digit form the export
  // uses, so BOTH sides need the area code before they can meet.
  const pk = phoneMatchKey(c.phone) || landlineKey(c.phone);
  if (pk) { const a = byPhone.get(pk) ?? []; a.push(c); byPhone.set(pk, a); }
  const em = (c.email ?? "").trim().toLowerCase();
  if (em) { const a = byEmail.get(em) ?? []; a.push(c); byEmail.set(em, a); }
}

const updates: { id: number; tags: string | null; notes: string | null; who: string }[] = [];
const ambiguous: string[] = [], unmatched: string[] = [], cardNotes: string[] = [];
let unchanged = 0;

for (const row of incoming) {
  const pk = phoneMatchKey(row.phone);
  let hits = pk ? byPhone.get(pk) ?? [] : [];
  let how = "phone";
  if (hits.length === 0) {
    const lk = landlineKey(row.phone);
    if (lk) { hits = byPhone.get(lk) ?? []; how = "landline"; }
  }
  if (hits.length === 0 && row.email) { hits = byEmail.get(row.email) ?? []; how = "email"; }
  const who = `${row.first} ${row.last}`.trim();
  if (hits.length === 0) { unmatched.push(`${who} (${row.phone || row.email || "no contact"})`); continue; }
  if (hits.length > 1) { ambiguous.push(`${who} -> ${hits.length} Groomigo clients by ${how}: ${hits.map((h) => h.id).join(", ")}`); continue; }
  const c = hits[0];
  const tags = row.tags || null;
  // A handful of MoeGo notes hold a full card number, expiry and security
  // code typed in years ago. Expired or not, they are not being copied into
  // a second system. The tag still imports; the note is dropped and named.
  let notes: string | null = row.notes || null;
  if (notes && looksLikeCardNumber(notes)) {
    cardNotes.push(`${who} (client ${c.id})`);
    notes = null;
  }
  if ((c.moego_tags ?? null) === tags && (c.moego_notes ?? null) === notes) { unchanged++; continue; }
  updates.push({ id: c.id, tags, notes, who });
}

console.log(`would write   : ${updates.length}`);
console.log(`already right : ${unchanged}`);
console.log(`AMBIGUOUS     : ${ambiguous.length}  (skipped — would risk the wrong client)`);
console.log(`unmatched     : ${unmatched.length}`);
console.log(`CARD NOTES    : ${cardNotes.length}  (note dropped — delete these in MoeGo)`);
if (cardNotes.length) { console.log("\n  notes holding a card number, NOT imported:"); for (const c of cardNotes) console.log("   ", c); }
if (ambiguous.length) { console.log("\n  ambiguous:"); for (const a of ambiguous.slice(0, 15)) console.log("   ", a); }
if (unmatched.length) { console.log("\n  unmatched (first 10):"); for (const u of unmatched.slice(0, 10)) console.log("   ", u); }
console.log("\n  first 10 to write:");
for (const u of updates.slice(0, 10)) console.log(`   #${u.id} ${u.who.padEnd(24)} tags=${JSON.stringify(u.tags)} notes=${JSON.stringify((u.notes ?? "").slice(0, 40))}`);

if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); await db.end(); process.exit(0); }

await db.beginTransaction();
try {
  for (const u of updates) {
    const [res] = await db.query<any>(
      `UPDATE clients SET moego_tags = ?, moego_notes = ?, updated_at = NOW() WHERE id = ? AND tenant_id = 1`,
      [u.tags, u.notes, u.id],
    );
    if (res.affectedRows !== 1) throw new Error(`client ${u.id}: expected 1 row, got ${res.affectedRows}`);
  }
  await db.commit();
  console.log(`\nCOMMITTED. ${updates.length} clients updated.`);
} catch (error) {
  await db.rollback();
  console.error("\nROLLED BACK — nothing changed:", (error as Error).message);
  process.exitCode = 1;
}
await db.end();
