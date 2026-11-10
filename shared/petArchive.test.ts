import { describe, expect, it } from "vitest";
import { archiveBlocker, isPetArchived, isPetCurrent } from "./petArchive";

const base = { name: "Lena", status: "active", upcomingBookings: 0, memberships: [] as string[] };

describe("isPetCurrent", () => {
  it("is true only for a dog that is neither departed nor archived", () => {
    expect(isPetCurrent("active")).toBe(true);
    expect(isPetCurrent(null)).toBe(true);
    expect(isPetCurrent("departed")).toBe(false);
    expect(isPetCurrent("archived")).toBe(false);
  });

  it("tells archived apart from departed", () => {
    expect(isPetArchived("archived")).toBe(true);
    expect(isPetArchived("departed")).toBe(false);
  });
});

describe("archiveBlocker", () => {
  it("lets a dog with nothing live be archived", () => {
    expect(archiveBlocker(base)).toBeNull();
  });

  it("refuses while bookings are still ahead, and counts them", () => {
    expect(archiveBlocker({ ...base, upcomingBookings: 1 })).toBe("Lena has 1 upcoming booking. Cancel or move it first.");
    expect(archiveBlocker({ ...base, upcomingBookings: 5 })).toContain("5 upcoming bookings");
  });

  it("refuses while the dog is on a membership", () => {
    expect(archiveBlocker({ ...base, memberships: ["Silver VIP Classic - Small (0-10kg)"] }))
      .toContain("Silver VIP Classic - Small (0-10kg)");
  });

  it("does not archive a dog recorded as passed away", () => {
    expect(archiveBlocker({ ...base, status: "departed" })).toContain("passed away");
  });

  it("says so when it is already archived", () => {
    expect(archiveBlocker({ ...base, status: "archived" })).toBe("Lena is already archived.");
  });

  it("names the dog even when the name is missing", () => {
    expect(archiveBlocker({ ...base, name: "  ", upcomingBookings: 2 })).toMatch(/^This dog has 2/);
  });
});
