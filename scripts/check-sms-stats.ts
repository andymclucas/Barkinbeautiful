/**
 * Run sms.stats against the real database.
 *
 * The hermetic suite has no database, so it cannot catch a SQL error —
 * and this project has shipped two queries that threw on every call
 * because of exactly that (CLAUDE.md §6). Read-only.
 */
import "dotenv/config";
import { appRouter } from "../server/routers";

(async () => {
  const caller = appRouter.createCaller({
    user: { id: 30001, role: "admin", email: "mclucas.andy@gmail.com" },
    tenantId: 1,
  } as any);
  for (const days of [30, 7, 365]) {
    console.log(days + " days:", await caller.sms.stats({ days }));
  }
  console.log("default:", await caller.sms.stats());
  process.exit(0);
})();
