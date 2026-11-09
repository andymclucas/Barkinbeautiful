/**
 * What Next available offers against the REAL diary, read-only.
 *
 * Lauren, 10/11/2026: "can we adjust the times to our work hours, first
 * dogs 7:30, last booking come in at 1pm". The hermetic suite can prove
 * the slot list is 07:30–13:00; only the live diary can show what that
 * actually offers on a working week.
 */
import "dotenv/config";
import { appRouter } from "../server/routers";

(async () => {
  const caller = appRouter.createCaller({
    user: { id: 30001, role: "admin", email: "mclucas.andy@gmail.com" },
    tenantId: 1,
  } as any);

  for (const durationMinutes of [60, 120]) {
    const result = await caller.calendar.availability({
      durationMinutes,
      limit: 6,
      days: 60,
    });
    console.log(
      `\n${durationMinutes} minutes —`,
      JSON.stringify(result, null, 2).slice(0, 1200)
    );
    const slots: any[] =
      (result as any).slots ??
      (result as any).anyone?.slots ??
      (result as any).withUsual?.slots ??
      [];
    for (const slot of slots) {
      console.log(`  ${slot.date}  ${slot.time}  (+${slot.daysAhead}d)`);
    }
    const outside = slots.filter(
      (s: any) => s.time < "07:30" || s.time > "13:00"
    );
    console.log(
      outside.length === 0
        ? "  all inside 07:30–13:00"
        : `  OUTSIDE THE WINDOW: ${outside.map((s: any) => s.time).join(", ")}`
    );
  }
  process.exit(0);
})();
