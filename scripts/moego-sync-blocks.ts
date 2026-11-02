/**
 * Carry MoeGo's "Block time" entries across to Groomigo's roster.
 *
 * Andy, 02/11/2026: "Build the sync properly."
 *
 *   corepack pnpm exec tsx scripts/moego-sync-blocks.ts <file>           # dry run
 *   corepack pnpm exec tsx scripts/moego-sync-blocks.ts <file> --apply
 *
 * The file is one block per line, as MoeGo's AGENDA view prints them:
 *
 *   DD/MM|07:30am|05:30pm|away Sydney|Charlotte
 *
 * Use the agenda view and not the week list, because agenda is the only
 * one that puts a staff name against each block. Pull it the same way
 * the Monday sync pulls everything else — see
 * .claude/skills/moego-monday-sync/SKILL.md — and keep the year in mind:
 * MoeGo prints DD/MM, so `--year` says which one.
 *
 * ## Why this is not a straight copy
 *
 * **MoeGo's block feature is used for two different jobs.** Some blocks
 * are a person being away. Others are notes pinned to a day — "Desheds
 * day", "NO AIR CON OUT BACK", "last day". Blocking those would shut a
 * day the salon is busy on, which is worse than the gap this fixes.
 *
 * The reading is done by shared/moegoBlocks.ts, which has tests over
 * the real sweep. Only an `absence` is written. A `note` is skipped and
 * an `unclear` is printed for a human, because the cost of guessing
 * wrong is a dog turned away, and an apology does not put the dog back.
 *
 * ## Guards
 *
 * - Idempotent on (staff, date, window): re-running changes nothing.
 * - Never touches a blockout somebody entered by hand. Only rows this
 *   script wrote, tagged `group_id = "moego-sync"`, are its business.
 * - A staff name it cannot resolve stops that row, never the run, and
 *   is reported. moego_staff_aliases already holds the mappings that
 *   differ: "megan graham" is Megs Graham, "bather 1" is Stephanie.
 * - Blockouts never touch an appointment. Dogs already booked into a
 *   blocked window stay booked, and show as the clash they are.
 *
 * Run 02/11/2026 over docs/moego-blocks-2026-11-02.txt, the sweep from
 * that morning: 21 written, 5 skipped as notes, 1 unclear, 8 where the
 * note and the column name different people, 5 already there. A second
 * run straight afterwards wrote nothing, which is the idempotency
 * claim above actually checked rather than asserted.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import mysql from "mysql2/promise";
import { readBlockWithRoster, blockSubject, type MoegoBlock } from "@shared/moegoBlocks";
import { resolveMoegoStaff, normaliseStaffName } from "@shared/moegoStaffAlias";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FILE = args.find((a) => !a.startsWith("--"));
const YEAR = Number((args.find((a) => a.startsWith("--year=")) ?? "--year=2026").split("=")[1]);
const TENANT = 1;
const GROUP = "moego-sync";

if (!FILE) {
  console.error("usage: moego-sync-blocks.ts <file> [--year=2026] [--apply]");
  process.exit(1);
}

/**
 * "DD/MM" to a real date. MoeGo never prints a year.
 *
 * A sweep that starts in November and runs to February crosses one, so
 * the year ROLLS when the month goes backwards. Without this every
 * January block landed in the January that has already been and gone —
 * eleven months in the past, where nothing is booked and no blockout
 * does any good.
 *
 * Stateful on purpose: it walks the file in the order the sweep
 * produced, which is chronological.
 */
function makeDayReader(startYear: number) {
  let year = startYear;
  let lastMonth = 0;
  return (ddmm: string): string | null => {
    const m = /^(\d{2})\/(\d{2})$/.exec(ddmm.trim());
    if (!m) return null;
    const month = Number(m[2]);
    if (lastMonth && month < lastMonth) year += 1;
    lastMonth = month;
    return `${year}-${m[2]}-${m[1]}`;
  };
}

