import { describe, it, expect } from "vitest";
import { petPhotoDeletionVerdict } from "@shared/petPhotoDeletion";

const photo = { id: 7, petId: 962, tenantId: 1 };
const request = { photoId: 7, petId: 962, tenantId: 1 };

describe("petPhotoDeletionVerdict", () => {
  it("allows a photo to be removed from the dog it is on", () => {
    expect(petPhotoDeletionVerdict(photo, request)).toEqual({ allowed: true });
  });

  it("treats an already-deleted photo as a non-event, not a failure", () => {
    // Two people on the same client record will both press delete.
    const verdict = petPhotoDeletionVerdict(undefined, request);
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toBe("not_found");
  });

  it("refuses when the photo is on a DIFFERENT dog than the caller named", () => {
    // The whole point of asking for petId as well as photoId: a stale
    // page must not delete whatever row that id now points at.
    const verdict = petPhotoDeletionVerdict({ ...photo, petId: 963 }, request);
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toBe("wrong_pet");
  });

  it("refuses across tenants even when the pet id happens to match", () => {
    const verdict = petPhotoDeletionVerdict({ ...photo, tenantId: 2 }, request);
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toBe("wrong_tenant");
  });

  it("checks the tenant before the pet, so a cross-tenant id leaks nothing", () => {
    // Reporting "not on this dog" for another salon's photo would
    // confirm the row exists. Tenant first says nothing either way.
    const verdict = petPhotoDeletionVerdict({ id: 7, petId: 999, tenantId: 2 }, request);
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reason).toBe("wrong_tenant");
  });
});
