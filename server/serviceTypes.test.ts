import { describe, it, expect } from "vitest";
import { SERVICE_TYPES, isServiceType } from "../shared/serviceTypes";
import { appointments } from "../drizzle/schema";

describe("service types", () => {
  it("matches the values the appointments.service_type column accepts", () => {
    // Drizzle keeps the enum's members on the column. If someone widens the
    // column without widening SERVICE_TYPES, rows become uneditable through the
    // API - which is exactly how de-shed appointments broke.
    const column = (appointments.serviceType as unknown as { enumValues: readonly string[] }).enumValues;
    expect([...column].sort()).toEqual([...SERVICE_TYPES].sort());
  });

  it("includes deshed", () => {
    // Regression: 69 live appointments used this value while three tRPC input
    // schemas rejected it, so editing any of them failed.
    expect(SERVICE_TYPES).toContain("deshed");
  });

  it("recognises only real service types", () => {
    expect(isServiceType("deshed")).toBe(true);
    expect(isServiceType("classic_groom")).toBe(true);
    expect(isServiceType("de-shed")).toBe(false);
    expect(isServiceType("")).toBe(false);
    expect(isServiceType(undefined)).toBe(false);
  });
});
