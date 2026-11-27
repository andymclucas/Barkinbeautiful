import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CheckBookingStep } from "./CheckBookingStep";
import { ONLINE_BOOKING_SERVICE_TYPES, onlineBookingServiceDescription } from "@shared/onlineBookingWeightEligibility";

describe("CheckBookingStep (Andy, 27/11/2026)", () => {
  const rows: Array<[string, string, string?]> = [
    ["Dog", "Poppy (German shepherd), 40 kg"],
    ["Service", "De-shed", "Bath, blow-dry and a deep brush-out to remove loose undercoat. No clipping or shaving."],
  ];

  it("reads back the choice, with what the service includes", () => {
    render(<CheckBookingStep rows={rows} sending={false} onBack={() => {}} onSend={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Check your booking" })).toBeInTheDocument();
    expect(screen.getByText("De-shed")).toBeInTheDocument();
    expect(screen.getByText(/No clipping or shaving/)).toBeInTheDocument();
    expect(screen.getByText(/request until our team approves it/)).toBeInTheDocument();
  });

  it("sends only on Yes, and Go back sends nothing", () => {
    const onSend = vi.fn();
    const onBack = vi.fn();
    render(<CheckBookingStep rows={rows} sending={false} onBack={onBack} onSend={onSend} />);
    fireEvent.click(screen.getByRole("button", { name: "Go back and change" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, send my request" }));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("cannot be sent twice while sending", () => {
    render(<CheckBookingStep rows={rows} sending onBack={() => {}} onSend={() => {}} />);
    expect(screen.getByRole("button", { name: "Yes, send my request" })).toBeDisabled();
  });

  it("every online service has a description", () => {
    for (const t of ONLINE_BOOKING_SERVICE_TYPES) expect(onlineBookingServiceDescription(t), t).toBeTruthy();
    expect(onlineBookingServiceDescription("deshed")).toMatch(/No clipping/);
  });
});
