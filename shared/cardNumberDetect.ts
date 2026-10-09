/**
 * Does this free text contain something that looks like a card number?
 *
 * MoeGo's client notes carry a handful of them, typed in years ago with the
 * expiry and the security code beside them:
 *
 *   "4072 2090 1392 8116  exp 0516  3 digits456"
 *   "5313 5566 1204 4372 ex 0716 sec 160*"
 *
 * They are long expired and they are MoeGo's problem to delete, but they must
 * not be copied into a second system on the way past. Anything that trips
 * this is skipped by the import and reported by name so a person can clear it
 * at source.
 *
 * Luhn rather than a bare digit-count, because a 16-digit run is also what a
 * date, a reference and a phone number look like once the spaces are taken
 * out, and skipping an ordinary note helps nobody.
 */

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (double) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * True when the text holds something written the way a card number is.
 *
 * Built from whole groups of digits rather than a window slid across a long
 * run: people write "4072 2090 1392 8116", and testing every 13-digit
 * substring of an unrelated number finds a Luhn-valid one about one time in
 * ten, which would skip ordinary notes for no reason.
 */
export function looksLikeCardNumber(text: string | null | undefined): boolean {
  if (!text) return false;
  const tokens = text.split(/[^0-9]+/).filter(Boolean);
  for (let start = 0; start < tokens.length; start++) {
    // A card is written as one long group or as groups of four or more
    // ("4072 2090 1392 8116", "45646990 1316 7274"). A list of phone
    // numbers is not — "0412 345 678" breaks into 4-3-3 — and chaining
    // across those was flagging ordinary notes, including one whose first
    // word is BANNED.
    if (tokens[start].length < 4) continue;
    let candidate = "";
    for (let end = start; end < tokens.length; end++) {
      if (tokens[end].length < 4) break;
      candidate += tokens[end];
      if (candidate.length > 19) break;
      if (candidate.length < 13) continue;
      // Major schemes start 3-6. A reference or a date does not.
      if (!/^[3-6]/.test(candidate)) continue;
      if (luhnValid(candidate)) return true;
    }
  }
  return false;
}
