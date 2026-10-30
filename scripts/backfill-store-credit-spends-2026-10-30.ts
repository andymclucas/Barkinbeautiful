/**
 * Write the ledger debits for store credit that was already spent.
 *
 * Until 30/10/2026 choosing "store credit" on the payment panel wrote an
 * `appointment_payments` row and never touched the balance, so the
 * ledger overstated what each client had left. The code now writes both
 * halves (shared/storeCreditSpend.ts); these three payments predate it.
 *
 *   corepack pnpm exec tsx scripts/backfill-store-credit-spends-2026-10-30.ts
 *   corepack pnpm exec tsx scripts/backfill-store-credit-spends-2026-10-30.ts --apply
 *
 * It derives the entries from `appointment_payments` rather than taking
 * a hardcoded list, so it cannot drift from what was actually taken, and
 * it skips any payment that already has a matching debit — safe to re-run.
 *
 * One client's balance goes NEGATIVE as a result. That is the honest
 * answer and the reason this is worth doing: credit was spent that this
 * system had no record of, and a negative balance says so rather than
 * hiding it. Andy approved both on 30/10/2026.
 */
import "dotenv/config";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../server/db";
import { appointmentPayments, storeCreditTransactions, clients } from "../drizzle/schema";
import { creditEntryForPayment } from "../shared/storeCreditSpend";

const APPLY = process.argv.includes("--apply");
const TENANT = 1;

(async () => {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  const spends = await db
    .select({
      id: appointmentPayments.id,
      appointmentId: appointmentPayments.appointmentId,
      clientId: appointmentPayments.clientId,
      amount: appointmentPayments.amount,
      method: appointmentPayments.method,
    })
    .from(appointmentPayments)
    .where(eq(appointmentPayments.method, "store_credit"));

  if (spends.length === 0) {
    console.log("No store-credit payments found. Nothing to do.");
    return;
  }

  // Which of them already have a debit, so a re-run is a no-op.
  const existing = await db
    .select({
      appointmentId: storeCreditTransactions.appointmentId,
      clientId: storeCreditTransactions.clientId,
      amount: storeCreditTransactions.amount,
    })
    .from(storeCreditTransactions)
    .where(and(
      eq(storeCreditTransactions.tenantId, TENANT),
      inArray(storeCreditTransactions.appointmentId, spends.map((s: any) => s.appointmentId)),
    ));
  const done = new Set(existing.map((e: any) => `${e.clientId}|${e.appointmentId}`));

  const names = new Map<number, string>();
  for (const row of await db
    .select({ id: clients.id, first: clients.firstName, last: clients.lastName })
    .from(clients)
    .where(inArray(clients.id, spends.map((s: any) => s.clientId)))) {
    names.set((row as any).id, `${(row as any).first ?? ""} ${(row as any).last ?? ""}`.trim());
  }

  const planned: any[] = [];
  for (const s of spends as any[]) {
    if (done.has(`${s.clientId}|${s.appointmentId}`)) {
      console.log(`skip  payment ${s.id} — appointment ${s.appointmentId} already has a ledger entry`);
      continue;
    }
    const entry = creditEntryForPayment({
      method: s.method,
      amount: Number(s.amount),
      appointmentId: s.appointmentId,
    });
    if (!entry) continue;
    planned.push({
      tenantId: TENANT,
      clientId: s.clientId,
      amount: entry.amount,
      type: entry.type,
      appointmentId: s.appointmentId,
      note: `${entry.note}. Backfilled on 30/10/2026 for a payment taken before the balance was kept in step.`,
    });
    console.log(`plan  ${names.get(s.clientId) ?? s.clientId}: ${entry.amount} against appointment ${s.appointmentId}`);
  }

  const before = new Map<number, number>();
  const after = new Map<number, number>();
  for (const clientId of new Set(spends.map((s: any) => s.clientId)) as Set<number>) {
    const rows = await db
      .select({ amount: storeCreditTransactions.amount })
      .from(storeCreditTransactions)
      .where(and(
        eq(storeCreditTransactions.tenantId, TENANT),
        eq(storeCreditTransactions.clientId, clientId),
      ));
    const bal = rows.reduce((t: number, r: any) => t + Number(r.amount), 0);
    before.set(clientId, bal);
    const delta = planned
      .filter((p) => p.clientId === clientId)
      .reduce((t, p) => t + Number(p.amount), 0);
    after.set(clientId, Math.round((bal + delta) * 100) / 100);
  }

  console.log("\nbalances:");
  for (const [clientId, bal] of before) {
    console.log(`  ${names.get(clientId) ?? clientId}: ${bal.toFixed(2)} -> ${(after.get(clientId) ?? bal).toFixed(2)}`);
  }

  if (planned.length === 0) {
    console.log("\nNothing outstanding — every store-credit payment already has its ledger entry.");
    return;
  }
  if (!APPLY) {
    console.log(`\nDRY RUN — ${planned.length} entries not written. Re-run with --apply.`);
    return;
  }

  await db.insert(storeCreditTransactions).values(planned);
  console.log(`\nwrote ${planned.length} ledger entries.`);

  for (const clientId of before.keys()) {
    const rows = await db
      .select({ amount: storeCreditTransactions.amount })
      .from(storeCreditTransactions)
      .where(and(
        eq(storeCreditTransactions.tenantId, TENANT),
        eq(storeCreditTransactions.clientId, clientId),
      ));
    const bal = rows.reduce((t: number, r: any) => t + Number(r.amount), 0);
    console.log(`  ${names.get(clientId) ?? clientId}: now ${bal.toFixed(2)}`);
  }
})().then(() => process.exit(0)).catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
