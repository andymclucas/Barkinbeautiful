/**
 * Minimal reader for the XML inside an .xlsx file.
 *
 * MoeGo's Appointment list report - the only place the money figures come from
 * - downloads as .xlsx, and there is no spreadsheet parser in this project.
 * Rather than add one, these two functions read the parts that matter.
 *
 * An .xlsx is a zip. Unzipping is the caller's job, because `shared/` is
 * imported by the client as well as the server and must not reach for child
 * processes or the filesystem. Callers pass in the text of:
 *
 *   xl/sharedStrings.xml    -> parseSharedStrings
 *   xl/worksheets/sheet1.xml -> parseSheet
 *
 * Keeping the parsing pure is what makes the awkward parts - shared-string
 * indirection, runs split across several <t> elements, gaps where a cell is
 * simply absent - testable without a binary fixture.
 */

const ENTITIES: Record<string, string> = {
  "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'",
};

/** Decode XML entities. `&amp;` is done last so `&amp;lt;` survives as `&lt;`. */
export function decodeXmlText(value: string): string {
  let out = value;
  for (const [entity, ch] of Object.entries(ENTITIES)) out = out.split(entity).join(ch);
  out = out.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  return out.split("&amp;").join("&");
}

/**
 * Most cell values are not stored in the sheet; the sheet holds an index into
 * this table. A single entry can be split across several <t> runs when part of
 * it was formatted differently, so the runs are concatenated.
 */
export function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const chunk of xml.split("<si>").slice(1)) {
    let text = "";
    const re = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(chunk)) !== null) text += m[1];
    out.push(decodeXmlText(text));
  }
  return out;
}

/** "A" -> 0, "Z" -> 25, "AA" -> 26. Cell refs carry the column, not its order. */
export function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/[^A-Z]/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Rows of cell text, indexed by column.
 *
 * Empty cells are omitted from the XML entirely, so positions are taken from
 * each cell's own `r` reference rather than counting. A row is padded to its
 * highest column so callers can compare row width against the header and spot
 * a slipped parse.
 */
export function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const rowXml of xml.split("<row ").slice(1)) {
    const cells: string[] = [];
    let widest = -1;
    const re = /<c r="([A-Z]+\d+)"([^>]*)>([\s\S]*?)<\/c>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(rowXml)) !== null) {
      const [, ref, attrs, body] = m;
      const at = columnIndex(ref);
      const inline = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>/.exec(body);
      const v = /<v>([\s\S]*?)<\/v>/.exec(body);
      let value = "";
      if (inline) value = decodeXmlText(inline[1]);
      else if (v) value = /t="s"/.test(attrs) ? (shared[Number(v[1])] ?? "") : decodeXmlText(v[1]);
      cells[at] = value;
      if (at > widest) widest = at;
    }
    if (widest < 0) continue;
    for (let i = 0; i <= widest; i++) if (cells[i] === undefined) cells[i] = "";
    rows.push(cells);
  }
  return rows;
}

/** Money as written by MoeGo - "$145.00", "$0.0", "" - as a number. */
export function parseMoney(value: string | null | undefined): number {
  const n = Number(String(value ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
