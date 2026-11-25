import { describe, expect, it } from "vitest";
import { dateOfBirthFromAge, filledDogs, newClientFormProblems, type NewClientFormInput } from "./newClientForm";

const good: NewClientFormInput = {
  firstName: "Sam",
  lastName: "Taylor",
  phone: "0412 345 678",
  email: "sam@example.com",
  address: "1 Example St, Brisbane QLD 4000",
  dogs: [{ name: "Biscuit", breed: "Cavoodle", ageYears: 3, weightKg: 8 }],
};

describe("New Client Form (Andy, 25/11/2026)", () => {
  it("accepts a complete form", () => {
    expect(newClientFormProblems(good)).toEqual([]);
  });

  it("asks for each client detail", () => {
    const problems = newClientFormProblems({ ...good, firstName: "", lastName: " ", phone: "12", email: "nope", address: "" });
    expect(problems).toHaveLength(5);
  });

  it("needs at least one dog with a name and breed", () => {
    expect(newClientFormProblems({ ...good, dogs: [] })).toContain("Please tell us about at least one dog.");
    expect(newClientFormProblems({ ...good, dogs: [{ name: "", breed: "", ageYears: null, weightKg: null }] }))
      .toContain("Please tell us about at least one dog.");
    expect(newClientFormProblems({ ...good, dogs: [{ name: "Biscuit", breed: "", ageYears: null, weightKg: null }] }))
      .toContain("Your dog: please enter a breed (a best guess is fine).");
  });

  it("lets age and weight be left blank, but not be nonsense", () => {
    expect(newClientFormProblems({ ...good, dogs: [{ name: "Biscuit", breed: "Cavoodle", ageYears: null, weightKg: null }] })).toEqual([]);
    expect(newClientFormProblems({ ...good, dogs: [{ name: "Biscuit", breed: "Cavoodle", ageYears: 40, weightKg: 0 }] }))
      .toEqual(["Your dog: please check the age.", "Your dog: please check the weight."]);
  });

  it("drops empty dog rows", () => {
    expect(filledDogs([...good.dogs, { name: " ", breed: "", ageYears: null, weightKg: null }])).toHaveLength(1);
  });

  it("turns an age into an approximate date of birth on the 1st", () => {
    const now = new Date("2026-11-25T02:00:00Z");
    expect(dateOfBirthFromAge(3, now)?.toISOString().slice(0, 10)).toBe("2023-11-01");
    expect(dateOfBirthFromAge(0.5, now)?.toISOString().slice(0, 10)).toBe("2026-05-01");
    expect(dateOfBirthFromAge(null, now)).toBeNull();
  });
});
