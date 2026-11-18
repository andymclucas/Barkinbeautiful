import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CancelMembershipFutureBookings, type CancelPreviewBooking } from "./CancelMembershipFutureBookings";

const choices = [
  { tier: "new" as const, label: "New client", price: "180.00", from: "Full Groom (Styled) - New Client - Small" },
  { tier: "regular" as const, label: "Regular client", price: "163.00", from: "Full Groom (Styled) - Regular Client - Small" },
  { tier: "vip" as const, label: "VIP client", price: "145.00", from: "Full Groom (Styled) - VIP Client - Small" },
];

const booking = (id: number, over: Partial<CancelPreviewBooking> = {}): CancelPreviewBooking => ({
  id,
  petName: "Bella",
  scheduledStart: "2027-01-12T22:00:00.000Z", // Wed 13 Jan 2027, 8:00 am Brisbane
  serviceType: "styled_groom",
  currentPrice: "0.00",
  choices,
  ...over,
});

function setup(over: Partial<Parameters<typeof CancelMembershipFutureBookings>[0]> = {}) {
  const onChoice = vi.fn();
  const onDecision = vi.fn();
  render(
    <CancelMembershipFutureBookings
      bookings={[booking(1)]}
      choice={null}
      onChoice={onChoice}
      decisions={{}}
      onDecision={onDecision}
      {...over}
    />,
  );
  return { onChoice, onDecision };
}

describe("CancelMembershipFutureBookings", () => {
  it("shows nothing when the membership has no future bookings", () => {
    const { container } = render(
      <CancelMembershipFutureBookings bookings={[]} choice={null} onChoice={() => {}} decisions={{}} onDecision={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("asks keep or remove, with neither pre-selected", () => {
    setup({ bookings: [booking(1), booking(2)] });
    expect(screen.getByText("2 future bookings on this membership")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Keep the bookings/ })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: /Remove the bookings/ })).not.toBeChecked();
  });

  it("reports which was picked", () => {
    const { onChoice } = setup();
    fireEvent.click(screen.getByRole("radio", { name: /Keep the booking/ }));
    expect(onChoice).toHaveBeenCalledWith("keep");
    fireEvent.click(screen.getByRole("radio", { name: /Remove the booking/ }));
    expect(onChoice).toHaveBeenCalledWith("remove");
  });

  it("says the client is not texted when bookings are removed", () => {
    setup({ choice: "remove" });
    expect(screen.getByText(/The client is not texted, so let them know/)).toBeInTheDocument();
  });

  it("offers the three rates and a custom price for a kept booking, on its Brisbane day", () => {
    setup({ choice: "keep" });
    expect(screen.getByText(/Bella, Wed, 13 Jan 2027 ·/)).toBeInTheDocument();
    expect(screen.getByLabelText("New client: $180.00")).toBeInTheDocument();
    expect(screen.getByLabelText("Regular client: $163.00")).toBeInTheDocument();
    expect(screen.getByLabelText("VIP client: $145.00")).toBeInTheDocument();
    expect(screen.getByLabelText(/Your own price for Bella/)).toBeInTheDocument();
  });

  it("answers nothing for a booking the membership had made free", () => {
    setup({ choice: "keep" });
    for (const name of ["No price yet (fill it in later)", "New client: $180.00", "Regular client: $163.00", "VIP client: $145.00"]) {
      expect(screen.getByLabelText(name)).not.toBeChecked();
    }
  });

  it("starts a booking that already has a real price on keeping it", () => {
    setup({ choice: "keep", bookings: [booking(1, { currentPrice: "110.00" })] });
    expect(screen.getByLabelText("Keep the price on it ($110.00)")).toBeChecked();
  });

  it("reports the rate picked, and a price typed in", () => {
    const { onDecision } = setup({ choice: "keep" });
    fireEvent.click(screen.getByLabelText("Regular client: $163.00"));
    expect(onDecision).toHaveBeenCalledWith(1, { kind: "tier", tier: "regular" });
    fireEvent.change(screen.getByLabelText(/Your own price for Bella/), { target: { value: "110" } });
    expect(onDecision).toHaveBeenCalledWith(1, { kind: "custom", amount: "110" });
  });

  it("can answer every free booking with one rate, and leaves a priced one alone", () => {
    const { onDecision } = setup({ choice: "keep", bookings: [booking(1), booking(2), booking(3, { currentPrice: "110.00" })] });
    fireEvent.click(screen.getByRole("button", { name: "VIP client rate" }));
    expect(onDecision).toHaveBeenCalledWith(1, { kind: "tier", tier: "vip" });
    expect(onDecision).toHaveBeenCalledWith(2, { kind: "tier", tier: "vip" });
    expect(onDecision).not.toHaveBeenCalledWith(3, expect.anything());
  });

  it("says a discount will go, and what has been paid, before a price is chosen", () => {
    setup({ choice: "keep", bookings: [booking(1, { currentPrice: "110.00", discountPercent: 10, alreadyPaid: 20 })] });
    expect(screen.getByText("This booking has a 10% discount. Choosing a new price removes it.")).toBeInTheDocument();
    expect(screen.getByText("$20.00 has already been paid on this booking.")).toBeInTheDocument();
  });

  it("offers no price where the bill was set by hand", () => {
    setup({ choice: "keep", bookings: [booking(1, { hasBillingOverride: true })] });
    expect(screen.getByText(/bill for this booking was set by hand/)).toBeInTheDocument();
    expect(screen.queryByLabelText("New client: $180.00")).toBeNull();
  });

  it("shows what is wrong with a booking's answer", () => {
    setup({ choice: "keep", errors: { 1: "Choose a price for this booking." } });
    expect(screen.getByRole("alert")).toHaveTextContent("Choose a price for this booking.");
    expect(screen.getByText("1 booking still needs an answer above.")).toBeInTheDocument();
  });
});
