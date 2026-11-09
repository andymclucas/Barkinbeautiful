/**
 * Did the verification sale land on the right Brisbane day?
 *
 * Read with DATE_FORMAT, not through the driver. mysql2 converts a
 * timestamp using the MACHINE clock on the way out, so a raw read of a
 * correctly stored row looks ten hours out on a Brisbane laptop — which
 * has already produced one wrong diagnosis of a timezone bug that did
 * not exist. See .claude/skills/test-on-andys-account.
 */
import "dotenv/config";
import mysql from "mysql2/promise";
import { appRouter } from "../server/routers";

(async () => {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL!,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });
  const [rows] = await c.query(
    `SELECT invoice_number, status,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s')                               AS created_utc,
            DATE_FORMAT(CONVERT_TZ(created_at,'+00:00','+10:00'), '%Y-%m-%d %H:%i:%s') AS created_bne,
            DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%d %H:%i:%s')                          AS now_utc,
            DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','+10:00'), '%Y-%m-%d %H:%i:%s') AS now_bne
       FROM invoices WHERE client_id = 1162 AND appointment_id IS NULL
       ORDER BY id DESC LIMIT 3`
  );
  console.table(rows);

  const caller = appRouter.createCaller({
    user: { id: 30001, role: "admin", email: "mclucas.andy@gmail.com" },
    tenantId: 1,
  } as any);
  const today = await caller.counterSale.forDay({});
  console.log("\ncounterSale.forDay says:", {
    day: today.day,
    takings: today.takings,
    sales: today.sales.map((s: any) => ({
      n: s.invoiceNumber,
      who: `${s.firstName} ${s.lastName}`,
      total: s.total,
      status: s.status,
    })),
  });
  await c.end();
  // The app's own pool stays open once getDb() has been touched, so the
  // process will not exit on its own. verify-counter-sale.ts does the same.
  process.exit(0);
})();
