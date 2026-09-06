import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const membershipsPage = readFileSync(new URL("../client/src/pages/Memberships.tsx", import.meta.url), "utf8");
const routers = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");

describe("membership client navigation", () => {
  it("returns each membership client ID and links the membership client cell to that profile", () => {
    expect(routers).toContain("clientId: memberships.clientId");
    expect(membershipsPage).toContain("href={m.clientId ? `/clients/${m.clientId}` : \"#\"}");
  });

  it("uses the shared client quick-preview data to list all associated pets", () => {
    expect(membershipsPage).toContain("trpc.clients.quickPreview.useQuery");
    expect(membershipsPage).toContain("Associated pets");
    expect(membershipsPage).toContain("data.pets.map");
  });
});
