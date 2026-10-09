import { describe, expect, it } from "vitest";
import { parseClientTags, clientTagTone, worstClientTagTone } from "@shared/clientTags";

describe("MoeGo client tags", () => {
  it("splits the salon's real tag strings", () => {
    expect(parseClientTags("VIP, 2 weeks client, Generous"))
      .toEqual(["VIP", "2 weeks client", "Generous"]);
    expect(parseClientTags("VIP")).toEqual(["VIP"]);
    expect(parseClientTags(null)).toEqual([]);
    expect(parseClientTags(" , ,")).toEqual([]);
  });

  it("marks the tags that should stop a booking", () => {
    for (const tag of ["BANNED", "DONT BOOK IN", "Refuse new bookings", "Owes money", "MUST PRE-PAY"]) {
      expect(clientTagTone(tag)).toBe("blocking");
    }
  });

  it("matches the salon's own spelling", () => {
    // "DOG AGRESSIVE" is how it is typed in MoeGo — one G.
    expect(clientTagTone("DOG AGRESSIVE")).toBe("caution");
    expect(clientTagTone("NOT DOG FRIENDLY")).toBe("caution");
    expect(clientTagTone("cancels alot  - pre pay")).toBe("caution");
  });

  it("leaves the friendly ones quiet", () => {
    for (const tag of ["VIP", "Generous", "2 weeks client", "Pick up & delivery", "CUSTOMER FORM"]) {
      expect(clientTagTone(tag)).toBe("neutral");
    }
  });

  it("reports the loudest tag on a client", () => {
    expect(worstClientTagTone("VIP, BANNED")).toBe("blocking");
    expect(worstClientTagTone("VIP, NOISY")).toBe("caution");
    expect(worstClientTagTone("VIP, Generous")).toBe("neutral");
    expect(worstClientTagTone(null)).toBeNull();
  });
});
