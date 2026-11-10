import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AgreementGate, type GateAgreement } from "./AgreementGate";

const service: GateAgreement = { id: 6, title: "Barkin Beautiful Service Agreement", version: 1, body: "Pets are accepted for grooming only…\n\nPayment is due at the time of service." };
const other: GateAgreement = { id: 7, title: "Photo Policy", version: 2, body: "We may photograph your dog." };

function setup(agreements = [service], props: Partial<Parameters<typeof AgreementGate>[0]> = {}) {
  const onSign = vi.fn();
  render(<AgreementGate agreements={agreements} salonName="Barkin' Beautiful" firstName="Jane" submitting={false} onSign={onSign} {...props} />);
  return { onSign, button: screen.getByRole("button", { name: /Agree and continue/ }) };
}

describe("AgreementGate", () => {
  it("shows the agreement's own words", () => {
    setup();
    expect(screen.getByTestId("agreement-body-6")).toHaveTextContent("Payment is due at the time of service.");
  });

  it("will not sign until the box is ticked and a name is typed", () => {
    const { onSign, button } = setup();
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Type your full name/), { target: { value: "Jane Smith" } });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Service Agreement/ }));
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onSign).toHaveBeenCalledWith("Jane Smith", [6]);
  });

  it("does not pre-fill the signature", () => {
    setup();
    expect(screen.getByLabelText(/Type your full name/)).toHaveValue("");
  });

  it("needs every agreement ticked when there are two", () => {
    const { button } = setup([service, other]);
    fireEvent.change(screen.getByLabelText(/Type your full name/), { target: { value: "Jane Smith" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /Service Agreement/ }));
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Photo Policy/ }));
    expect(button).toBeEnabled();
  });

  it("shows the step and any error", () => {
    setup([service], { stepLabel: "Step 1 of 2", error: "This agreement has been updated" });
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("This agreement has been updated");
  });
});
