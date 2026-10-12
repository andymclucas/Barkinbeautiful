import { describe, expect, it } from "vitest";
import { distinctClientCount, soleClientOf } from "@shared/appointmentSearch";

const row = (clientId: number | null, first = "Toni", last = "Constantini") =>
  ({ clientId, clientFirstName: first, clientLastName: last });

describe("soleClientOf", () => {
  it("returns the client when every result is theirs", () => {
    // "toni con" matches Millie and Cosi, both Toni's — Enter should open her.
    expect(soleClientOf([row(15), row(15), row(15)])).toEqual({ clientId: 15, name: "Toni Constantini" });
  });

  it("returns null when results span more than one client", () => {
    // "molly" matches four different Mollys. Opening the first one's agenda
    // would be a guess nobody can see being made.
    expect(soleClientOf([row(15), row(258, "Holly", "Lucas")])).toBeNull();
  });

  it("returns null for no results", () => {
    expect(soleClientOf([])).toBeNull();
    expect(soleClientOf(null)).toBeNull();
  });

  it("returns null if any result has no client", () => {
    expect(soleClientOf([row(15), row(null)])).toBeNull();
  });

  it("falls back rather than naming an empty client", () => {
    expect(soleClientOf([row(15, "", "")])).toEqual({ clientId: 15, name: "This client" });
  });

  it("stops as soon as a second client appears, however long the list", () => {
    const many = [row(15), ...Array.from({ length: 200 }, () => row(99))];
    expect(soleClientOf(many)).toBeNull();
  });
});

describe("distinctClientCount", () => {
  it("counts clients, not appointments", () => {
    expect(distinctClientCount([row(15), row(15), row(258)])).toBe(2);
  });

  it("ignores results with no client", () => {
    expect(distinctClientCount([row(15), row(null)])).toBe(1);
    expect(distinctClientCount([])).toBe(0);
  });
});
