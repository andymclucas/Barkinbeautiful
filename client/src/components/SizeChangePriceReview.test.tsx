import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SizeChangePriceReview, type SizeReviewBooking } from "./SizeChangePriceReview";

const choices = [
  { tier: "new" as const, label: "New client", price: "150.00", from: "Classic - New Client - Small" },
  { tier: "regular" as const, label: "Regular client", price: "135.00", from: "Classic - Regular Client - Small" },
  { tier: "vip" as const, label: "VIP client", price: "120.00", from: "Classic - VIP Client - Small" },
];

const booking = (over: Partial<SizeReviewBooking> = {}): SizeReviewBooking => ({
  id: 11,
  scheduledStart: "2027-01-15T01:30:00.000Z", // Fri 15 Jan 2027, 11:30 am Brisbane
  serviceType: "classic_groom",
  currentPrice: "145.00",
  onMembership: false,
  choices,
  ...over,
});

function setup(over: Partial<Parameters<typeof SizeChangePriceReview>[0]> = {}) {
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(
    <SizeChangePriceReview
      petName="Samson"
      sizeLabel="Small (0–10 kg)"
      membershipName={null}
      bookings={[booking()]}
      saving={false}
      onApply={onApply}
      onClose={onClose}
      {...over}
    />,
  );
  return { onApply, onClose };
}

describe("SizeChangePriceReview", () => {
  it("shows the booking with its price now and the three rates for the new size", () => {
    setup();
    expect(screen.getByText(/Fri, 15 Jan 2027 ·/)).toBeInTheDocument();
    expect(screen.getByLabelText("Leave as it is ($145.00)")).toBeChecked();
    expect(screen.getByLabelText("New client: $150.00")).toBeInTheDocument();
    expect(screen.getByLabelText("Regular client: $135.00")).toBeInTheDocument();
    expect(screen.getByLabelText("VIP client: $120.00")).toBeInTheDocument();
  });

  it("changes nothing until a price is chosen", () => {
    const { onApply } = setup();
    expect(screen.getByRole("button", { name: "Update prices" })).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("applies the rate that was picked", () => {
    const { onApply } = setup();
    fireEvent.click(screen.getByLabelText("Regular client: $135.00"));
    fireEvent.click(screen.getByRole("button", { name: "Update 1 price" }));
    expect(onApply).toHaveBeenCalledWith([{ appointmentId: 11, price: "135.00" }]);
  });

  it("applies a price staff typed themselves", () => {
    const { onApply } = setup();
    fireEvent.change(screen.getByLabelText(/Your own price for/), { target: { value: "152.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Update 1 price" }));
    expect(onApply).toHaveBeenCalledWith([{ appointmentId: 11, price: "152.50" }]);
  });

  it("points out a custom price left blank instead of saving", () => {
    const { onApply } = setup();
    fireEvent.focus(screen.getByLabelText(/Your own price for/));
    fireEvent.click(screen.getByRole("button", { name: "Update 1 price" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Type a price, or pick one of the options.");
    expect(onApply).not.toHaveBeenCalled();
  });

  it("only sends the bookings that changed", () => {
    const { onApply } = setup({ bookings: [booking(), booking({ id: 12, scheduledStart: "2027-03-12T01:30:00.000Z" })] });
    fireEvent.click(screen.getAllByLabelText("New client: $150.00")[1]);
    fireEvent.click(screen.getByRole("button", { name: "Update 1 price" }));
    expect(onApply).toHaveBeenCalledWith([{ appointmentId: 12, price: "150.00" }]);
  });

  it("offers no price on a groom the membership pays for, and flags the plan", () => {
    setup({ membershipName: "Bronze VIP Classic - SML (0-10kg)", bookings: [booking({ onMembership: true, currentPrice: "0.00" })] });
    expect(screen.getByText(/Paid for by the membership/)).toBeInTheDocument();
    expect(screen.queryByLabelText("New client: $150.00")).toBeNull();
    expect(screen.getByRole("note")).toHaveTextContent("check the plan and its weekly price still match");
  });

  it("says so when there is nothing to check", () => {
    setup({ bookings: [] });
    expect(screen.getByText("No upcoming bookings to check.")).toBeInTheDocument();
  });

  it("says a discount will go, and what has already been paid, before a price is chosen", () => {
    setup({ bookings: [booking({ discountPercent: 10, alreadyPaid: 20 })] });
    expect(screen.getByText("This booking has a 10% discount. Choosing a new price removes it.")).toBeInTheDocument();
    expect(screen.getByText("$20.00 has already been paid on this booking.")).toBeInTheDocument();
  });

  it("offers no price where the bill has been set by hand", () => {
    setup({ bookings: [booking({ hasBillingOverride: true })] });
    expect(screen.getByText(/bill for this booking has been set by hand/)).toBeInTheDocument();
    expect(screen.queryByLabelText("New client: $150.00")).toBeNull();
  });

  it("names the price-list row behind each rate", () => {
    setup();
    expect(screen.getByText("Classic - Regular Client - Small")).toBeInTheDocument();
  });
});
