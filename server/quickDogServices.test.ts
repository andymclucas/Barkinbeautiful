import { describe, it, expect } from "vitest";
import {
  QUICK_MAX_DOGS, quickDogLines, quickWalkInTotal,
  type QuickDog,
} from "@shared/quickAppointment";

/**
 * A service and a price per dog on one walk-in.
 *
 * Andy, 09/11/2026, looking at a two-dog walk-in with one service
 * picker and one "Price each" between them: "I think these dogs need to
 * have services linked individually."
 */
const first = {
  name: "Jeff", breed: "Mastiff X",
  serviceType: "nail_trim" as const, price: "25",
};
const dog = (over: Partial<QuickDog> & { name: string }): QuickDog => ({ ...over });

describe("quickDogLines", () => {
  it("returns the first dog on its own when nobody else came in", () => {
    const lines = quickDogLines(first, []);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ name: "Jeff", serviceType: "nail_trim", rawPrice: "25" });
  });

  /*
   * The whole point. Two dogs in together is routinely one nail clip
   * and one quick bath, and a single picker forced staff to either take
   * the walk-in twice or record one of them as something it was not.
   */
  it("gives each dog the service it was actually booked for", () => {
    const lines = quickDogLines(first, [
      dog({ name: "Meff", serviceType: "bath_only", price: "40" }),
    ]);
    expect(lines.map((l) => [l.name, l.serviceType, l.rawPrice])).toEqual([
      ["Jeff", "nail_trim", "25"],
      ["Meff", "bath_only", "40"],
    ]);
  });

  /*
   * Lauren's four-dog nail family. Her actual order of work is four
   * names first and one price at the end — so a value COPIED when the
   * row was added would have left three dogs on whatever the box held
   * before she got to it.
   */
  it("lets a price typed once at the end reach every dog", () => {
    const names = [dog({ name: "B" }), dog({ name: "C" }), dog({ name: "D" })];
    const unpriced = quickDogLines({ ...first, price: "" }, names);
    expect(unpriced.map((l) => l.rawPrice)).toEqual(["", "", "", ""]);

    const priced = quickDogLines({ ...first, price: "25" }, names);
    expect(priced.map((l) => l.rawPrice)).toEqual(["25", "25", "25", "25"]);
    expect(priced.map((l) => l.serviceType)).toEqual(
      ["nail_trim", "nail_trim", "nail_trim", "nail_trim"],
    );
  });

  it("stops a dog following once it has been given its own", () => {
    const lines = quickDogLines(first, [
      dog({ name: "Meff", price: "40" }),
      dog({ name: "Neff" }),
    ]);
    expect(lines.map((l) => l.rawPrice)).toEqual(["25", "40", "25"]);
  });

  /*
   * `??` not `||`. A free second nail clip for a regular is a real
   * thing at a counter, and `||` would quietly charge it at the first
   * dog's price.
   */
  it("treats an emptied price as free, not as following the first dog", () => {
    const lines = quickDogLines(first, [dog({ name: "Meff", price: "" })]);
    expect(lines[1].rawPrice).toBe("");
  });

  it("drops a blank row and a repeated name rather than booking them", () => {
    const lines = quickDogLines(first, [
      dog({ name: "  " }), dog({ name: "Meff" }), dog({ name: "meff" }),
    ]);
    expect(lines.map((l) => l.name)).toEqual(["Jeff", "Meff"]);
  });

  it("never returns more dogs than one walk-in may carry", () => {
    const many = Array.from({ length: 12 }, (_, i) => dog({ name: `Dog ${i}` }));
    expect(quickDogLines(first, many)).toHaveLength(QUICK_MAX_DOGS);
  });
});

describe("quickWalkInTotal", () => {
  it("adds the dogs up rather than multiplying one price", () => {
    const lines = quickDogLines(first, [dog({ name: "Meff", price: "40" })]);
    expect(quickWalkInTotal(lines)).toEqual({ ok: true, total: "65.00" });
  });

  it("still multiplies out correctly when they all follow the first", () => {
    const lines = quickDogLines(first, [dog({ name: "B" }), dog({ name: "C" })]);
    expect(quickWalkInTotal(lines)).toEqual({ ok: true, total: "75.00" });
  });

  it("takes the counter's spelling of money", () => {
    const lines = quickDogLines({ ...first, price: "$25.00 " }, [
      dog({ name: "Meff", price: "$1,250" }),
    ]);
    expect(quickWalkInTotal(lines)).toEqual({ ok: true, total: "1275.00" });
  });

  it("counts a free dog as free rather than refusing the walk-in", () => {
    const lines = quickDogLines(first, [dog({ name: "Meff", price: "" })]);
    expect(quickWalkInTotal(lines)).toEqual({ ok: true, total: "25.00" });
  });

  it("is null when nothing has been priced yet", () => {
    const lines = quickDogLines({ ...first, price: "" }, [dog({ name: "Meff" })]);
    expect(quickWalkInTotal(lines)).toEqual({ ok: true, total: null });
  });

  /*
   * Named, not counted. With a price each, "that is not a price" is
   * useless to somebody holding a dog — they need to know which box.
   */
  it("says which dog's price it cannot read", () => {
    const lines = quickDogLines(first, [dog({ name: "Meff", price: "forty-ish" })]);
    const result = quickWalkInTotal(lines);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Meff");
      expect(result.reason).toContain("forty-ish");
    }
  });

  it("does not name the dog when there is only one box to look at", () => {
    const result = quickWalkInTotal(quickDogLines({ ...first, price: "two fifty" }, []));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).not.toContain("Jeff");
  });
});
