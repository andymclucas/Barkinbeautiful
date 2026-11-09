import "dotenv/config";
import mysql from "mysql2/promise";
import { liveSiblings, columnCardMembers, sameColumnSiblings } from "../shared/bookingSiblings";
import { formatSharedAppointmentName, formatFamilyBookingLine } from "../shared/appointmentDisplay";

const DAY = process.argv[2] ?? "2026-11-11";
/**
 * `--sweep` checks every day that has appointments instead of one, and
 * prints only the days with an anomaly plus a total. A dog named on no
 * card is the worst thing this board can do — Minnie Condon and Jamie
 * Speck were both invisible — so the sweep is the check that matters.
 */
const SWEEP = process.argv.includes("--sweep");

(async () => {
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL,
    ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    timezone: "Z",
  });
  const [rows] = await c.query<any[]>(
    SWEEP
    ? `SELECT a.id, a.session_id sessionId, a.staff_id staffId, a.service_type serviceType,
            a.workflow_state workflowState, a.status,
            DATE_FORMAT(a.scheduled_start,'%Y-%m-%dT%H:%i:%sZ') scheduledStart,
            DATE_FORMAT(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00'),'%H:%i') bne,
            DATE_FORMAT(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00'),'%Y-%m-%d') day,
            p.name petName, cl.last_name clientLastName, s.name staffName
       FROM appointments a
       JOIN pets p ON p.id = a.pet_id
       JOIN clients cl ON cl.id = a.client_id
       LEFT JOIN staff s ON s.id = a.staff_id
      ORDER BY a.scheduled_start, a.id`
    : `SELECT a.id, a.session_id sessionId, a.staff_id staffId, a.service_type serviceType,
            a.workflow_state workflowState, a.status,
            DATE_FORMAT(a.scheduled_start,'%Y-%m-%dT%H:%i:%sZ') scheduledStart,
            DATE_FORMAT(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00'),'%H:%i') bne,
            DATE_FORMAT(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00'),'%Y-%m-%d') day,
            p.name petName, cl.last_name clientLastName, s.name staffName
       FROM appointments a
       JOIN pets p ON p.id = a.pet_id
       JOIN clients cl ON cl.id = a.client_id
       LEFT JOIN staff s ON s.id = a.staff_id
      WHERE DATE(CONVERT_TZ(a.scheduled_start,'+00:00','+10:00')) = ?
      ORDER BY a.scheduled_start, a.id`,
    SWEEP ? [] : [DAY],
  );
  await c.end();

  if (SWEEP) {
    const days = new Map<string, any[]>();
    for (const r of rows) days.set(r.day, [...(days.get(r.day) ?? []), r]);
    let drawnTwice = 0, namedNowhere = 0, split = 0, cards = 0;
    for (const [day, dayRows] of [...days].sort()) {
      const sMap = new Map<string, any[]>();
      for (const r of dayRows) if (r.sessionId) sMap.set(r.sessionId, [...(sMap.get(r.sessionId) ?? []), r]);
      const sibs = (a: any) => (a.sessionId ? liveSiblings(a, sMap.get(a.sessionId) ?? []) : []);
      const hasDay = dayRows.some((r) => r.serviceType === "daycare");
      const key = (r: any) => (hasDay && r.serviceType === "daycare" ? "Daycare" : r.staffName ?? "Unassigned");
      const cols = new Map<string, any[]>();
      for (const r of dayRows) cols.set(key(r), [...(cols.get(key(r)) ?? []), r]);
      const seen = new Set<number>();
      const twice: number[] = [];
      for (const [, colAppts] of cols) {
        const cm = columnCardMembers(colAppts);
        for (const a of colAppts.filter((x) => !x.sessionId || cm.has(x.id))) {
          cards++;
          const members = [a, ...(cm.get(a.id) ?? [])];
          if (sibs(a).length + 1 > members.length) split++;
          for (const m of members) {
            if (seen.has(m.id)) twice.push(m.id);
            seen.add(m.id);
          }
        }
      }
      const missing = dayRows.filter((r) => !seen.has(r.id));
      drawnTwice += twice.length;
      namedNowhere += missing.length;
      if (twice.length || missing.length) {
        console.log(`${day}: ${twice.length} drawn twice ${twice.join(",")} | ${missing.length} named nowhere ${missing.map((m) => `${m.id} ${m.petName}`).join(", ")}`);
      }
    }
    console.log(`\nSWEEP: ${days.size} days, ${rows.length} appointments, ${cards} cards`);
    console.log(`  drawn twice: ${drawnTwice}`);
    console.log(`  named nowhere: ${namedNowhere}`);
    console.log(`  cards whose name narrowed to its own column: ${split}`);
    return;
  }

  const sessionMap = new Map<string, any[]>();
  for (const r of rows) if (r.sessionId) sessionMap.set(r.sessionId, [...(sessionMap.get(r.sessionId) ?? []), r]);
  const getSiblings = (a: any) => (a.sessionId ? liveSiblings(a, sessionMap.get(a.sessionId) ?? []) : []);

  // Columns, the way the board builds them: daycare first, then staff, then Unassigned.
  const hasDaycare = rows.some((r) => r.serviceType === "daycare");
  const colKey = (r: any) =>
    hasDaycare && r.serviceType === "daycare" ? "Daycare" : r.staffName ?? "— Unassigned —";
  const columns = new Map<string, any[]>();
  for (const r of rows) columns.set(colKey(r), [...(columns.get(colKey(r)) ?? []), r]);

  let splitCards = 0;
  for (const [name, colAppts] of [...columns].sort()) {
    const cardMembers = columnCardMembers(colAppts);
    const drawn = colAppts.filter((a) => !a.sessionId || cardMembers.has(a.id));
    console.log(`\n### ${name}  (${colAppts.length} appts → ${drawn.length} cards)`);
    for (const a of drawn) {
      const members = [a, ...(cardMembers.get(a.id) ?? [])];
      const booking = [a, ...getSiblings(a)];
      const before = formatSharedAppointmentName({
        petNames: booking.sort((x, y) => x.id - y.id).map((p) => p.petName),
        surname: a.clientLastName,
      });
      const after = formatSharedAppointmentName({
        petNames: members.sort((x, y) => x.id - y.id).map((p) => p.petName),
        surname: a.clientLastName,
      });
      const line = booking.length > 1
        ? "  " + formatFamilyBookingLine({ onThisCard: members.length, inBooking: booking.length })
        : "";
      const changed = before !== after;
      if (changed) splitCards++;
      console.log(`  ${a.bne}  ${changed ? "FIXED" : "     "}  ${after}${line}${changed ? `   (was: ${before})` : ""}`);
    }
  }
  // Every dog must be drawn exactly once across the whole board.
  const allDrawn = new Set<number>();
  for (const [, colAppts] of columns) {
    const cm = columnCardMembers(colAppts);
    for (const a of colAppts.filter((x) => !x.sessionId || cm.has(x.id))) {
      for (const m of [a, ...(cm.get(a.id) ?? [])]) {
        if (allDrawn.has(m.id)) console.log(`!! DRAWN TWICE: ${m.id} ${m.petName}`);
        allDrawn.add(m.id);
      }
    }
  }
  const missing = rows.filter((r) => !allDrawn.has(r.id));
  console.log(`\n${rows.length} dogs on ${DAY}; ${allDrawn.size} named on a card; ${missing.length} named nowhere`);
  if (missing.length) console.log("MISSING:", missing.map((m) => `${m.id} ${m.petName}`).join(", "));
  console.log(`${splitCards} cards had their name corrected`);
})();
