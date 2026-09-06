import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const calendarSource = readFileSync(new URL("../client/src/pages/Calendar.tsx", import.meta.url), "utf8");

describe("Grooming Card manual delivery safeguard", () => {
  it("retains an explicit confirmation before the administrator-initiated email action", () => {
    expect(calendarSource).toContain("Email card");
    expect(calendarSource).toContain("window.confirm");
    expect(calendarSource).toContain("reviewed Grooming Card");
  });

  it("does not introduce an automatic Grooming Card send path", () => {
    expect(calendarSource).not.toContain("autoSendGroomingCard");
    expect(calendarSource).not.toContain("sendGroomingCardAutomatically");
  });
});
