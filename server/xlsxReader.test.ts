import { describe, it, expect } from "vitest";
import { parseSharedStrings, parseSheet, columnIndex, decodeXmlText, parseMoney } from "../shared/xlsxReader";

const SHARED = `<?xml version="1.0"?><sst count="4">
<si><t>Booking ID</t></si>
<si><t>Net sales</t></si>
<si><t>#101043912</t></si>
<si><r><t>Diamond </t></r><r><t>- Gold</t></r></si>
</sst>`;

describe("parseSharedStrings", () => {
  it("reads entries in order", () => {
    expect(parseSharedStrings(SHARED).slice(0, 3)).toEqual(["Booking ID", "Net sales", "#101043912"]);
  });

  it("joins a value split across formatting runs", () => {
    // Real reports split a service name when part of it was styled.
    expect(parseSharedStrings(SHARED)[3]).toBe("Diamond - Gold");
  });

  it("decodes entities", () => {
    expect(parseSharedStrings('<sst><si><t>Barkin &amp; Beautiful</t></si></sst>')[0]).toBe("Barkin & Beautiful");
  });
});

describe("columnIndex", () => {
  it("maps single and double letters", () => {
    expect(columnIndex("A1")).toBe(0);
    expect(columnIndex("Z9")).toBe(25);
    expect(columnIndex("AA1")).toBe(26);
    expect(columnIndex("AX100")).toBe(49);
  });
});

describe("parseSheet", () => {
  const shared = parseSharedStrings(SHARED);

  it("resolves shared-string cells and keeps inline numbers", () => {
    const xml = `<sheetData><row r="1"><c r="A1" t="s"><v>2</v></c><c r="B1"><v>145.5</v></c></row></sheetData>`;
    expect(parseSheet(xml, shared)).toEqual([["#101043912", "145.5"]]);
  });

  it("puts a cell in its own column when earlier cells are absent", () => {
    // xlsx omits empty cells entirely - counting would shift every later value.
    const xml = `<sheetData><row r="1"><c r="A1"><v>1</v></c><c r="D1"><v>4</v></c></row></sheetData>`;
    expect(parseSheet(xml, shared)).toEqual([["1", "", "", "4"]]);
  });

  it("reads inline strings", () => {
    const xml = `<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Cancelled</t></is></c></row></sheetData>`;
    expect(parseSheet(xml, shared)[0][0]).toBe("Cancelled");
  });

  it("gives every row a width, so a header mismatch is detectable", () => {
    const xml = `<sheetData><row r="1"><c r="A1"><v>a</v></c><c r="C1"><v>c</v></c></row>` +
                `<row r="2"><c r="A2"><v>x</v></c></row></sheetData>`;
    const rows = parseSheet(xml, shared);
    expect(rows[0]).toHaveLength(3);
    expect(rows[1]).toHaveLength(1); // narrower - caller rejects it against the header
  });

  it("skips a row with no cells", () => {
    expect(parseSheet(`<sheetData><row r="1"></row></sheetData>`, shared)).toEqual([]);
  });
});

describe("parseMoney", () => {
  it("reads MoeGo's money formats", () => {
    expect(parseMoney("$145.00")).toBe(145);
    expect(parseMoney("$0.0")).toBe(0);
    expect(parseMoney("1,234.50")).toBe(1234.5);
    expect(parseMoney("-$20.00")).toBe(-20);
  });

  it("treats blank and junk as zero rather than NaN", () => {
    expect(parseMoney("")).toBe(0);
    expect(parseMoney(null)).toBe(0);
    expect(parseMoney(undefined)).toBe(0);
    expect(parseMoney("n/a")).toBe(0);
  });
});

describe("decodeXmlText", () => {
  it("does not double-decode an escaped entity", () => {
    expect(decodeXmlText("&amp;lt;")).toBe("&lt;");
  });
});
