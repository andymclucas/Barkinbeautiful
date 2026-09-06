import { describe, expect, it } from "vitest";
import { normalizePetAlertLevel } from "../shared/petAlertStatus";

describe("normalizePetAlertLevel", () => {
  it("suppresses legacy and empty non-actionable statuses", () => {
    expect(normalizePetAlertLevel("ok")).toBeNull();
    expect(normalizePetAlertLevel(" OK ")).toBeNull();
    expect(normalizePetAlertLevel("")).toBeNull();
    expect(normalizePetAlertLevel(null)).toBeNull();
  });

  it("retains only genuine caution and danger notices", () => {
    expect(normalizePetAlertLevel("caution")).toBe("caution");
    expect(normalizePetAlertLevel("DANGER")).toBe("danger");
  });
});
