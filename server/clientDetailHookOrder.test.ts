import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ClientDetail hook-order safety", () => {
  it("declares every component hook before the loading return", () => {
    const source = readFileSync(new URL("../client/src/pages/ClientDetail.tsx", import.meta.url), "utf8");
    const component = source.slice(source.indexOf("export default function ClientDetail"));
    const loadingReturnIndex = component.indexOf("if (isLoading) return");

    expect(loadingReturnIndex).toBeGreaterThan(0);
    expect(component.slice(loadingReturnIndex)).not.toMatch(/\buse(?:State|Effect|Memo|Callback|Ref|Query|Mutation)\s*\(/);
  });

  it("keeps the requested loading feedback and departed-pet membership workflow entry points", () => {
    const source = readFileSync(new URL("../client/src/pages/ClientDetail.tsx", import.meta.url), "utf8");

    expect(source).toContain('data-testid="client-profile-skeleton"');
    expect(source).toContain("Pet & membership management");
    expect(source).toContain("Membership & pet activity");
    expect(source).toContain("membership_transferred");
    expect(source).toContain("Membership removed");
  });
});
