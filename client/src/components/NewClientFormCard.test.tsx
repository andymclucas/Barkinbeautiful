import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mutate = vi.fn();
vi.mock("@/lib/trpc", () => ({
  trpc: {
    newClientForm: {
      submit: { useMutation: () => ({ mutate, isPending: false }) },
    },
  },
}));

import { NewClientFormCard } from "./NewClientFormCard";

const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("New Client Form (Andy, 25/11/2026)", () => {
  beforeEach(() => mutate.mockReset());

  it("offers no membership, product or service, only client and dog details", () => {
    render(<NewClientFormCard salonDisplayName="Test Salon" />);
    expect(screen.queryByText(/membership/i)).toBeNull();
    expect(screen.queryByText(/price/i)).toBeNull();
    expect(screen.getByLabelText("Dog’s name")).toBeInTheDocument();
    expect(screen.getByLabelText("Home or mailing address")).toBeInTheDocument();
  });

  it("lists what is missing and sends nothing", () => {
    render(<NewClientFormCard salonDisplayName="Test Salon" />);
    fireEvent.click(screen.getByRole("button", { name: "Send my details" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please enter your first name.");
    expect(mutate).not.toHaveBeenCalled();
  });

  it("sends a complete form", () => {
    render(<NewClientFormCard salonDisplayName="Test Salon" />);
    type("First name", "Sam");
    type("Last name", "Taylor");
    type("Mobile number", "0412 345 678");
    type("Email address", "sam@example.com");
    type("Home or mailing address", "1 Example St, Brisbane");
    type("Dog’s name", "Biscuit");
    type("Breed", "Cavoodle");
    type("Age (years)", "3");
    type("Weight (kg)", "8");
    fireEvent.click(screen.getByRole("button", { name: "Send my details" }));
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      firstName: "Sam",
      email: "sam@example.com",
      dogs: [{ name: "Biscuit", breed: "Cavoodle", ageYears: 3, weightKg: 8 }],
    }));
  });
});
