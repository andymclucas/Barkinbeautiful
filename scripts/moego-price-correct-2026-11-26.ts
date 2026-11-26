/**
 * Correct next week's prices from the service MoeGo actually has booked.
 *
 * Andy, 26/11/2026: "Use MoeGo's prices". Lauren had caught Cocoa at $88 in
 * Groomigo against MoeGo's "Diamond - Gold (up to 6wks) SML-10kg Full Groom
 * Classic $110" — the earlier fill (price-imported-bookings-2026-11-26.ts)
 * priced from what each dog last paid, which is not what MoeGo books.
 *
 *   corepack pnpm exec tsx scripts/moego-price-correct-2026-11-26.ts <moego.tsv> --backup-in <first-write-backup.json> --out <plan.csv> [--apply --backup <file.json>]
 *
 * <moego.tsv>: MoeGo's Appointment schedules report rows, one per line:
 * "<booking id> <DD/MM/YYYY> <hh:mm AM> <pet names> <services> <status>".
 *
 * MoeGo names a service by membership tier, size and cut. The tier maps
 * exactly onto Pricing & Services (memory: moego-is-the-pricing-source-of-
 * truth — "Diamond - Gold (up to 6wks)" = VIP, "Bronze (8wks)" = Regular,
 * "Casual / NEW customer" = New), and since 13/10/2026 the two lists agree on
 * every tier, cut and band. So each dog's price is the Groomigo catalogue row
 * for its MoeGo service. Add-ons (Anal Glands, Teeth Brushing) are not part
 * of the groom price and are left alone.
 *
 * Which rows it changes, and only these:
 *  - still blank (NULL or 0), or
 *  - still holding exactly what the first write put there (from that
 *    write's backup and suggestion), i.e. nobody has touched it since.
 * A price Lauren or anyone else typed is reported, never overwritten.
 * Member bookings are never touched.
 */
import { readFileSync, writeFileSync } from "node:fs";
import mysql from "mysql2/promise";

const args = process.argv.slice(2);
const argOf = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes("--apply");
const tsv = args.find((a) => a.endsWith(".tsv"));
const backupIn = argOf("--backup-in");
const out = argOf("--out") ?? "moego-price-plan.csv";
const backupOut = argOf("--backup");
if (!tsv || !backupIn) throw new Error("usage: <moego.tsv> --backup-in <json> [--out csv] [--apply --backup json]");
if (APPLY && !backupOut) throw new Error("--apply needs --backup");

const MAIN = /(Diamond|Bronze|Casual|Bath -|Quick Bath|Tidy|De-shed|Nail Clipping|DAY CARE)/i;

type Mapped = { catalogue: string; price: number; serviceType: string } | { hold: string };

/** MoeGo service name → Pricing & Services row name. */
function catalogueNameFor(service: string): { name: string; serviceType: string } | { hold: string } {
  const s = service.trim();
  const low = s.toLowerCase();
  if (/day care/i.test(s)) return { hold: "day care" };
  if (/^nail clipping/i.test(s)) return { name: "Nail Clipping", serviceType: "nail_trim" };
  if (/^de-shed - 1 hour/i.test(s)) return { name: "De-shed - 1 hour, small dog or shorter double coat", serviceType: "deshed" };
  if (/^de-shed - 2 hour/i.test(s)) return { name: "De-shed - 2 hour, longer hair breed", serviceType: "deshed" };
  if (/^de-shed - 3 hour/i.test(s)) return { name: "De-shed - 3 hour, large long-haired breed", serviceType: "deshed" };
  if (/^quick bath - small to medium/i.test(s)) return { name: "Quick Clean (Towel Dry) - Small to Medium", serviceType: "bath_only" };
  if (/^bath - small$/i.test(s)) return { name: "Bath & Blow-dry - Small", serviceType: "bath_only" };
  if (/^bath - medium$/i.test(s)) return { name: "Bath & Blow-dry - Medium", serviceType: "bath_only" };
  if (/^bath - large$/i.test(s)) return { name: "Bath & Blow-dry - Large", serviceType: "bath_only" };
  if (/^tidy - small size or short hair/i.test(s)) return { name: "Tidy - Small, short hair", serviceType: "fft" };
  if (/^tidy - medium size or long hair/i.test(s)) return { name: "Tidy - Medium, long hair", serviceType: "fft" };

  const tier = /^diamond/i.test(s) ? "VIP Client" : /^bronze/i.test(s) ? "Regular Client" : /^casual/i.test(s) ? "New Client" : null;
  if (!tier) return { hold: `unknown MoeGo service "${s}"` };
  const styled = /style/i.test(s);
  const band =
    /xl\s*26-34|xlarge\s*26-34/i.test(s) ? "Extra Large" :
    /(la|large)\s*17-25/i.test(s) ? "Large" :
    /med\s*14-17/i.test(s) ? "Medium" :
    /11-13\s*kg/i.test(s) ? "Small-Medium" :
    /(sml|small)\s*-?\s*10\s*kg/i.test(low) ? "Small" : null;
  if (!band) return { hold: `no size in "${s}"` };
  const cut = styled ? "Styled" : "Classic";
  return { name: `Full Groom (${cut}) - ${tier} - ${band}`, serviceType: styled ? "styled_groom" : "classic_groom" };
}

