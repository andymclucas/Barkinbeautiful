/**
 * Finding the same customer entered twice, and deciding which to keep.
 *
 * Andy, 05/11/2026, asked for duplicate merging — he has been doing it
 * by hand, and the salon's own records show why: five of seven pets
 * reviewed on 19/10/2026 were duplicates, retired by marking a live dog
 * as departed because there was no other way to get rid of one.
 *
 * ## Why this is deliberately shy
 *
 * Merging is not reversible by a staff member. Two records joined
 * wrongly put one customer's dogs, invoices and grooming history onto
 * another person's card, and nothing on the screen afterwards says it
 * happened.
 *
 * So the rule is: a STRONG signal is one that a person cannot plausibly
 * share. A phone number and an email address are strong. A name is not
 * — this salon has two Molly Smiths, and a household can have two
 * records on purpose. Names alone surface as "possible" and never as
 * "likely", and nothing merges without somebody pressing the button.
 */

/**
 * Australian numbers lose their leading zero constantly, and the same
 * mobile appears as 0412..., +61412..., 412... So the last nine digits
 * are the comparable part. This is the same rule the MoeGo import uses
 * (shared/moegoImport.ts) and the two must not disagree about whether
 * two people are the same person.
 */
export function phoneKey(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : "";
}

export function emailKey(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Case, spacing and punctuation removed; "O'Neil" and "ONeil" are one. */
export function nameKey(first: string | null | undefined, last: string | null | undefined): string {
  return `${first ?? ""} ${last ?? ""}`
    .toLowerCase().replace(/[^a-z]/g, "");
}

export type MergeCandidate = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  createdAt?: string | Date | null;
  /** Everything hanging off the record, for choosing which to keep. */
  pets?: number;
  appointments?: number;
  invoices?: number;
  hasPortal?: boolean;
};

export type DuplicateGroup = {
  /** What made these look like one person. */
  reason: "phone" | "email" | "name";
  confidence: "likely" | "possible";
  key: string;
  clients: MergeCandidate[];
};

/**
 * Group records that look like one customer.
 *
 * A record can only land in one group, and the strong signals are
 * checked first — so a pair sharing a phone is reported once as a phone
 * match rather than again as a weaker name match.
 */
export function findDuplicateGroups(clients: readonly MergeCandidate[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const claimed = new Set<number>();

  const pass = (
    reason: DuplicateGroup["reason"],
    confidence: DuplicateGroup["confidence"],
    keyOf: (client: MergeCandidate) => string,
  ) => {
    const byKey = new Map<string, MergeCandidate[]>();
    for (const client of clients) {
      if (claimed.has(client.id)) continue;
      const key = keyOf(client);
      if (!key) continue;
      byKey.set(key, [...(byKey.get(key) ?? []), client]);
    }
    for (const [key, members] of byKey) {
      if (members.length < 2) continue;
      for (const member of members) claimed.add(member.id);
      groups.push({ reason, confidence, key, clients: members });
    }
  };

  /*
   * A shared number or address is only a duplicate if the NAME agrees
   * too.
   *
   * Found by running this over the real book on 05/11/2026: of ten
   * groups sharing contact details, three were couples — Rob and Carla
   * Newman, Trevor and Melanie Morris, Andrew and Karen Lavrencic, each
   * pair on one email — and one was two unrelated people who have at
   * some point shared a phone. A household shares an address; that is
   * what a household IS. Merging those four pairs would have folded
   * eight real customers into four.
   *
   * So they still surface, because a person should look at them, but as
   * "possible" with the names shown — never as a confident finding.
   */
  pass("phone", "likely", (c) => phoneKey(c.phone));
  pass("email", "likely", (c) => emailKey(c.email));
  /*
   * Names last and never "likely". Two people really can share one —
   * this salon has duplicate first-and-last pairs who are different
   * households — so a name match is a prompt to look, not a finding.
   */
  pass("name", "possible", (c) => nameKey(c.firstName, c.lastName));

  /*
   * The downgrade. A contact match whose names do not all agree is a
   * household, not one person entered twice.
   */
  const judged = groups.map((group) => {
    if (group.reason === "name") return group;
    const names = new Set(group.clients.map((c) => nameKey(c.firstName, c.lastName)));
    return names.size === 1 ? group : { ...group, confidence: "possible" as const };
  });

  /* Strongest first, then the biggest tangles, so the list opens on the
     merges worth doing rather than on a pair of empty records. */
  return judged.sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === "likely" ? -1 : 1;
    return b.clients.length - a.clients.length;
  });
}

/**
 * Which record to keep.
 *
 * The one carrying the most history, because every row that moves is a
 * row that could fail to move. A portal login outranks raw counts: it
 * is the only thing here the CLIENT holds — they have the password and
 * the link — and re-issuing one means emailing a customer to explain.
 *
 * A recommendation, not a decision. The screen lets a person pick the
 * other one, because they may know something the counts do not.
 */
export function suggestSurvivor(clients: readonly MergeCandidate[]): number | null {
  if (clients.length === 0) return null;
  const score = (c: MergeCandidate) =>
    (c.hasPortal ? 10_000 : 0)
    + (c.appointments ?? 0) * 10
    + (c.invoices ?? 0) * 5
    + (c.pets ?? 0) * 2;
  const best = [...clients].sort((a, b) => {
    const diff = score(b) - score(a);
    if (diff !== 0) return diff;
    // Tie: the older record, which is the one other systems already know.
    const at = a.createdAt ? new Date(a.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
    const bt = b.createdAt ? new Date(b.createdAt).getTime() : Number.MAX_SAFE_INTEGER;
    if (at !== bt) return at - bt;
    return a.id - b.id;
  });
  return best[0].id;
}
