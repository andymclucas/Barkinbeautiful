import { describe, expect, it } from "vitest";
import { decidePasswordSignIn, inSalonOrder } from "./portalSignInSalon";

const name = (id: number) => (id === 1 ? "Barkin' Beautiful" : "Barkin Beautiful Barber");

describe("which salon a password sign-in opens", () => {
  it("refuses when the password opened nothing", () => {
    expect(decidePasswordSignIn({ matched: [], salonName: name })).toEqual({ kind: "refused" });
  });

  it("signs in to the one salon the password opened, whichever salon it is", () => {
    expect(decidePasswordSignIn({ matched: [{ tenantId: 7 }], salonName: name }))
      .toEqual({ kind: "signIn", account: { tenantId: 7 } });
    expect(decidePasswordSignIn({ matched: [{ tenantId: 1 }], salonName: name }))
      .toEqual({ kind: "signIn", account: { tenantId: 1 } });
  });

  it("asks which salon when the same password opens two", () => {
    expect(decidePasswordSignIn({ matched: [{ tenantId: 7 }, { tenantId: 1 }], salonName: name })).toEqual({
      kind: "choose",
      salons: [{ tenantId: 1, name: "Barkin' Beautiful" }, { tenantId: 7, name: "Barkin Beautiful Barber" }],
    });
  });

  it("signs in to the salon the person then picks", () => {
    expect(decidePasswordSignIn({ matched: [{ tenantId: 1 }, { tenantId: 7 }], chosenTenantId: 7, salonName: name }))
      .toEqual({ kind: "signIn", account: { tenantId: 7 } });
  });

  it("never lets a picked salon reach an account the password did not open", () => {
    expect(decidePasswordSignIn({ matched: [{ tenantId: 1 }], chosenTenantId: 7, salonName: name }))
      .toEqual({ kind: "refused" });
  });
});

describe("salon order", () => {
  it("is by salon, and does not change the list it was given", () => {
    const given = [{ tenantId: 7 }, { tenantId: 1 }];
    expect(inSalonOrder(given)).toEqual([{ tenantId: 1 }, { tenantId: 7 }]);
    expect(given).toEqual([{ tenantId: 7 }, { tenantId: 1 }]);
  });
});
