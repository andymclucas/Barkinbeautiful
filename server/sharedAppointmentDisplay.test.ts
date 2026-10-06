import { describe, expect, it } from "vitest";
import { formatSharedAppointmentName, formatAppointmentHeading } from "../shared/appointmentDisplay";

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
