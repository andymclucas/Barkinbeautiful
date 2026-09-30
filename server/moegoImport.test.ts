import { describe, it, expect } from "vitest";
import { parseMoegoCsv, parseMoegoPets, phoneMatchKey } from "../shared/moegoImport";

describe("parseMoegoPets", () => {
  it("reads a plain Name(Breed) entry", () => {
    expect(parseMoegoPets("Toddy(Lhasa Apso)")).toEqual([
      { name: "Toddy", breed: "Lhasa Apso", nickname: "" },
    ]);
  });

  it("splits several pets", () => {
    const pets = parseMoegoPets("Mini(French Bulldog),Max(Labrador Retriever)");
    expect(pets.map((p) => p.name)).toEqual(["Mini", "Max"]);
    expect(pets.map((p) => p.breed)).toEqual(["French Bulldog", "Labrador Retriever"]);
  });

  it("keeps a bracketed breed whole instead of inventing a second dog", () => {
    // Regression: the old regex returned Jose'e AND a phantom pet "Chihuahua".
    const pets = parseMoegoPets("Jose'e(Chihuahua (Long Coat))");
    expect(pets).toHaveLength(1);
    expect(pets[0]).toEqual({ name: "Jose'e", breed: "Chihuahua (Long Coat)", nickname: "" });
  });

  it("never produces a breed name as a pet name", () => {
    const pets = parseMoegoPets("Chewe(chaway)(Poodle (Toy)),Ace(Eisuke)(Poodle (Toy))");
    expect(pets.map((p) => p.name)).toEqual(["Chewe", "Ace"]);
    expect(pets.map((p) => p.name)).not.toContain("Poodle");
  });

  it("treats the last bracket group as the breed and earlier ones as a nickname", () => {
    expect(parseMoegoPets("Saffron(saffie)(Border Collie)")).toEqual([
      { name: "Saffron", breed: "Border Collie", nickname: "saffie" },
    ]);
  });

  it("does not split on a comma inside a breed", () => {
    const pets = parseMoegoPets("Dennis(Dachshund (Miniature, Smooth Haired))");
    expect(pets).toHaveLength(1);
    expect(pets[0].breed).toBe("Dachshund (Miniature, Smooth Haired)");
  });

  it("handles a pet with no breed at all", () => {
    expect(parseMoegoPets("Bluey")).toEqual([{ name: "Bluey", breed: "", nickname: "" }]);
  });

  it("keeps the dog when MoeGo's own brackets are unbalanced", () => {
    // Real row: Meredyn Hayler's Goldie.
    const pets = parseMoegoPets("Goldie(daughter's. no pension(Pomeranian)");
    expect(pets).toHaveLength(1);
    expect(pets[0].name).toBe("Goldie");
  });

  it("returns nothing for an empty cell", () => {
    expect(parseMoegoPets("")).toEqual([]);
    expect(parseMoegoPets("   ")).toEqual([]);
  });
});

describe("parseMoegoCsv", () => {
  it("reads quoted fields separated by tab-comma", () => {
    expect(parseMoegoCsv('"Jane"\t,"Doe"\t,"jane@example.com"')).toEqual([
      ["Jane", "Doe", "jane@example.com"],
    ]);
  });

  it("keeps a record together when a field contains a newline", () => {
    // Regression: splitting the file on newlines shifted every later column,
    // producing rows whose "first name" was a phone number.
    const rows = parseMoegoCsv('"Jane"\t,"Doe"\t,"line one\nline two"\t,"0412345678"\n"Bob"\t,"Smith"\t,""\t,"0498765432"');
    expect(rows).toHaveLength(2);
    expect(rows[0][2]).toBe("line one\nline two");
    expect(rows[0][3]).toBe("0412345678");
    expect(rows[1][0]).toBe("Bob");
  });

  it("keeps a record together when a field contains a comma", () => {
    const rows = parseMoegoCsv('"Jane"\t,"12 Smith St, Wynnum, QLD"\t,"x"');
    expect(rows[0]).toEqual(["Jane", "12 Smith St, Wynnum, QLD", "x"]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseMoegoCsv('"say ""hi"""\t,"b"')[0][0]).toBe('say "hi"');
  });

  it("gives every row the same width so a slipped parse is detectable", () => {
    const rows = parseMoegoCsv('"a"\t,"b"\t,"c"\n"d"\t,"e\nf"\t,"g"');
    expect(rows.every((r) => r.length === rows[0].length)).toBe(true);
  });

  it("skips blank lines", () => {
    expect(parseMoegoCsv('"a"\t,"b"\n\n\n"c"\t,"d"')).toHaveLength(2);
  });
});

describe("phoneMatchKey", () => {
  it("matches the same number across Australian formats", () => {
    const k = phoneMatchKey("0412345678");
    expect(phoneMatchKey("+61412345678")).toBe(k);
    expect(phoneMatchKey("61412345678")).toBe(k);
    expect(phoneMatchKey("0412 345 678")).toBe(k);
  });

  it("refuses to match on too few digits, so two unknowns never pair up", () => {
    expect(phoneMatchKey("1234")).toBe("");
    expect(phoneMatchKey("")).toBe("");
    expect(phoneMatchKey(null)).toBe("");
    expect(phoneMatchKey(undefined)).toBe("");
  });

  it("keeps different numbers apart", () => {
    expect(phoneMatchKey("0412345678")).not.toBe(phoneMatchKey("0498765432"));
  });
});
