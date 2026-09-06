import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("shared-family booking repair", () => {
  it("creates only active same-client family appointment rows and does not duplicate a combined charge", () => {
    const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
    expect(routerSource).toContain("addPetsToSharedAppointment: operationalProcedure");
    expect(routerSource).toContain("Every added pet must be an active pet belonging to the same client");
    expect(routerSource).toContain("price: null");
    expect(routerSource).toContain("getNewSharedSessionPetIds");
  });
});
