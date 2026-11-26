import { describe, expect, it } from "vitest";
import { lapsedPetsByClient } from "./lapsedPets";

describe("lapsedPetsByClient", () => {
  const pets = [
    { id: 1, clientId: 10, name: "Coco", breed: "Spoodle", weightKg: "12.50", status: "active" as const },
    { id: 2, clientId: 10, name: "Max", breed: " ", weightKg: null, status: "departed" as const },
    { id: 3, clientId: 10, name: "Bella", breed: null, weightKg: "0", status: "active" as const },
    { id: 4, clientId: 20, name: "Rex", breed: "Kelpie", weightKg: 20, status: "archived" as const },
  ];
  const visits = [
    { petId: 1, scheduledStart: "2026-01-20T00:00:00Z" },
    { petId: 1, scheduledStart: "2025-11-01T00:00:00Z" },
    { petId: 2, scheduledStart: "2026-02-01T00:00:00Z" },
    { petId: 3, scheduledStart: new Date("2026-03-01T00:00:00Z") },
    { petId: null, scheduledStart: "2026-03-05T00:00:00Z" },
  ];

  it("gives each dog its own groom count and last groom", () => {
    const coco = lapsedPetsByClient(pets, visits).get(10)!.find((p) => p.name === "Coco")!;
    expect(coco.grooms).toBe(2);
    expect(coco.lastGroomed?.toISOString()).toBe("2026-01-20T00:00:00.000Z");
    expect(coco.weightKg).toBe(12.5);
    expect(coco.breed).toBe("Spoodle");
  });

  it("lists active dogs first, most recently groomed first, then departed", () => {
    expect(lapsedPetsByClient(pets, visits).get(10)!.map((p) => p.name)).toEqual(["Bella", "Coco", "Max"]);
  });

  it("drops a blank breed and a zero weight, and keeps a dog never groomed", () => {
    const map = lapsedPetsByClient(pets, visits);
    expect(map.get(10)!.find((p) => p.name === "Max")!.breed).toBeNull();
    expect(map.get(10)!.find((p) => p.name === "Bella")!.weightKg).toBeNull();
    expect(map.get(20)![0]).toMatchObject({ name: "Rex", grooms: 0, lastGroomed: null, status: "archived" });
  });
});
