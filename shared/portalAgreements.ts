/**
 * Which agreements a client must sign before the portal opens.
 *
 * Andy, 11/11/2026: "a mass email send that is getting people to set up
 * their portal and before they do, they need to sign the agreement as the
 * first page that it shows before they can access their portal".
 *
 * The rule is the salon's own MoeGo setting, which the agreements already
 * carry: `sign_once` means every client signs it once, before anything
 * else. The membership agreements are `manual` — staff send them to the
 * members they apply to — and must NOT appear here, or every client would
 * be asked to sign five VIP contracts for plans they are not on.
 *
 * A signature counts only for the CURRENT wording. A signature means
 * "agreed to these exact words", so when the salon publishes a new
 * version the gate asks again. That matches the client page, which
 * already shows an older signature as "signed an earlier version".
 */

export type AgreementDocLike = {
  id: number;
  slug: string;
  title: string;
  version: number;
  status: "draft" | "active" | "archived";
  requirement: "sign_once" | "every_booking" | "manual";
  requiresSignature: boolean;
};

export type AgreementSignatureLike = {
  documentId: number;
  documentVersion: number;
};

/**
 * The newest active version of each agreement.
 *
 * Versions are separate rows sharing a slug, so "the service agreement"
 * is whichever active row for that slug has the highest version.
 */
export function currentAgreementVersions<T extends AgreementDocLike>(docs: readonly T[]): T[] {
  const newest = new Map<string, T>();
  for (const doc of docs) {
    if (doc.status !== "active") continue;
    const held = newest.get(doc.slug);
    if (!held || doc.version > held.version) newest.set(doc.slug, doc);
  }
  return Array.from(newest.values()).sort((a, b) => a.title.localeCompare(b.title));
}

/** The agreements standing between this client and their portal. */
export function agreementsAwaitingSignature<T extends AgreementDocLike>(
  docs: readonly T[],
  signatures: readonly AgreementSignatureLike[],
): T[] {
  return currentAgreementVersions(docs).filter(
    (doc) =>
      doc.requirement === "sign_once" &&
      doc.requiresSignature &&
      !signatures.some((s) => s.documentId === doc.id && s.documentVersion === doc.version),
  );
}

export type SignatureRequestCheck =
  | { ok: true; documentIds: number[] }
  | { ok: false; error: string };

/**
 * Whether what the client submitted is what they were shown.
 *
 * The client must agree to EVERY outstanding agreement, by id. An id that
 * is not outstanding is refused rather than ignored: it is either a stale
 * page (the salon published a new version while it was open) or a forged
 * request, and in both cases recording it would say they agreed to words
 * they were not shown.
 */
export function checkSignatureRequest(input: {
  outstanding: readonly { id: number }[];
  documentIds: readonly number[];
  signedName: string;
}): SignatureRequestCheck {
  const name = (input.signedName ?? "").trim();
  if (name.length < 2) return { ok: false, error: "Type your full name to sign." };
  if (name.length > 200) return { ok: false, error: "That name is too long." };

  const outstanding = new Set(input.outstanding.map((d) => d.id));
  const submitted = Array.from(new Set(input.documentIds));
  if (outstanding.size === 0) return { ok: false, error: "There is nothing left to sign." };
  if (submitted.some((id) => !outstanding.has(id))) {
    return { ok: false, error: "This agreement has been updated since the page opened. Reload the page to read the current version." };
  }
  if (submitted.length !== outstanding.size) {
    return { ok: false, error: "Tick every agreement to continue." };
  }
  return { ok: true, documentIds: submitted };
}
