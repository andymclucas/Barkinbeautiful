import { describe, it, expect } from "vitest";
import {
  canTextContact,
  contactBadgeLabel,
  contactChoiceIsStale,
  contactOptions,
  joinedContactBadge,
  resolveAppointmentContact,
} from "@shared/appointmentContact";

// Andy's own record, which is where this was first set up.
const CLIENT = { firstName: "Andy", lastName: "McLucas", phone: "0400000000" };
const CHRISTIE = { id: 7, name: "Christie McLucas", phone: "0407576731", relationship: "Wife" };
const ROCHELLE = { id: 9, name: "Rochelle", phone: "0411222333", relationship: null };

describe("contactOptions", () => {
  it("puts the client first", () => {
    const options = contactOptions(CLIENT, [CHRISTIE]);
    expect(options[0]).toMatchObject({ id: null, name: "Andy McLucas", isPrimary: true });
    expect(options[1]).toMatchObject({ id: 7, name: "Christie McLucas", relationship: "Wife" });
  });

  it("labels a contact with no relationship rather than leaving it blank", () => {
    const [, rochelle] = contactOptions(CLIENT, [ROCHELLE]);
    expect(rochelle.relationship).toBe("Additional contact");
  });

  it("still lists a contact with no phone", () => {
    // The salon may hold only a name and an email. Hiding the row would make
    // the record look empty; whether it can be texted is a separate question.
    const [, noPhone] = contactOptions(CLIENT, [{ id: 3, name: "Neighbour", phone: null }]);
    expect(noPhone.name).toBe("Neighbour");
    expect(canTextContact(noPhone)).toBe(false);
  });

  it("offers the client even when they have no number on file", () => {
    const options = contactOptions({ firstName: "Jo", lastName: "Bloggs", phone: null }, []);
    expect(options).toHaveLength(1);
    expect(canTextContact(options[0])).toBe(false);
  });

  it("gives an empty list when there is nothing to show", () => {
    expect(contactOptions({}, [])).toEqual([]);
  });
});

describe("resolveAppointmentContact", () => {
  const options = contactOptions(CLIENT, [CHRISTIE, ROCHELLE]);

  it("means the client when nothing was chosen", () => {
    // Every appointment made before this existed has a null contactId, and
    // the client is what all of them meant.
    expect(resolveAppointmentContact(options, null)).toMatchObject({ id: null, isPrimary: true });
    expect(resolveAppointmentContact(options, undefined)).toMatchObject({ id: null });
  });

  it("returns the chosen contact", () => {
    expect(resolveAppointmentContact(options, 9)).toMatchObject({ id: 9, name: "Rochelle" });
  });

  it("falls back to the client when the chosen contact has been removed", () => {
    // A booking whose contact was deleted must still be ringable. Showing no
    // contact at all is how a dog waits at the salon while nobody calls.
    expect(resolveAppointmentContact(options, 999)).toMatchObject({ id: null, isPrimary: true });
  });

  it("returns null only when the client has no record to speak of", () => {
    expect(resolveAppointmentContact([], 9)).toBeNull();
  });
});

describe("contactChoiceIsStale", () => {
  const options = contactOptions(CLIENT, [CHRISTIE]);

  it("flags a choice pointing at a contact that is gone", () => {
    // Worth saying out loud on the card: the booking says "text Rochelle"
    // and Rochelle is no longer on the file.
    expect(contactChoiceIsStale(options, 999)).toBe(true);
  });

  it("does not flag the client or a contact still on file", () => {
    expect(contactChoiceIsStale(options, null)).toBe(false);
    expect(contactChoiceIsStale(options, 7)).toBe(false);
  });
});

describe("contactBadgeLabel", () => {
  const options = contactOptions(CLIENT, [CHRISTIE, ROCHELLE]);

  it("says nothing for the client — that is the normal case", () => {
    // The board would be a wall of the owner's own name otherwise.
    expect(contactBadgeLabel(resolveAppointmentContact(options, null))).toBeNull();
  });

  it("names the contact and how the salon knows them", () => {
    // "Rochelle" on its own means nothing to a groomer who has not met her.
    expect(contactBadgeLabel(resolveAppointmentContact(options, 7))).toBe("Christie McLucas (Wife)");
  });

  it("drops the filler relationship rather than printing it", () => {
    expect(contactBadgeLabel(resolveAppointmentContact(options, 9))).toBe("Rochelle");
  });

  it("says nothing when there is no contact at all", () => {
    expect(contactBadgeLabel(null)).toBeNull();
  });
});

describe("joinedContactBadge", () => {
  it("names the contact a joined row carries", () => {
    expect(joinedContactBadge({
      contactId: 7, contactName: "Christie McLucas", contactRelationship: "Wife",
    })).toBe("Christie McLucas (Wife)");
  });

  it("says nothing for a booking that is for the client", () => {
    // The owner's name already sits directly above on the board row.
    expect(joinedContactBadge({ contactId: null })).toBeNull();
    expect(joinedContactBadge({})).toBeNull();
  });

  it("says nothing when the contact has been deleted from the record", () => {
    // contactId set, join found nothing. A blank badge would be worse.
    expect(joinedContactBadge({ contactId: 7, contactName: null })).toBeNull();
  });

  it("matches what the appointment card shows for the same contact", () => {
    // The board and the card disagreeing about who to ring is the exact
    // confusion this feature exists to remove.
    const options = contactOptions(
      { firstName: "Andy", lastName: "McLucas", phone: "0400000000" },
      [{ id: 7, name: "Christie McLucas", phone: "0407576731", relationship: "Wife" }],
    );
    const fromCard = contactBadgeLabel(resolveAppointmentContact(options, 7));
    const fromBoard = joinedContactBadge({
      contactId: 7, contactName: "Christie McLucas", contactRelationship: "Wife",
    });
    expect(fromBoard).toBe(fromCard);
  });
});
