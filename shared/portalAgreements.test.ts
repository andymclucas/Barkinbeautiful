import { describe, expect, it } from "vitest";
import {
  agreementsAwaitingSignature,
  checkSignatureRequest,
  currentAgreementVersions,
  type AgreementDocLike,
} from "./portalAgreements";

const doc = (over: Partial<AgreementDocLike>): AgreementDocLike => ({
  id: 1, slug: "service-agreement", title: "Service Agreement", version: 1,
  status: "active", requirement: "sign_once", requiresSignature: true, ...over,
});

describe("currentAgreementVersions", () => {
  it("keeps the newest active version of each slug", () => {
    const rows = [doc({ id: 6, version: 1 }), doc({ id: 9, version: 2 }), doc({ id: 10, version: 3, status: "draft" })];
    expect(currentAgreementVersions(rows).map((d) => d.id)).toEqual([9]);
  });
});

describe("agreementsAwaitingSignature", () => {
  const service = doc({ id: 6 });
  const gold = doc({ id: 3, slug: "membership-gold", title: "Gold VIP", requirement: "manual" });

  it("asks for the sign-once agreement and never the membership ones", () => {
    expect(agreementsAwaitingSignature([service, gold], []).map((d) => d.id)).toEqual([6]);
  });

  it("is empty once the current version is signed", () => {
    expect(agreementsAwaitingSignature([service], [{ documentId: 6, documentVersion: 1 }])).toEqual([]);
  });

  it("asks again when the salon publishes a new version", () => {
    const v2 = doc({ id: 11, version: 2 });
    expect(agreementsAwaitingSignature([service, v2], [{ documentId: 6, documentVersion: 1 }]).map((d) => d.id)).toEqual([11]);
  });

  it("skips an agreement that does not need a signature", () => {
    expect(agreementsAwaitingSignature([doc({ requiresSignature: false })], [])).toEqual([]);
  });
});

describe("checkSignatureRequest", () => {
  const outstanding = [{ id: 6 }];
  it("accepts every outstanding id with a name", () => {
    expect(checkSignatureRequest({ outstanding, documentIds: [6], signedName: " Jane Smith " })).toEqual({ ok: true, documentIds: [6] });
  });
  it("needs a name", () => {
    expect(checkSignatureRequest({ outstanding, documentIds: [6], signedName: " " }).ok).toBe(false);
  });
  it("refuses an id the client was not shown", () => {
    const r = checkSignatureRequest({ outstanding, documentIds: [6, 3], signedName: "Jane" });
    expect(r.ok).toBe(false);
  });
  it("refuses a partial agreement", () => {
    const r = checkSignatureRequest({ outstanding: [{ id: 6 }, { id: 7 }], documentIds: [6], signedName: "Jane" });
    expect(r).toEqual({ ok: false, error: "Tick every agreement to continue." });
  });
  it("refuses when there is nothing to sign", () => {
    expect(checkSignatureRequest({ outstanding: [], documentIds: [], signedName: "Jane" }).ok).toBe(false);
  });
});
