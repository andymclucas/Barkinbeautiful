/**
 * DRY RUN — price the upcoming Groomigo rows that have no price at all.
 *
 * Uses only what has been proven today: MoeGo's Total price is the SUM
 * across the dogs on the booking. So
 *   - one dog on the booking  -> that dog's price IS the total
 *   - siblings already priced -> total less the siblings
 *   - all dogs share one service and all are unpriced -> total / n
 * Anything else is left for a human. Writes nothing.
 */
import "dotenv/config";
import fs from "fs";
import mysql from "mysql2/promise";

const S = "/private/tmp/claude-501/-Users-andymclucas-Documents-GitHub-Barkinbeautiful/9286693a-0e5b-4687-8bf9-8e4b2d7aa6b8/scratchpad";
const moego = Object.fromEntries(fs.readFileSync(S + "/moego/totals-2026-10-29.txt", "utf8").trim().split("\n")
  .map((l) => { const [id, t, n] = l.split("|"); return [id, { total: Number(t), pets: Number(n) }]; }));

(async () => {
  const c = await mysql.createConnection({ uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true }, timezone: "Z" });
  const [nulls] = await c.query<any[]>(
    `SELECT a.id, a.moego_appointment_id bid, p.name dog, cl.first_name, cl.last_name,
            DATE_FORMAT(CONVERT_TZ(a.scheduled_start,"+00:00","+10:00"),'%d/%m %H:%i') t
       FROM appointments a JOIN pets p ON p.id=a.pet_id JOIN clients cl ON cl.id=a.client_id
      WHERE a.price IS NULL AND a.moego_appointment_id IS NOT NULL
        AND a.workflow_state NOT IN ("cancelled","no_show")
        AND a.scheduled_start >= NOW()
      ORDER BY a.scheduled_start`);

  const ok: any[] = [], left: any[] = [];
  for (const r of nulls) {
    const mo = moego[r.bid];
    const who = `${r.first_name} ${r.last_name}`.trim();
    if (!mo) { left.push({ ...r, who, why: "booking is not in the MoeGo window — may be older or rescheduled out" }); continue; }
    if (mo.total <= 0) { ok.push({ ...r, who, price: "0.00", why: "MoeGo booking total is $0 — membership covers it" }); continue; }

    const [sibs] = await c.query<any[]>(
      `SELECT a.id, p.name dog, a.price FROM appointments a JOIN pets p ON p.id=a.pet_id
        WHERE a.moego_appointment_id=? AND a.workflow_state NOT IN ("cancelled","no_show")`, [r.bid]);
    if (sibs.length !== mo.pets) { left.push({ ...r, who, why: `Groomigo has ${sibs.length} dogs on this booking, MoeGo has ${mo.pets} — cannot reconcile` }); continue; }

    const others = sibs.filter((s) => s.id !== r.id);
    if (others.length === 0) { ok.push({ ...r, who, price: mo.total.toFixed(2), why: `only dog on the booking — the $${mo.total} total is this dog's price` }); continue; }

    const unpricedOthers = others.filter((s) => s.price === null);
    if (unpricedOthers.length === 0) {
      const share = Number((mo.total - others.reduce((n, s) => n + Number(s.price), 0)).toFixed(2));
      if (share > 0) { ok.push({ ...r, who, price: share.toFixed(2), why: `$${mo.total} total less ${others.map((s) => `${s.dog} $${s.price}`).join(" + ")}` }); continue; }
      left.push({ ...r, who, why: `siblings already account for the whole $${mo.total}` }); continue;
    }
    // Every dog on the booking is unpriced: an even split is only safe
    // when they are all the same service, which this file cannot see.
    if (unpricedOthers.length === others.length) {
      left.push({ ...r, who, why: `all ${sibs.length} dogs on this booking are unpriced — needs the service text to know whether $${mo.total} splits evenly` }); continue;
    }
    left.push({ ...r, who, why: `${unpricedOthers.length} of ${sibs.length} siblings also unpriced` });
  }

  console.log(`rows with no price: ${nulls.length}\n`);
  console.log(`CAN PRICE: ${ok.length}   ($${ok.reduce((n, r) => n + Number(r.price), 0).toFixed(2)})`);
  for (const r of ok) console.log(`  ${r.t}  ${String(r.who).padEnd(20)} ${String(r.dog).padEnd(12)} $${String(r.price).padStart(7)}   ${r.why}`);
  console.log(`\nNEEDS A HUMAN: ${left.length}`);
  for (const r of left) console.log(`  ${r.t}  ${String(r.who).padEnd(20)} ${String(r.dog).padEnd(12)} ${r.why}`);
  fs.writeFileSync(S + "/nulls-plan.json", JSON.stringify({ ok, left }, null, 1));
  await c.end();
})();
