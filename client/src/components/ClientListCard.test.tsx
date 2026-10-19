import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ClientListCard, type ClientListCardData } from "./ClientListCard";

/**
 * The phone view of the client list.
 *
 * It exists because the table hid every column past the surname below
 * 640px, so a phone showed "Aaron" and "Harch" and nothing else. These
 * pin that the detail is actually there — a test that only checked the
 * card rendered would have passed on the old behaviour too.
 */

const fmt = (v: Date | string) =>
  new Date(v).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "2-digit", timeZone: "Australia/Brisbane" });

const client = (over: Partial<ClientListCardData> = {}): ClientListCardData => ({
  id: 1, firstName: "Aaron", lastName: "Harch", phone: "0418280122",
  email: "aaron@stormwarden.io", status: "active",
  pets: [{ id: 10, name: "Luna", breed: "Moodle" }],
  bookings: 32, firstVisit: "2024-08-01T00:00:00Z",
  lastVisit: "2026-09-23T00:00:00Z", nextVisit: "2026-10-21T00:00:00Z",
  ...over,
});

const show = (data: ClientListCardData) =>
  render(<ClientListCard client={data} statusClass="" formatDate={fmt} />);

describe("ClientListCard", () => {
  it("shows the things the table used to hide on a phone", () => {
    show(client());
    expect(screen.getByText("Aaron Harch")).toBeInTheDocument();
    expect(screen.getByText("Luna")).toBeInTheDocument();      // the dog
    expect(screen.getByText("Moodle")).toBeInTheDocument();    // its breed
    expect(screen.getByText("0418280122")).toBeInTheDocument();
    expect(screen.getByText("aaron@stormwarden.io")).toBeInTheDocument();
    expect(screen.getByText("32 bookings")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("names the last and next visit so they are not confused", () => {
    show(client());
    expect(screen.getByText(/^Last /)).toBeInTheDocument();
    expect(screen.getByText(/^Next /)).toBeInTheDocument();
    expect(screen.getByText(/^Since /)).toBeInTheDocument();
  });

  it("says booking singular for one", () => {
    show(client({ bookings: 1 }));
    expect(screen.getByText("1 booking")).toBeInTheDocument();
  });

  it("leaves out what it does not have, rather than printing blanks", () => {
    show(client({ phone: null, email: null, lastVisit: null, nextVisit: null, firstVisit: null, bookings: 0 }));
    expect(screen.queryByText(/^Last /)).toBeNull();
    expect(screen.queryByText(/^Next /)).toBeNull();
    expect(screen.queryByText(/^Since /)).toBeNull();
    expect(screen.getByText("0 bookings")).toBeInTheDocument();
  });

  it("still names a client with no dogs on file", () => {
    show(client({ pets: [] }));
    expect(screen.getByText("Aaron Harch")).toBeInTheDocument();
    expect(screen.getByText("No dogs")).toBeInTheDocument();
  });

  it("caps the dogs tighter than the table does", () => {
    // Two, not three: a card is already five lines tall and the phone
    // list has to stay scannable.
    const pets = Array.from({ length: 5 }, (_, i) => ({ id: i, name: `Dog ${i + 1}` }));
    show(client({ pets }));
    expect(screen.getByText("Dog 2")).toBeInTheDocument();
    expect(screen.queryByText("Dog 3")).toBeNull();
    expect(screen.getByText("+3 more")).toBeInTheDocument();
  });

  it("copes with a client who has no name", () => {
    show(client({ firstName: null, lastName: null }));
    expect(screen.getByText("Unnamed client")).toBeInTheDocument();
  });

  it("links to the client record", () => {
    const { container } = show(client({ id: 1162 }));
    expect(container.querySelector('a[href="/clients/1162"]')).not.toBeNull();
  });
});
