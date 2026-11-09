import { describe, it, expect } from "vitest";
import { bookingPetRows, type BookingPetInput } from "@shared/appointmentPets";

/**
 * The dogs on one booking.
 *
 * Andy, 09/11/2026: "the pets are not very noticeable as you can see
 * the MoeGo card has more details of the pets and they are clickable."
 */
const pet = (over: Partial<BookingPetInput> & { id: number; petId: number }): BookingPetInput => ({
  clientId: 440, petName: `Dog ${over.petId}`, petBreed: "Malt X",
  petMoegoCodeLabels: null, lastAppointmentDate: null, ...over,
});

describe("bookingPetRows", () => {
  it("keeps the lead dog first", () => {
    const rows = bookingPetRows(
      pet({ id: 1, petId: 10, petName: "Tilly" }),
      [pet({ id: 2, petId: 11, petName: "Mickey" })],
    );
    expect(rows.map((r) => r.name)).toEqual(["Tilly", "Mickey"]);
  });

  /*
   * The bug. petMoegoCodeLabels is per DOG, and the panel rendered the
   * LEAD appointment's once for the whole booking. On Renee Gannon's
   * booking MoeGo carries DONT PLUCK EARS against Mickey and nothing
   * against Tilly; Groomigo showed one set for the pair. A groomer
   * reading that either plucks Mickey's ears or does not pluck Tilly's,
   * and only one of those is recoverable.
   */
  it("gives each dog its OWN codes, never the booking's", () => {
    const rows = bookingPetRows(
      pet({ id: 1, petId: 10, petName: "Tilly", petMoegoCodeLabels: "Style C" }),
      [pet({ id: 2, petId: 11, petName: "Mickey", petMoegoCodeLabels: "Style C, DONT PLUCK EARS" })],
    );
    expect(rows[0]).toMatchObject({ name: "Tilly", codes: "Style C" });
    expect(rows[1]).toMatchObject({ name: "Mickey", codes: "Style C, DONT PLUCK EARS" });
    // And the warning must not leak onto the dog it is not about.
    expect(rows[0].codes).not.toContain("DONT PLUCK EARS");
  });

  it("leaves a dog with no codes empty rather than borrowing", () => {
    const rows = bookingPetRows(
      pet({ id: 1, petId: 10, petMoegoCodeLabels: "SENSITIVE" }),
      [pet({ id: 2, petId: 11, petMoegoCodeLabels: null })],
    );
    expect(rows[1].codes).toBeNull();
  });

  it("links each dog to its own record, not the client's", () => {
    const rows = bookingPetRows(
      pet({ id: 1, petId: 10, clientId: 440 }),
      [pet({ id: 2, petId: 11, clientId: 440 })],
    );
    expect(rows.map((r) => r.href)).toEqual([
      "/clients/440?pet=10",
      "/clients/440?pet=11",
    ]);
  });

  /* The panel builds its list as [lead, ...siblings]; a sibling query
     that ever included the lead would render that dog twice, with the
     same codes both times, which reads as two dogs. */
  it("renders a dog once even if it arrives twice", () => {
    const lead = pet({ id: 1, petId: 10, petName: "Tilly" });
    expect(bookingPetRows(lead, [lead, pet({ id: 2, petId: 11 })])).toHaveLength(2);
  });

  it("says nothing rather than something wrong when the breed is blank", () => {
    for (const petBreed of [null, "", "   "]) {
      const [row] = bookingPetRows(pet({ id: 1, petId: 10, petBreed }), []);
      expect(row.breed, JSON.stringify(petBreed)).toBeNull();
    }
    expect(bookingPetRows(pet({ id: 1, petId: 10, petBreed: " Malt X " }), [])[0].breed)
      .toBe("Malt X");
  });

  it("falls back to a name rather than printing nothing", () => {
    expect(bookingPetRows(pet({ id: 1, petId: 10, petName: null }), [])[0].name).toBe("This dog");
    expect(bookingPetRows(pet({ id: 1, petId: 10, petName: "  " }), [])[0].name).toBe("This dog");
  });

  it("reads the last visit, and drops an unusable one", () => {
    expect(bookingPetRows(pet({ id: 1, petId: 10, lastAppointmentDate: "2026-10-27T21:30:00Z" }), [])[0]
      .lastVisit?.toISOString()).toBe("2026-10-27T21:30:00.000Z");
    for (const bad of [null, undefined, "not a date"]) {
      expect(bookingPetRows(pet({ id: 1, petId: 10, lastAppointmentDate: bad as any }), [])[0].lastVisit)
        .toBeNull();
    }
  });

  it("handles a single-dog booking", () => {
    const rows = bookingPetRows(pet({ id: 1, petId: 10, petName: "Rusty" }), []);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Rusty");
  });
});
