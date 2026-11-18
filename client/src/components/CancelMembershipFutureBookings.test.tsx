import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CancelMembershipFutureBookings, type CancelPreviewBooking } from "./CancelMembershipFutureBookings";

const booking = (id: number, normalPrice: string | null): CancelPreviewBooking => ({
  id,
  petName: "Bella",
  scheduledStart: "2027-01-12T22:00:00.000Z", // Wed 13 Jan 2027, 8:00 am Brisbane
  currentPrice: "0.00",
  normalPrice,
});

describe("CancelMembershipFutureBookings", () => {
  it("shows nothing when the membership has no future bookings", () => {
    const { container } = render(<CancelMembershipFutureBookings bookings={[]} choice={null} onChoice={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists each booking on its Brisbane day with the price it would go back to", () => {
    render(<CancelMembershipFutureBookings bookings={[booking(1, "110.00")]} choice={null} onChoice={() => {}} />);
    expect(screen.getByText("1 future booking on this membership")).toBeInTheDocument();
    expect(screen.getByText(/Wed, 13 Jan 2027/)).toBeInTheDocument();
    expect(screen.getByText("normal price $110.00")).toBeInTheDocument();
  });

  it("pre-selects neither answer", () => {
    render(<CancelMembershipFutureBookings bookings={[booking(1, "110.00"), booking(2, "110.00")]} choice={null} onChoice={() => {}} />);
    for (const radio of screen.getAllByRole("radio")) expect(radio).not.toBeChecked();
  });

  it("reports the answer that was picked", () => {
    const onChoice = vi.fn();
    render(<CancelMembershipFutureBookings bookings={[booking(1, "110.00"), booking(2, "110.00")]} choice={null} onChoice={onChoice} />);
    fireEvent.click(screen.getByRole("radio", { name: /Keep the bookings/ }));
    expect(onChoice).toHaveBeenCalledWith("keep");
    fireEvent.click(screen.getByRole("radio", { name: /Remove the bookings/ }));
    expect(onChoice).toHaveBeenCalledWith("remove");
  });

  it("warns when a booking has no normal price to go back to", () => {
    render(<CancelMembershipFutureBookings bookings={[booking(1, "110.00"), booking(2, null)]} choice="keep" onChoice={() => {}} />);
    expect(screen.getByText("no normal price found")).toBeInTheDocument();
    expect(screen.getByText(/1 of them has no normal price on the price list/)).toBeInTheDocument();
  });

  it("says the client is not texted when bookings are removed", () => {
    render(<CancelMembershipFutureBookings bookings={[booking(1, "110.00")]} choice="remove" onChoice={() => {}} />);
    expect(screen.getByText(/The client is not texted, so let them know/)).toBeInTheDocument();
  });

  it("shows that a booking which already has a real price keeps it", () => {
    render(<CancelMembershipFutureBookings bookings={[{ ...booking(1, "180.00"), currentPrice: "110.00" }]} choice="keep" onChoice={() => {}} />);
    expect(screen.getByText("keeps $110.00")).toBeInTheDocument();
    expect(screen.queryByText("normal price $180.00")).toBeNull();
  });
});