function parseLine(line: string) {
  const m = /^(\d+) (\d\d)\/(\d\d)\/(\d{4}) (\d\d:\d\d [AP]M) (.*) (Unconfirmed|Confirmed|Finished|Ready|Checked in)$/.exec(line.trim());
  if (!m) return null;
  const [, id, dd, mm, yyyy, , rest, status] = m;
  const at = rest.search(MAIN);
  if (at <= 0) return null;
  const pets = rest.slice(0, at).trim().split(/,\s*/).filter(Boolean);
  const services = rest.slice(at).split(/,\s*(?=[A-Z])/).map((x) => x.trim()).filter(Boolean);
  return { id, date: `${yyyy}-${mm}-${dd}`, pets, mains: services.filter((x) => MAIN.test(x) && !/^Styled Groom EXTRA/i.test(x)), services, status };
}

async function main() {
  const c = await mysql.createConnection({ uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true } });
  const [cat] = await c.query("SELECT name, price_aud FROM pricing_services WHERE tenant_id=1 AND catalogue_type='service' AND is_active=1") as unknown as [Array<{ name: string; price_aud: string | null }>];
  const priceByName = new Map(cat.map((r) => [r.name.trim(), r.price_aud === null ? null : Number(r.price_aud)]));
  const map = (service: string): Mapped => {
    const n = catalogueNameFor(service);
    if ("hold" in n) return n;
    const p = priceByName.get(n.name);
    return p == null ? { hold: `no catalogue price for "${n.name}"` } : { catalogue: n.name, price: p, serviceType: n.serviceType };
  };

  // What the first write put on each row: its suggestion, and the value before it.
  const firstBackup = new Map((JSON.parse(readFileSync(backupIn!, "utf8")) as Array<{ id: number; price: string | null }>).map((b) => [b.id, b.price]));
  const firstCsv = readFileSync(backupIn!.replace("price-backup-nextweek", "price-suggestions-nextweek").replace(/\.json$/, ".csv"), "utf8").trim().split("\n");
  const hdr = firstCsv[0].split(",");
  const written = new Map<number, number>();
  for (const line of firstCsv.slice(1)) {
    const f = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((x) => x.replace(/,$/, "").replace(/^"|"$/g, ""));
    const id = Number(f[hdr.indexOf("appointment")]);
    if (firstBackup.has(id)) written.set(id, Number(f[hdr.indexOf("suggested")]));
  }

  const rows = readFileSync(tsv!, "utf8").split("\n").map(parseLine).filter((r): r is NonNullable<ReturnType<typeof parseLine>> => r !== null);
  const ids = rows.map((r) => r.id);
  const [appts] = await c.query(`SELECT a.id, a.moego_appointment_id mid, a.price, a.membership_id, a.service_type, p.name pet
    FROM appointments a JOIN pets p ON p.id=a.pet_id
    WHERE a.tenant_id=1 AND a.moego_appointment_id IN (?) AND a.workflow_state NOT IN ('cancelled','no_show') AND a.status<>'cancelled'`, [ids]) as unknown as [Array<{ id: number; mid: string; price: string | null; membership_id: number | null; service_type: string; pet: string }>];

  // Dogs on a live plan: a membership groom carries no price, even when the
  // booking was never linked to the plan. Held for a person to link.
  const [plan] = await c.query(`SELECT m.pet_id pid FROM memberships m WHERE m.tenant_id=1 AND m.is_test=0 AND m.status IN ('active','paused','pending_payment') AND m.pet_id IS NOT NULL
    UNION SELECT mp.pet_id FROM membership_pets mp JOIN memberships m ON m.id=mp.membership_id WHERE m.tenant_id=1 AND m.is_test=0 AND m.status IN ('active','paused','pending_payment')`) as unknown as [Array<{ pid: number }>];
  const onPlan = new Set(plan.map((p) => p.pid));
  const [petOf] = await c.query("SELECT id, pet_id FROM appointments WHERE id IN (?)", [appts.map((a) => a.id).concat([0])]) as unknown as [Array<{ id: number; pet_id: number }>];
  const petIdOf = new Map(petOf.map((r) => [r.id, r.pet_id]));

  type Line = { date: string; booking: string; appt: number | ""; pet: string; moego: string; catalogue: string; moegoPrice: string; current: string; action: string; note: string };
  const lines: Line[] = [];

  for (const r of rows) {
    const group = appts.filter((a) => a.mid === r.id);
    if (group.length === 0) { lines.push({ date: r.date, booking: r.id, appt: "", pet: r.pets.join("/"), moego: r.mains.join(" + "), catalogue: "", moegoPrice: "", current: "", action: "report", note: "not in Groomigo" }); continue; }
    for (const a of group) {
      const base = { date: r.date, booking: r.id, appt: a.id, pet: a.pet, current: a.price ?? "" };
      if (a.membership_id !== null) { lines.push({ ...base, moego: "", catalogue: "", moegoPrice: "", action: "skip", note: "member booking" }); continue; }
      if (onPlan.has(petIdOf.get(a.id) ?? -1)) { lines.push({ ...base, moego: r.mains.join(" + "), catalogue: "", moegoPrice: "", action: "hold", note: "dog is on a membership but the booking is not linked to it" }); continue; }
      // Which MoeGo service is this dog's?
      let service: string | null = null;
      const distinct = Array.from(new Set(r.mains));
      if (distinct.length === 1) service = distinct[0];
      else if (r.mains.length === r.pets.length) {
        // Different services on a multi-dog booking: match on the cut Groomigo
        // holds for this dog; position alone is not trusted (sync Trap 3).
        const sameCut = r.mains.filter((s) => { const m = map(s); return "serviceType" in m && m.serviceType === a.service_type; });
        const uniq = Array.from(new Set(sameCut));
        if (uniq.length === 1) service = uniq[0];
        else { lines.push({ ...base, moego: r.mains.join(" + "), catalogue: "", moegoPrice: "", action: "hold", note: "several services on the booking; cannot tell which is this dog's" }); continue; }
      } else { lines.push({ ...base, moego: r.mains.join(" + "), catalogue: "", moegoPrice: "", action: "hold", note: `${r.pets.length} dogs, ${r.mains.length} services` }); continue; }

      const m = map(service);
      if ("hold" in m) { lines.push({ ...base, moego: service, catalogue: "", moegoPrice: "", action: "hold", note: m.hold }); continue; }
      const cur = a.price === null ? null : Number(a.price);
      const blank = cur === null || cur === 0;
      const mine = written.has(a.id) && cur === written.get(a.id);
      let action = "ok", note = "";
      if (cur === m.price) action = "ok";
      else if (blank) action = "fill";
      else if (mine) { action = "correct"; note = `first write put $${cur?.toFixed(2)}`; }
      else { action = "report"; note = written.has(a.id) ? "changed since the first write: left alone" : "priced before today: left alone"; }
      lines.push({ ...base, moego: service, catalogue: m.catalogue, moegoPrice: m.price.toFixed(2), action, note });
    }
  }

  const esc = (v: unknown) => { const t = String(v ?? ""); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const cols: (keyof Line)[] = ["date", "booking", "appt", "pet", "moego", "catalogue", "moegoPrice", "current", "action", "note"];
  writeFileSync(out, [cols.join(","), ...lines.sort((x, y) => x.date.localeCompare(y.date)).map((l) => cols.map((k) => esc(l[k])).join(","))].join("\n") + "\n");
  const count = (a: string) => lines.filter((l) => l.action === a).length;
  console.log(JSON.stringify({ moegoBookings: rows.length, ok: count("ok"), correct: count("correct"), fill: count("fill"), hold: count("hold"), report: count("report"), memberSkip: count("skip"), csv: out }));

  if (!APPLY) { await c.end(); return; }
  const todo = lines.filter((l) => l.action === "correct" || l.action === "fill");
  writeFileSync(backupOut!, JSON.stringify(todo.map((l) => ({ id: l.appt, price: l.current === "" ? null : l.current })), null, 2));
  await c.beginTransaction();
  try {
    for (const l of todo) {
      const [res] = l.current === "" || Number(l.current) === 0
        ? await c.query("UPDATE appointments SET price=?, gross_price=? WHERE id=? AND tenant_id=1 AND membership_id IS NULL AND (price IS NULL OR price=0)", [l.moegoPrice, l.moegoPrice, l.appt])
        : await c.query("UPDATE appointments SET price=?, gross_price=? WHERE id=? AND tenant_id=1 AND membership_id IS NULL AND price=?", [l.moegoPrice, l.moegoPrice, l.appt, l.current]);
      if ((res as { affectedRows: number }).affectedRows !== 1) throw new Error(`appointment ${l.appt} changed under us; nothing written`);
    }
    await c.commit();
    console.log(`written ${todo.length}; backup ${backupOut}`);
  } catch (e) { await c.rollback(); throw e; } finally { await c.end(); }
}

main().catch((e) => { console.error(e); process.exit(1); });
