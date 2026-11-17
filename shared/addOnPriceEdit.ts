/**
 * Reading the "Price each" box when an extra is edited.
 *
 * Lauren, 12/11/2026, wanting a daycare at $20: "It only lets me discount
 * it in the edit section... wont let me pencil it in." The server has
 * always accepted a new price (appointmentAddOns.update, unitPrice); the
 * editor never offered one, so the only way down was a discount and the
 * only way up was to remove the line and add it again.
 *
 * `changed` exists so the editor sends a price ONLY when somebody altered
 * it. Saving "done by" must not rewrite what a line costs.
 */
export const MAX_ADD_ON_UNIT_PRICE = 10000;

export type UnitPriceEdit =
  | { ok: true; unitPrice: number; changed: boolean }
  | { ok: false; error: string };

export function readUnitPriceEdit(
  text: string,
  current: string | number | null | undefined,
): UnitPriceEdit {
  const cleaned = String(text ?? "").replace(/[$,\s]/g, "");
  if (cleaned === "") return { ok: false, error: "Enter a price, or 0 for no charge." };
  const numeric = Number(cleaned);
  if (!Number.isFinite(numeric)) return { ok: false, error: "That is not a number." };
  if (numeric < 0) return { ok: false, error: "A price cannot be less than zero." };
  if (numeric > MAX_ADD_ON_UNIT_PRICE) return { ok: false, error: "That price is too high." };
  const cents = Math.round(numeric * 100);
  return {
    ok: true,
    unitPrice: cents / 100,
    changed: cents !== Math.round(Number(current ?? 0) * 100),
  };
}
