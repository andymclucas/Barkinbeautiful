/**
 * The agreement gate in front of the client portal: reading what a client
 * still has to sign, and recording it when they do.
 *
 * The rule itself lives in shared/portalAgreements.ts. This file is the
 * database half, shared by the setup page (identified by the emailed
 * setup token) and the portal (identified by the session or access link).
 */
import { and, eq, inArray } from "drizzle-orm";
import { agreementDocuments, agreementSignatures } from "../drizzle/schema";
import { agreementsAwaitingSignature, checkSignatureRequest } from "@shared/portalAgreements";

export type PendingAgreement = { id: number; title: string; version: number; body: string };

export async function loadPendingAgreements(db: any, tenantId: number, clientId: number): Promise<PendingAgreement[]> {
  const docs = await db.select({
    id: agreementDocuments.id,
    slug: agreementDocuments.slug,
    title: agreementDocuments.title,
    version: agreementDocuments.version,
    status: agreementDocuments.status,
    requirement: agreementDocuments.requirement,
    requiresSignature: agreementDocuments.requiresSignature,
    body: agreementDocuments.body,
  })
    .from(agreementDocuments)
    .where(and(eq(agreementDocuments.tenantId, tenantId), eq(agreementDocuments.status, "active")));
  if (docs.length === 0) return [];

  const signatures = await db.select({
    documentId: agreementSignatures.documentId,
    documentVersion: agreementSignatures.documentVersion,
  })
    .from(agreementSignatures)
    .where(and(
      eq(agreementSignatures.tenantId, tenantId),
      eq(agreementSignatures.clientId, clientId),
      inArray(agreementSignatures.documentId, docs.map((d: { id: number }) => d.id)),
    ));

  return agreementsAwaitingSignature(docs, signatures).map((d: any) => ({
    id: d.id, title: d.title, version: d.version, body: d.body,
  }));
}

export type RecordPortalSignaturesResult = { ok: true; signed: number } | { ok: false; error: string };

/**
 * Record the client's own signature on every outstanding agreement.
 *
 * `recordedByUserId` stays null: that column means "staff typed this at
 * the counter", and here the client signed it themselves. The IP and
 * browser are kept because they are what make a self-signed agreement
 * worth something later.
 */
export async function recordPortalSignatures(db: any, input: {
  tenantId: number;
  clientId: number;
  documentIds: number[];
  signedName: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<RecordPortalSignaturesResult> {
  const outstanding = await loadPendingAgreements(db, input.tenantId, input.clientId);
  const check = checkSignatureRequest({ outstanding, documentIds: input.documentIds, signedName: input.signedName });
  if (!check.ok) return check;

  let signed = 0;
  for (const id of check.documentIds) {
    const doc = outstanding.find((d) => d.id === id)!;
    try {
      await db.insert(agreementSignatures).values({
        tenantId: input.tenantId,
        documentId: doc.id,
        documentVersion: doc.version,
        clientId: input.clientId,
        signedName: input.signedName.trim(),
        signedIp: input.ip ? input.ip.slice(0, 64) : null,
        signedUserAgent: input.userAgent ? input.userAgent.slice(0, 1000) : null,
        recordedByUserId: null,
      });
      signed += 1;
    } catch {
      // The unique key: a double-tap, or two tabs. Already signed is the
      // outcome they wanted, so it is not an error.
    }
  }
  return { ok: true, signed };
}

/** The address a request came from, behind Render's proxy. */
export function requestIp(req: any): string | null {
  const forwarded = String(req?.headers?.["x-forwarded-for"] ?? "").split(",")[0].trim();
  return forwarded || req?.ip || req?.socket?.remoteAddress || null;
}
