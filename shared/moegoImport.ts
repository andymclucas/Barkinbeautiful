/**
 * Parsers for MoeGo's "Export clients" CSV.
 *
 * Both of these exist because a naive version of them silently corrupted an
 * import on 30/09/2026, and neither failure was visible without checking the
 * output row by row.
 *
 * Pure functions, no I/O, so the awkward real-world shapes can be pinned down
 * in tests rather than rediscovered against the live client library.
 */

/** One parsed pet from the export's `pet(Breed)` column. */
export interface MoegoPet {
  name: string;
  breed: string;
  /** MoeGo sometimes carries a nickname between the name and the breed. */
  nickname: string;
}

/**
 * Split MoeGo's CSV into rows.
 *
 * MoeGo quotes every value and separates them with TAB then comma. The catch is
 * that `notes` and `address` contain commas AND newlines inside their quotes,
 * so splitting the file on newlines shifts every column after such a record.
 * That produced "clients" whose first name was a phone number and whose pet was
 * the tag `VIP` - 163 of them, all of which would have been created.
 *
 * Rows are returned with fields trimmed. Callers should reject any row whose
 * length differs from the header's: that means the parse slipped and the values
 * cannot be trusted.
 */
export function parseMoegoCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ",") { row.push(field.trim()); field = ""; continue; }
    if (ch === "\n") {
      row.push(field.trim());
      if (row.some((v) => v !== "")) rows.push(row);
      row = []; field = "";
      continue;
    }
    if (ch === "\r") continue;
    field += ch;
  }
  row.push(field.trim());
  if (row.some((v) => v !== "")) rows.push(row);
  return rows;
}

/**
 * Parse the `pet(Breed)` column into one entry per dog.
 *
 * The column holds `Name(Breed)` or `Name(nickname)(Breed)`, comma separated:
 *
 *   "Toddy(Lhasa Apso),Saffron(saffie)(Border Collie)"
 *
 * Two things make a regex the wrong tool here:
 *
 *  - Breeds contain brackets of their own - "Chihuahua (Long Coat)",
 *    "Poodle (Toy)", "Dachshund (Miniature Smooth Haired)". A pattern of
 *    /([^,(]+)\(([^)]*)\)/ stops at the first inner ")" and then matches the
 *    remainder as a SECOND pet, so "Jose'e (Chihuahua (Long Coat))" yielded the
 *    real dog plus a phantom one called "Chihuahua". Left unchecked that would
 *    have created dogs named Poodle, Chihuahua and German Spitz.
 *  - Breeds contain commas, so the entries cannot be split on "," either.
 *
 * So: split on commas at bracket depth zero, then read the bracket groups by
 * depth. The breed is always the LAST group; anything before it is a nickname.
 */
export function parseMoegoPets(cell: string): MoegoPet[] {
  const entries: string[] = [];
  let depth = 0;
  let buffer = "";
  for (const ch of String(cell ?? "")) {
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) { entries.push(buffer); buffer = ""; continue; }
    buffer += ch;
  }
  entries.push(buffer);

  const pets: MoegoPet[] = [];
  for (const raw of entries) {
    const entry = raw.trim();
    if (!entry) continue;

    const open = entry.indexOf("(");
    if (open === -1) { pets.push({ name: entry, breed: "", nickname: "" }); continue; }

    const name = entry.slice(0, open).trim();
    if (!name) continue;

    const groups: string[] = [];
    let d = 0;
    let current = "";
    for (let i = open; i < entry.length; i++) {
      const ch = entry[i];
      if (ch === "(") { d++; if (d === 1) { current = ""; continue; } }
      else if (ch === ")") { d--; if (d === 0) { groups.push(current.trim()); continue; } }
      if (d >= 1) current += ch;
    }
    // MoeGo's own data contains unbalanced brackets; keep what was gathered
    // rather than dropping the dog.
    if (d > 0 && current.trim()) groups.push(current.trim());

    pets.push({
      name,
      breed: groups.length ? groups[groups.length - 1] : "",
      nickname: groups.length > 1 ? groups.slice(0, -1).join(" ").trim() : "",
    });
  }
  return pets;
}

/**
 * Last nine digits of a phone number, for comparing across formats.
 *
 * Australian numbers arrive as `0412345678`, `+61412345678` and `61412345678`
 * for the same person. Returns "" when there are too few digits to be a real
 * number, so callers never match two unknowns to each other.
 */
export function phoneMatchKey(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : "";
}
