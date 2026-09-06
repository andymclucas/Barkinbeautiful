import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("recorded pet weight and controlled staff membership setup", () => {
  const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
  const profileSource = readFileSync(new URL("../client/src/pages/ClientDetail.tsx", import.meta.url), "utf8");
  const membershipsSource = readFileSync(new URL("../client/src/pages/Memberships.tsx", import.meta.url), "utf8");

  it("keeps recorded pet-weight updates tenant-scoped and permits intentional unknown weights", () => {
    const petsSection = routerSource.slice(routerSource.indexOf("const petsRouter"), routerSource.indexOf("const staffRouter"));
    expect(petsSection).toContain("updateWeight: operationalProcedure");
    expect(petsSection).toContain("weightKg: z.number().finite().min(0).max(80).nullable()");
    expect(petsSection).toContain("requireApprovedStaffTenant(db, ctx.user)");
    expect(petsSection).toContain("and(eq(pets.id, input.petId), eq(pets.tenantId, input.tenantId))");
    expect(petsSection).toContain("set({ weightKg: recordedWeight, weight: recordedWeight })");
  });

  it("provides an accessible inline profile editor that can clear a recorded weight without changing memberships", () => {
    expect(profileSource).toContain("trpc.pets.updateWeight.useMutation");
    expect(profileSource).toContain("htmlFor={`pet-weight-${pet.id}`}");
    expect(profileSource).toContain("Leave blank if unknown");
    expect(profileSource).toContain("setEditingWeightPetId(null)");
    expect(profileSource).toContain("utils.clients.getProfile.invalidate({ clientId })");
    expect(profileSource).not.toContain("memberships.create.mutate");
  });

  it("limits staff to controlled membership creation without financial reconciliation or payment collection controls", () => {
    expect(membershipsSource).toContain("Membership setup");
    expect(membershipsSource).toContain("Payment collection, billing dates, invoices, payment failures and debt management remain administrator-only.");
    expect(membershipsSource).toContain("currentUser?.role === \"staff\"");
    expect(routerSource).toContain("Only an administrator can configure payment collection or a billing date");
  });
});
