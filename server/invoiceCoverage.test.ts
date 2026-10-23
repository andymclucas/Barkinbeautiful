import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { countInvoicesCovering } from "./invoiceCoverage";
import { invoices, invoiceAppointments } from "../drizzle/schema";

/**
 * A stub of the one drizzle shape this helper uses:
 * `db.select({...}).from(table).where(...)` resolving to rows.
 * It answers per table, so a helper that forgot a source reads 0 for it.
 */
function stubDb(counts: { viaJoin?: number; viaColumn?: number }) {
  const asked: string[] = [];
  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: async () => {
          if (table === invoiceAppointments) { asked.push("join"); return [{ n: counts.viaJoin ?? 0 }]; }
          if (table === invoices) { asked.push("column"); return [{ n: counts.viaColumn ?? 0 }]; }
          throw new Error("unexpected table");
        },
      }),
    }),
  };
  return { db, asked };
}

describe("countInvoicesCovering", () => {
  it("counts a combined invoice, which has no appointment_id at all", () => {
    // The bug this helper exists for. A combined bill links through
    // invoice_appointments and leaves invoices.appointment_id NULL, so
    // counting the column alone returns 0 and the dog is billed twice.
    return countInvoicesCovering(stubDb({ viaJoin: 1, viaColumn: 0 }).db, 2430012)
      .then((n) => expect(n).toBe(1));
  });

  it("still counts a single-dog invoice linked by the old column", async () => {
    expect(await countInvoicesCovering(stubDb({ viaJoin: 0, viaColumn: 1 }).db, 1)).toBe(1);
  });

  it("adds both, so a booking billed each way is not seen as unbilled", async () => {
    expect(await countInvoicesCovering(stubDb({ viaJoin: 1, viaColumn: 1 }).db, 1)).toBe(2);
  });

  it("reads zero for an appointment nobody has billed", async () => {
    expect(await countInvoicesCovering(stubDb({}).db, 1)).toBe(0);
  });

  it("asks both sources every time", async () => {
    const { db, asked } = stubDb({ viaJoin: 1 });
    await countInvoicesCovering(db, 1);
    // Short-circuiting on a non-zero join count would make the legacy
    // column unreachable, which is how the first source got forgotten.
    expect(asked.sort()).toEqual(["column", "join"]);
  });

  it("copes with a driver that returns strings or no row", async () => {
    expect(await countInvoicesCovering(stubDb({ viaJoin: "2" as any }).db, 1)).toBe(2);
    const empty = { select: () => ({ from: () => ({ where: async () => [] }) }) };
    expect(await countInvoicesCovering(empty, 1)).toBe(0);
  });
});

/**
 * A delegation check, not a behaviour grep: it proves every billing path
 * asks the shared helper rather than counting invoices itself. It counts
 * occurrences so it fails when a path stops delegating or a new one
 * arrives — see CLAUDE.md §7.
 */
describe("every billing path asks the shared helper", () => {
  const source = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

  it("has one decision site per helper call", () => {
    const decisions = source.match(/existingInvoiceCount:/g) ?? [];
    const delegations = source.match(/countInvoicesCovering\(db,/g) ?? [];
    expect(decisions.length).toBe(3);
    expect(delegations.length).toBe(decisions.length);
  });

  it("counts invoices nowhere but the helper", () => {
    // Any reintroduced inline count is a path that cannot see a
    // combined invoice.
    const inline = source.match(/from\(invoices\)\s*\.where\(eq\(invoices\.appointmentId/g) ?? [];
    expect(inline).toEqual([]);
  });
});
