import { describe, expect, it } from "vitest";
import { resolveTenantId, mayAccessTenant, CROSS_TENANT_MESSAGE } from "@shared/tenantResolution";

describe("working out which salon a caller belongs to", () => {
  it("prefers the link on the user record", () => {
    expect(resolveTenantId({ userTenantId: 2, staffTenantId: 3 })).toBe(2);
  });

  it("falls back to the staff record — which is all the owner has", () => {
    // Lauren's users.tenant_id is NULL in production; only her staff row
    // says she belongs to Barkin Beautiful. Resolving strictly from the
    // user row would lock the owner out of her own business.
    expect(resolveTenantId({ userTenantId: null, staffTenantId: 1 })).toBe(1);
  });

  it("returns null rather than guessing", () => {
    // The orphaned 'mmfox88' account has neither. Defaulting it to 1 is
    // precisely the behaviour being removed.
    expect(resolveTenantId({})).toBeNull();
    expect(resolveTenantId({ userTenantId: null, staffTenantId: null })).toBeNull();
    expect(resolveTenantId({ userTenantId: 0 })).toBeNull();
    expect(resolveTenantId({ userTenantId: -1 })).toBeNull();
    expect(resolveTenantId({ userTenantId: 1.5 })).toBeNull();
  });
});

describe("refusing another salon's data", () => {
  it("allows a caller to ask about their own salon", () => {
    expect(mayAccessTenant(1, 1)).toBe(true);
  });

  it("REFUSES a caller asking about someone else's", () => {
    // The entire point. Today every user is an admin, and the existing
    // guard skips admins — so a second salon would be readable by
    // changing one number in a request.
    expect(mayAccessTenant(1, 2)).toBe(false);
    expect(mayAccessTenant(2, 1)).toBe(false);
    expect(CROSS_TENANT_MESSAGE).not.toMatch(/\d/); // names no salon
  });

  it("leaves the public surface alone", () => {
    // Online booking and the client portal have no signed-in user and are
    // scoped by their own tokens. Refusing them would take the booking
    // page down.
    expect(mayAccessTenant(null, 1)).toBe(true);
    expect(mayAccessTenant(null, 999)).toBe(true);
  });

  it("allows a request that names no salon at all", () => {
    expect(mayAccessTenant(1, undefined)).toBe(true);
    expect(mayAccessTenant(1, null)).toBe(true);
  });
});
