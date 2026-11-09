import { describe, expect, it } from "vitest";
import {
  formatSharedAppointmentName,
  formatAppointmentHeading,
  formatFamilyBookingCount,
  formatFamilyBookingLine,
} from "../shared/appointmentDisplay";

describe("formatSharedAppointmentName", () => {
  it("shows every booked pet before the household surname", () => {
    expect(formatSharedAppointmentName({ petNames: ["Molly", "Blits"], surname: "Aitken" })).toBe("Molly & Blits Aitken");
    expect(formatSharedAppointmentName({ petNames: ["Chester", "Snickers"], surname: "Waldon" })).toBe("Chester & Snickers Waldon");
  });

  it("does not add separators for missing pet names", () => {
    expect(formatSharedAppointmentName({ petNames: ["Molly", null, "  "], surname: "Aitken" })).toBe("Molly Aitken");
  });

  it("keeps the supplied booked-pet order before the household surname", () => {
    expect(formatSharedAppointmentName({ petNames: ["Molly", "Blits", "Pip"], surname: "Aitken" })).toBe("Molly & Blits & Pip Aitken");
  });
});

describe("what the Edit Appointment dialog is titled", () => {
  it("leads with the dog and the owner", () => {
    // Lauren, 07/10/2026: the name is "the most important part that needs to
    // be seen" — not the words "Edit Appointment".
    expect(formatAppointmentHeading({
      petNames: ["Koa"],
      clientFirstName: "Bernadette",
      clientLastName: "Ketter",
    })).toBe("Koa (Bernadette Ketter)");
  });

  it("uses the board's own wording when a booking covers several pets", () => {
    // So the dialog and the card the user just clicked agree.
    const petNames = ["Archie", "George"];
    const heading = formatAppointmentHeading({ petNames, clientLastName: "Ketter" });
    expect(heading).toBe("Archie & George Ketter");
    expect(heading).toBe(formatSharedAppointmentName({ petNames, surname: "Ketter" }));
  });

  it("drops the brackets when there is no client name", () => {
    expect(formatAppointmentHeading({ petNames: ["Koa"] })).toBe("Koa");
  });

  it("copes with only a first or only a last name", () => {
    expect(formatAppointmentHeading({ petNames: ["Koa"], clientFirstName: "Bernadette" }))
      .toBe("Koa (Bernadette)");
    expect(formatAppointmentHeading({ petNames: ["Koa"], clientLastName: "Ketter" }))
      .toBe("Koa (Ketter)");
  });

  it("never comes back blank", () => {
    // A dialog with no title at all is worse than a generic one.
    expect(formatAppointmentHeading({ petNames: [] })).toBe("Appointment");
    expect(formatAppointmentHeading({ petNames: [null, "  ", undefined] })).toBe("Appointment");
    expect(formatAppointmentHeading({ petNames: [], clientLastName: "Ketter" }))
      .toBe("Appointment (Ketter)");
  });

  it("ignores blanks among several pets", () => {
    expect(formatAppointmentHeading({
      petNames: ["Archie", "  ", null, "George"],
      clientLastName: "Ketter",
    })).toBe("Archie & George Ketter");
  });
});

describe("the family booking line", () => {
  it("counts the whole booking when the card holds all of it", () => {
    expect(formatFamilyBookingLine({ onThisCard: 2, inBooking: 2 })).toBe("2 dogs · family booking");
    expect(formatFamilyBookingLine({ onThisCard: 3, inBooking: 3 })).toBe("3 dogs · family booking");
  });

  it("says which share of the booking a split card holds", () => {
    // Benji with nobody, Sweety with Stephanie. Each card names one dog
    // and both say the booking has two, which is what stops the split
    // reading as two unrelated appointments.
    expect(formatFamilyBookingLine({ onThisCard: 1, inBooking: 2 })).toBe("1 of 2 dogs · family booking");
    expect(formatFamilyBookingCount({ onThisCard: 2, inBooking: 3 })).toBe("2 of 3 dogs");
  });

  it("puts the count first, because the line truncates on a narrow column", () => {
    expect(formatFamilyBookingLine({ onThisCard: 1, inBooking: 2 })).toMatch(/^1 of 2 dogs/);
  });

  it("never reads as more dogs on the card than in the booking", () => {
    // A caller that has the booking filtered by staff can hand in a card
    // wider than the booking it knows about; it must not print "2 of 1".
    expect(formatFamilyBookingCount({ onThisCard: 2, inBooking: 1 })).toBe("2 dogs");
    expect(formatFamilyBookingCount({ onThisCard: 1, inBooking: 1 })).toBe("1 dog");
    expect(formatFamilyBookingCount({ onThisCard: 0, inBooking: 0 })).toBe("0 dogs");
  });
});
