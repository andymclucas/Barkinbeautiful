import { describe, expect, it } from "vitest";
import { groomerOffersOnlineService, groomersToSearch } from "./onlineNextAvailable";

describe("groomerOffersOnlineService", () => {
  it("treats no list, an empty list and unreadable JSON as no restriction", () => {
    expect(groomerOffersOnlineService(null, "classic_groom")).toBe(true);
    expect(groomerOffersOnlineService("", "classic_groom")).toBe(true);
    expect(groomerOffersOnlineService("[]", "classic_groom")).toBe(true);
    expect(groomerOffersOnlineService("not json", "classic_groom")).toBe(true);
    expect(groomerOffersOnlineService('{"a":1}', "classic_groom")).toBe(true);
  });

  it("allows only the listed services once a list is set", () => {
    const services = JSON.stringify(["classic_groom", "styled_groom"]);
    expect(groomerOffersOnlineService(services, "styled_groom")).toBe(true);
    expect(groomerOffersOnlineService(services, "bath_only")).toBe(false);
  });
});

describe("groomersToSearch", () => {
  const groomers = [
    { id: 1, services: null },
    { id: 2, services: JSON.stringify(["bath_only"]) },
    { id: 3, services: JSON.stringify(["classic_groom"]) },
  ];

  it("searches everyone who takes the service when no groomer is chosen", () => {
    expect(groomersToSearch(groomers, "classic_groom", null)).toEqual([1, 3]);
    expect(groomersToSearch(groomers, "bath_only", undefined)).toEqual([1, 2]);
  });

  it("searches only the chosen groomer", () => {
    expect(groomersToSearch(groomers, "classic_groom", 3)).toEqual([3]);
  });

  it("searches nobody when the chosen groomer does not take the service", () => {
    expect(groomersToSearch(groomers, "classic_groom", 2)).toEqual([]);
  });

  it("searches nobody for a groomer who is not on the online list", () => {
    expect(groomersToSearch(groomers, "classic_groom", 99)).toEqual([]);
  });
});
