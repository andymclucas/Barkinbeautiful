/**
 * One real counter sale, on Andy's own client record, then void it.
 *
 * Runs the REAL tRPC procedure through createCaller — same input
 * validation, same middleware, same transaction — against the live
 * database, because the hermetic suite has no database and so cannot
 * tell you whether the transaction commits.
 *
 * Client 1162 is Andy's own record (see .claude/skills/test-on-andys-account).
 * Never point this at a paying client.
 *
 *   corepack pnpm exec tsx scripts/verify-counter-sale.ts          # read only
 *   corepack pnpm exec tsx scripts/verify-counter-sale.ts --apply  # sells, then voids
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { appRouter } from "../server/routers";

const APPLY = process.argv.includes("--apply");
const CLIENT_ID = 1162; // Andy McLucas
const PRODUCT_ID = 66; // Treats - Duck Feet, $2.00

const ctx = {
  user: { id: 30001, role: "admin", email: "mclucas.andy@gmail.com" },
  tenantId: 1,
} as any;

async function db() {
  return mysql.createConnection({
    uri: process.env.DATABASE_URL!,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });
}

async function snapshot(c: any) {
  const [[product]] = await c.query(
    "SELECT id, name, price_aud, stock_qty FROM retail_products WHERE id = ?",
    [PRODUCT_ID]
  );
  const [[counts]] = await c.query(
    `SELECT COUNT(*) AS invoices FROM invoices WHERE client_id = ? AND appointment_id IS NULL`,
    [CLIENT_ID]
  );
  return {
    stock: Number(product.stock_qty),
    price: product.price_aud,
    name: product.name,
    invoices: Number(counts.invoices),
  };
}

(async () => {
  const c = await db();
  const before = await snapshot(c);
  console.log("BEFORE:", before);

  if (!APPLY) {
    console.log(
      "\nDry run. Would sell 1 x",
      before.name,
      "to client",
      CLIENT_ID,
      "for cash, then void it."
    );
    await c.end();
    return;
  }

  const caller = appRouter.createCaller(ctx);

  console.log("\n— selling —");
  const sale = await caller.counterSale.sell({
    clientId: CLIENT_ID,
    lines: [{ retailProductId: PRODUCT_ID, quantity: 1 }],
    paymentMethod: "cash",
    note: "Verification sale — voided immediately",
  });
  console.log(sale);

  const [[invoice]] = await c.query<any[]>(
    `SELECT id, invoice_number, client_id, appointment_id, membership_id, subtotal, tax_amount, total,
            status, payment_method, paid_at, notes
       FROM invoices WHERE id = ?`,
    [sale.invoiceId]
  );
  const [lines] = await c.query<any[]>(
    `SELECT id, description, quantity, unit_price, line_total, product_id
       FROM invoice_line_items WHERE invoice_id = ?`,
    [sale.invoiceId]
  );
  const afterSale = await snapshot(c);
  console.log("\nINVOICE:", invoice);
  console.log("LINES:", lines);
  console.log("AFTER SALE:", afterSale);

  const checks: Array<[string, boolean]> = [
    ["invoice exists", Boolean(invoice)],
    ["no appointment behind it", invoice.appointment_id === null],
    ["no membership behind it", invoice.membership_id === null],
    ["marked paid", invoice.status === "paid"],
    ["method recorded as cash", invoice.payment_method === "cash"],
    ["paid_at set", invoice.paid_at !== null],
    [
      "total matches the shelf price",
      Number(invoice.total) === Number(before.price),
    ],
    [
      "total equals subtotal, no tax",
      Number(invoice.total) === Number(invoice.subtotal) &&
        Number(invoice.tax_amount) === 0,
    ],
    [
      "one line, naming the product",
      (lines as any[]).length === 1 &&
        (lines as any[])[0].product_id === PRODUCT_ID,
    ],
    [
      "line total matches the invoice",
      Number((lines as any[])[0].line_total) === Number(invoice.total),
    ],
    ["stock fell by one", afterSale.stock === before.stock - 1],
    [
      "it is a new bill, not a reused one",
      afterSale.invoices === before.invoices + 1,
    ],
  ];

  console.log("\n— voiding —");
  const voided = await caller.counterSale.voidSale({
    invoiceId: sale.invoiceId,
    reason: "verification",
  });
  console.log(voided);

  const [[afterVoidInvoice]] = await c.query<any[]>(
    "SELECT status, paid_at, notes FROM invoices WHERE id = ?",
    [sale.invoiceId]
  );
  const afterVoid = await snapshot(c);
  console.log("\nAFTER VOID:", { invoice: afterVoidInvoice, ...afterVoid });

  checks.push(
    ["void cancelled the bill", afterVoidInvoice.status === "cancelled"],
    ["void cleared paid_at", afterVoidInvoice.paid_at === null],
    [
      "void said who and why",
      String(afterVoidInvoice.notes).includes("Voided by"),
    ],
    ["stock back where it started", afterVoid.stock === before.stock],
    [
      "the bill is still there to audit",
      afterVoid.invoices === before.invoices + 1,
    ]
  );

  console.log("\n— results —");
  let failed = 0;
  for (const [what, ok] of checks) {
    if (!ok) failed += 1;
    console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  }
  console.log(`\n${checks.length - failed}/${checks.length} passed`);
  await c.end();
  process.exit(failed === 0 ? 0 : 1);
})();
