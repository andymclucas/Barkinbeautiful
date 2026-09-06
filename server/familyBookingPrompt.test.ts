import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const calendarSource = readFileSync(new URL("../client/src/pages/Calendar.tsx", import.meta.url), "utf8");
const clientDetailSource = readFileSync(new URL("../client/src/pages/ClientDetail.tsx", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const staffSource = readFileSync(new URL("../client/src/pages/Staff.tsx", import.meta.url), "utf8");

describe("remembered family companion booking", () => {
  it("offers staff linked family companions in the main calendar before creating a shared multi-pet session", () => {
    expect(calendarSource).toContain("const familyBookingCompanions = useMemo");
    expect(calendarSource).toContain("Include linked family dogs?");
    expect(calendarSource).toContain("Select any that should share this appointment.");
    expect(calendarSource).toContain("petIds: [...prev.petIds, String(pet.id)]");
    expect(calendarSource).toContain("trpc.calendar.createMultiPetAppointment.useMutation");
  });

  it("offers the same remembered companions from the client profile and includes only selected dogs", () => {
    expect(routerSource).toContain("familyGroupId: pets.familyGroupId");
    expect(clientDetailSource).toContain("const bookingFamilyCompanions");
    expect(clientDetailSource).toContain("Family-linked dogs");
    expect(clientDetailSource).toContain("Add family companions to this shared appointment?");
    expect(clientDetailSource).toContain("Array.from(new Set([bookPetId, ...bookFamilyPetIds]))");
  });

  it("opens a targeted timing review with the reviewed date and six prior days, and explains empty results accurately", () => {
    expect(staffSource).toContain("makeTimingRange(7, reviewDate)");
    expect(staffSource).toContain("No completed workflow timings were recorded in this period.");
    expect(staffSource).toContain("Choose Last 7 days or Last 4 weeks");
  });
});
