import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/mysql-core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { appointments } from "../drizzle/schema";
import { APPOINTMENTS_TENANT_DATE_INDEX } from "./appointmentIndexHints";

describe("appointmentsByDate index hint", () => {
  it("names an index the schema still defines, on tenant then date", () => {
    const index = getTableConfig(appointments).indexes.find((i) => i.config.name === APPOINTMENTS_TENANT_DATE_INDEX);
    expect(index).toBeDefined();
    expect(index!.config.columns.map((c) => ("name" in c ? c.name : ""))).toEqual(["tenant_id", "scheduled_start"]);
  });

  it("is used by every salon-and-date query it was added to", () => {
    // Delegation count, not behaviour: if one of these drops the hint, the
    // planner is free to go back to scanning every salon's bookings.
    const source = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    // 21 since 27/11/2026: staff.publicHolidays counts dogs per holiday.
    expect(source.match(/\.from\(appointments, appointmentsByDate\)/g)?.length).toBe(21);
    // The board's change check moved to server/liveBoard.ts (23/11/2026).
    const live = readFileSync(resolve(process.cwd(), "server/liveBoard.ts"), "utf8");
    expect(live.match(/\.from\(appointments, appointmentsByDate\)/g)?.length).toBe(1);
  });
});
