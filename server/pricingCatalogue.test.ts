import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalisePricingCode } from "../shared/pricingCatalogue";

describe("Pricing & Services catalogue safeguards", () => {
  it("normalises stable catalogue codes without permitting unsafe characters", () => {
    expect(normalisePricingCode("  Classic Groom  ")).toBe("classic-groom");
    expect(normalisePricingCode("VIP_Weekly-01")).toBe("vip_weekly-01");
    expect(() => normalisePricingCode("price / service")).toThrow("Use a unique code");
  });

  it("keeps every Pricing & Services data operation administrator-only", () => {
    const routerSource = readFileSync(resolve(process.cwd(), "server/routers.ts"), "utf8");
    const pricingBlock = routerSource.slice(
      routerSource.indexOf("const pricingRouter = router({"),
      routerSource.indexOf("// ─── Retail", routerSource.indexOf("const pricingRouter = router({"))
    );

    for (const operation of [
      "listServices: adminProcedure",
      "createService: adminProcedure",
      "updateService: adminProcedure",
      "deleteService: adminProcedure",
      "listMembershipPlans: adminProcedure",
      "createMembershipPlan: adminProcedure",
      "updateMembershipPlan: adminProcedure",
      "deleteMembershipPlan: adminProcedure",
    ]) {
      expect(pricingBlock).toContain(operation);
    }
  });
});
