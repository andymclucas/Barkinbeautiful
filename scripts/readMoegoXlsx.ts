/**
 * Reading a MoeGo .xlsx, once, correctly.
 *
 * Andy, 09/11/2026: "Fix the sharedStrings bug."
 *
 * ## The bug, and why it kept coming back
 *
 * An .xlsx may store its text two ways. Most writers put every string
 * in `xl/sharedStrings.xml` and have the sheet hold indexes into it.
 * MoeGo's exports put the text inline and ship **no sharedStrings part
 * at all** — some of them, some of the time. Which one you get depends
 * on the report.
 *
 * Every script that reads an export grew its own `unzip` helper, and
 * they ended up disagreeing three ways:
 *
 *   moego-apply.ts, moego-size-bands.ts        unzip unconditionally
 *                                              -> CRASH on an inline
 *                                                 export, before a row
 *                                                 is read
 *   moego-pet-codes.ts, moego-pet-weights.ts   pass [] always
 *                                              -> every shared-string
 *                                                 cell reads as empty
 *                                                 on a normal export,
 *                                                 silently
 *   the four dated one-offs                    an `optional` flag
 *                                              -> correct
 *
 * The first is loud and the second is not, which makes the second
 * worse. Both are the same missing idea: the part is OPTIONAL and the
 * reader has to cope either way.
 *
 * It bit the forward importer on 09/11/2026 — `caution: filename not
 * matched: xl/sharedStrings.xml`, then nothing — and `moego-apply.ts`
 * is the Monday sync, so it was going to bite that next.
 *
 * ## Why this lives in scripts/ and not shared/
 *
 * shared/xlsxReader.ts does the parsing and is deliberately pure:
 * `shared/` is imported by the CLIENT as well as the server and must
 * not reach for child processes or the filesystem. Unzipping is the
 * caller's job, which is exactly the job every caller got wrong. So
 * the shelling-out lives here, beside the scripts that need it.
 */
import { execFileSync } from "node:child_process";
import { parseSharedStrings, parseSheet } from "../shared/xlsxReader.ts";

/** Reads one entry out of the archive. Returns "" when `optional` and absent. */
export type EntryReader = (entry: string, optional?: boolean) => string;

/**
 * Rows of cell text, from an archive reader.
 *
 * Split from the file handling so the decision — ask for
 * sharedStrings, carry on without it — is testable without a binary
 * fixture or a child process.
 */
export function sheetFromEntries(read: EntryReader): string[][] {
  /*
   * `optional` is the whole point. An export with inline strings has no
   * sharedStrings part, and an empty table is the correct reading of
   * that: parseSheet only consults it for cells that claim a shared
   * index, and an inline export has none.
   */
  const shared = parseSharedStrings(read("xl/sharedStrings.xml", true));
  return parseSheet(read("xl/worksheets/sheet1.xml"), shared);
}

/**
 * Rows of cell text from a MoeGo .xlsx on disk.
 *
 * `stdio` silences unzip's own "caution: filename not matched" on the
 * optional part — it is expected, not a warning anybody should read.
 */
export function readMoegoSheet(path: string, maxBuffer = 512 * 1024 * 1024): string[][] {
  return sheetFromEntries((entry, optional = false) => {
    try {
      return execFileSync("unzip", ["-p", path, entry], {
        maxBuffer, stdio: ["ignore", "pipe", "ignore"],
      }).toString("utf8");
    } catch (error) {
      if (optional) return "";
      throw error;
    }
  });
}