(async () => {
  const lines = readFileSync(FILE, "utf8").trim().split("\n").filter((l) => l.trim());
  const isoDay = makeDayReader(YEAR);
  const c = await mysql.createConnection({
    uri: process.env.DATABASE_URL!, ssl: { minVersion: "TLSv1.2", rejectUnauthorized: true },
  });

  const [roster]: any = await c.query(
    `SELECT id, name, is_active AS isActive FROM staff WHERE tenant_id=?`, [TENANT]);
  const [aliasRows]: any = await c.query(
    `SELECT moego_name AS moegoName, staff_id AS staffId FROM moego_staff_aliases WHERE tenant_id=?`, [TENANT]);
  /* Every way this salon writes each person, longest needle first so
     "charlotte" is tried before "char". Nicknames come from the alias
     table, which already holds "megan graham" and "bather 1". */
  const needles: { needle: string; name: string }[] = [];
  for (const r of roster) {
    needles.push({ needle: normaliseStaffName(r.name), name: r.name });
    needles.push({ needle: normaliseStaffName(String(r.name).split(/\s+/)[0]), name: r.name });
  }
  for (const a of aliasRows) {
    const target = roster.find((r: any) => r.id === a.staffId);
    if (!target) continue;
    needles.push({ needle: normaliseStaffName(a.moegoName), name: target.name });
    /* And the alias's FIRST name. MoeGo's staff column prints "Megan",
       while the alias row holds the full "megan graham" — so without
       this the column on five blocks resolved to nobody and the whole
       Girls weekend went to the review pile. */
    needles.push({ needle: normaliseStaffName(String(a.moegoName).split(/\s+/)[0]), name: target.name });
  }
  /* Spellings the salon uses that are in neither place. "loz" is
     Lauren, "charlie" is Charlotte, and "subina" is how Sabina is
     spelt on 6 January. Kept here rather than written into the alias
     table, which is for MoeGo's STAFF COLUMN and is matched exactly;
     these are free text inside a note. */
  for (const [needle, who] of [["loz", "Lauren Romari"], ["charlie", "Charlotte Purcell"],
                               ["subina", "Sabina Orjuela"], ["steph", "Stephanie Baldwin"],
                               ["megs", "Megs Graham"]] as const) {
    if (roster.some((r: any) => r.name === who)) needles.push({ needle, name: who });
  }
  needles.sort((a, b) => b.needle.length - a.needle.length);

  const staffNameIn = (text: string): string | null => {
    const t = normaliseStaffName(text);
    if (!t) return null;
    return needles.find((n) => n.needle && t.includes(n.needle))?.name ?? null;
  };
  const isStaffName = (text: string) => staffNameIn(text) !== null;

  const plan: { day: string; staffId: number; staffName: string; start: string | null; end: string | null; full: boolean; reason: string }[] = [];
  const notes: string[] = [];
  const unclear: string[] = [];
  const unresolved: string[] = [];

  for (const line of lines) {
    const [day, start, end, text, staff] = line.split("|");
    const iso = isoDay(day);
    if (!iso) { unclear.push(`${line}   — unreadable date`); continue; }

    const block: MoegoBlock = { day, start, end, text: text ?? "", staff: staff ?? "" };
    const reading = readBlockWithRoster(block, isStaffName);

    if (reading.kind === "note") { notes.push(`${day} ${text}   — ${reading.why}`); continue; }
    if (reading.kind === "unclear") { unclear.push(`${day} ${start}-${end} ${text}   — ${reading.why}`); continue; }

    /* WHO it is about, which is not always whose column it is in —
       see blockSubject. Three of Steph's and Sabina's absences sit in
       Zakaria's column. */
    const subject = blockSubject(block, staffNameIn);
    if (!subject.ok) {
      unresolved.push(`${day} ${start}-${end} "${text}" [column: ${staff || "none"}]   — ${subject.why}`);
      continue;
    }
    const who = resolveMoegoStaff(subject.name, roster, aliasRows);
    if (!who.ok) {
      unresolved.push(`${day} ${text}   — "${subject.name}" (${who.kind}); add an alias or fix the roster`);
      continue;
    }

    plan.push({
      day: iso, staffId: who.staffId, staffName: who.staffName,
      start: reading.isFullDay ? null : reading.startTime,
      end: reading.isFullDay ? null : reading.endTime,
      full: reading.isFullDay,
      reason: `${text.trim().slice(0, 180)} (MoeGo)`,
    });
  }

  /* Already there, from a previous run or by hand. Compared on the
     window as well as the day: a block that moved from all-day to an
     afternoon is a different fact about the roster. */
  const [already]: any = plan.length
    ? await c.query(
        `SELECT staff_id AS staffId, DATE_FORMAT(blockout_date,'%Y-%m-%d') AS day,
                start_time AS startTime, end_time AS endTime, is_full_day AS isFullDay, group_id AS groupId
           FROM staff_blockouts WHERE tenant_id=? AND DATE(blockout_date) IN (${plan.map(() => "?").join(",")})`,
        [TENANT, ...plan.map((p) => p.day)])
    : [[]];
  const key = (staffId: number, day: string, s: string | null, e: string | null, full: boolean) =>
    `${staffId}|${day}|${full ? "ALL" : `${s}-${e}`}`;
  const have = new Set(already.map((r: any) =>
    key(r.staffId, r.day, r.startTime, r.endTime, Boolean(r.isFullDay))));
  const handEntered = new Map<string, string>();
  for (const r of already) {
    if (r.groupId !== GROUP) handEntered.set(`${r.staffId}|${r.day}`, r.groupId ?? "(none)");
  }

  const todo = plan.filter((p) => !have.has(key(p.staffId, p.day, p.start, p.end, p.full)));
  const skippedByHand = todo.filter((p) => handEntered.has(`${p.staffId}|${p.day}`));
  const toWrite = todo.filter((p) => !handEntered.has(`${p.staffId}|${p.day}`));

  console.log(`read ${lines.length} MoeGo blocks`);
  console.log(`  absences resolved to a person: ${plan.length}`);
  console.log(`  already in Groomigo:           ${plan.length - todo.length}`);
  console.log(`  would be written:              ${toWrite.length}`);
  toWrite.forEach((p) => console.log(`     ${p.day}  ${p.staffName.padEnd(20)} ${p.full ? "all day" : `${p.start}-${p.end}`}   ${p.reason}`));

  const say = (title: string, rows: string[]) => {
    console.log(`\n=== ${title}: ${rows.length} ===`);
    rows.forEach((r) => console.log("  " + r));
  };
  say("NOTES, not absences — left alone", notes);
  say("UNCLEAR — for a human to decide", unclear);
  say("WHO IS AWAY IS NOT CLEAR — for a human", unresolved);
  if (skippedByHand.length) {
    say("LEFT ALONE — somebody entered a blockout on that day by hand", 
        skippedByHand.map((p) => `${p.day} ${p.staffName} — ${p.reason}`));
  }

  if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply."); await c.end(); return; }

  await c.beginTransaction();
  try {
    for (const p of toWrite) {
      const [res]: any = await c.query(
        `INSERT INTO staff_blockouts
           (tenant_id, staff_id, blockout_date, start_time, end_time, is_full_day, reason, group_id)
         VALUES (?,?,?,?,?,?,?,?)`,
        [TENANT, p.staffId, p.day, p.start, p.end, p.full ? 1 : 0, p.reason, GROUP]);
      if (res.affectedRows !== 1) throw new Error(`${p.staffName} ${p.day}: insert affected ${res.affectedRows}`);
    }
    await c.commit();
    console.log(`\ncommitted — ${toWrite.length} blockouts written`);
  } catch (e: any) {
    await c.rollback();
    console.error("\nROLLED BACK —", e?.message ?? e);
    process.exit(1);
  }
  await c.end();
})();
