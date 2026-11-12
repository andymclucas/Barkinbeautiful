/**
 * The numbers a client can be texted on, for the Messages composer's
 * "To" picker (Lauren, 13/11/2026).
 *
 * The client's own number first, then each saved contact. Two entries
 * with the same number collapse into one: a contact saved with the
 * client's own mobile is the same handset, and listing it twice invites
 * sending the same text twice.
 */
export type TextableNumber = {
  /** "primary" for the client's own number, "contact" for a saved contact. */
  kind: "primary" | "contact";
  name: string;
  phone: string;
  /** "Primary contact", or the contact's relationship when one was saved. */
  label: string;
};

/** Digits only, with a leading 61 folded to 0, so +61 4.. and 04.. match. */
export function phoneKey(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.startsWith("61") && digits.length === 11 ? `0${digits.slice(2)}` : digits;
}

export function textableNumbers(
  client: { name: string; phone: string | null | undefined },
  contacts: ReadonlyArray<{ name: string; phone: string | null | undefined; relationship?: string | null }>,
): TextableNumber[] {
  const out: TextableNumber[] = [];
  const seen = new Set<string>();
  const add = (entry: TextableNumber) => {
    const key = phoneKey(entry.phone);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(entry);
  };
  if (client.phone) add({ kind: "primary", name: client.name || "Client", phone: client.phone, label: "Primary contact" });
  for (const c of contacts) {
    if (!c.phone) continue;
    add({ kind: "contact", name: c.name, phone: c.phone, label: (c.relationship ?? "").trim() || "Additional contact" });
  }
  return out;
}
