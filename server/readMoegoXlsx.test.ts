import { describe, it, expect } from "vitest";
import { sheetFromEntries, type EntryReader } from "../scripts/readMoegoXlsx.ts";

/**
 * Andy, 09/11/2026: "Fix the sharedStrings bug."
 *
 * An .xlsx stores its text two ways, and MoeGo uses both depending on
 * the report. Six scripts each grew their own unzip helper and ended up
 * disagreeing three ways: two threw when `xl/sharedStrings.xml` was
 * absent, two passed `[]` unconditionally and read every shared-string
 * cell as empty, four got it right.
 *
 * The file reading needs a real archive, so these drive the decision
 * through an injected reader instead. That is the part that was wrong.
 */

const SHEET_SHARED =
  `<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row></sheetData>`;
const SHARED_STRINGS = `<sst><si><t>Booking ID</t></si><si><t>Pet name</t></si></sst>`;
const SHEET_INLINE =
  `<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Booking ID</t></is></c>`
  + `<c r="B1" t="inlineStr"><is><t>Pet name</t></is></c></row></sheetData>`;

/** An archive that has the part. */
const withShared: EntryReader = (entry) =>
  entry === "xl/sharedStrings.xml" ? SHARED_STRINGS : SHEET_SHARED;

/** MoeGo's inline-string export: the part is simply not in the zip. */
const withoutShared: EntryReader = (entry, optional) => {
  if (entry === "xl/sharedStrings.xml") {
    if (!optional) throw new Error("caution: filename not matched: xl/sharedStrings.xml");
    return "";
  }
  return SHEET_INLINE;
};

describe("sheetFromEntries", () => {
  it("resolves shared strings when the part is there", () => {
    expect(sheetFromEntries(withShared)).toEqual([["Booking ID", "Pet name"]]);
  });

  /*
   * The crash. moego-apply.ts — the Monday sync — unzipped this part
   * unconditionally and died before a row was read. The forward
   * importer hit exactly this on 09/11/2026.
   */
  it("reads an export that ships no sharedStrings part at all", () => {
    expect(sheetFromEntries(withoutShared)).toEqual([["Booking ID", "Pet name"]]);
  });

  it("asks for sharedStrings as OPTIONAL and the sheet as required", () => {
    const asked: Array<[string, boolean]> = [];
    sheetFromEntries((entry, optional = false) => {
      asked.push([entry, optional]);
      return entry === "xl/sharedStrings.xml" ? SHARED_STRINGS : SHEET_SHARED;
    });
    expect(asked).toContainEqual(["xl/sharedStrings.xml", true]);
    expect(asked).toContainEqual(["xl/worksheets/sheet1.xml", false]);
  });

  /*
   * The quiet half, and the worse one. moego-pet-codes.ts and
   * moego-pet-weights.ts passed [] unconditionally: on an export that
   * DOES use shared strings, every such cell reads as empty and
   * nothing errors. A crash gets fixed; a column of blanks gets
   * believed.
   */
  it("does not silently read shared-string cells as empty", () => {
    const rows = sheetFromEntries(withShared);
    expect(rows[0].every((cell) => cell !== "")).toBe(true);
  });

  it("still fails loudly when the SHEET is missing", () => {
    expect(() => sheetFromEntries((entry, optional = false) => {
      if (entry === "xl/worksheets/sheet1.xml") throw new Error("no sheet1");
      return optional ? "" : "";
    })).toThrow(/no sheet1/);
  });
});
