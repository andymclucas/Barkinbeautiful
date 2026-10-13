import { describe, it, expect } from "vitest";
import {
  appointmentDetailChanges,
  hasAppointmentDetailChanges,
} from "@shared/appointmentDetailChanges";

// A discounted booking: $125 off the back of a 10% discount somebody applied
// deliberately. The server drops the whole discount block the moment a price
// arrives, so the test that matters is which fields get sent.
const GUS = { serviceType: "classic_groom", notes: "Nervous around clippers", price: "125.00" };

describe("appointmentDetailChanges", () => {
  it("sends nothing when nothing changed", () => {
    const changes = appointmentDetailChanges(GUS, {
      serviceType: "classic_groom", notes: "Nervous around clippers", price: "125.00",
    });
    expect(changes).toEqual({});
    expect(hasAppointmentDetailChanges(changes)).toBe(false);
  });

  it("does not resend the price when only the notes changed", () => {
    // The money test. The old dialog sent all three whenever any one of them
    // differed, so editing a note wiped the discount off the booking.
    const changes = appointmentDetailChanges(GUS, {
      serviceType: "classic_groom", notes: "Nervous around clippers, muzzle on", price: "125.00",
    });
    expect(changes).toEqual({ notes: "Nervous around clippers, muzzle on" });
    expect("price" in changes).toBe(false);
  });

  it("does not resend the price when only the service changed", () => {
    // Same hazard via the new per-dog service dropdown.
    const changes = appointmentDetailChanges(GUS, {
      serviceType: "styled_groom", notes: "Nervous around clippers", price: "125.00",
    });
    expect(changes).toEqual({ serviceType: "styled_groom" });
    expect("price" in changes).toBe(false);
  });

  it("sends the price when the price really changed", () => {
    const changes = appointmentDetailChanges(GUS, { price: "140.00" });
    expect(changes).toEqual({ price: "140.00" });
  });

  it("ignores a field the caller is not editing", () => {
    // Siblings get a service and a price and never a note, so notes must not
    // be compared against "" and blanked.
    const changes = appointmentDetailChanges(GUS, { serviceType: "styled_groom" });
    expect(changes).toEqual({ serviceType: "styled_groom" });
    expect("notes" in changes).toBe(false);
    expect("price" in changes).toBe(false);
  });

  it("treats an untouched sibling dropdown as no change", () => {
    // siblingServices[id] is undefined until the groomer picks something.
    const changes = appointmentDetailChanges(GUS, {
      serviceType: undefined, price: undefined,
    });
    expect(hasAppointmentDetailChanges(changes)).toBe(false);
  });

  it("turns a cleared field into null, not an empty string", () => {
    const changes = appointmentDetailChanges(GUS, { notes: "", price: "" });
    expect(changes).toEqual({ notes: null, price: null });
  });

  it("treats a null current value as empty rather than a change", () => {
    // A dog with no note on file must not look edited just by being opened.
    const blank = { serviceType: "classic_groom", notes: null, price: null };
    const changes = appointmentDetailChanges(blank, { notes: "", price: "" });
    expect(hasAppointmentDetailChanges(changes)).toBe(false);
  });
});

describe("a family where the two dogs want different things", () => {
  it("gives each dog its own payload", () => {
    // Gus & Beau Austin: both classic at $125. Beau goes styled, Gus does not.
    const gus = { serviceType: "classic_groom", price: "125.00" };
    const beau = { serviceType: "classic_groom", price: "125.00" };

    const gusChanges = appointmentDetailChanges(gus, { serviceType: "classic_groom", price: "125.00" });
    const beauChanges = appointmentDetailChanges(beau, { serviceType: "styled_groom", price: "145.00" });

    expect(hasAppointmentDetailChanges(gusChanges)).toBe(false);
    expect(beauChanges).toEqual({ serviceType: "styled_groom", price: "145.00" });
  });

  it("does not let one dog's service follow the other", () => {
    // The whole point of the change: the service is a property of the dog,
    // not of the booking.
    const beau = { serviceType: "styled_groom", price: "145.00" };
    const changes = appointmentDetailChanges(beau, { serviceType: "styled_groom" });
    expect(hasAppointmentDetailChanges(changes)).toBe(false);
  });
});
