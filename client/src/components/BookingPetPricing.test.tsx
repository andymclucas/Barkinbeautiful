import type { ComponentProps } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

const catalogue = [
  { id: 10, name: "Full Groom (Classic) - New Client - Small", legacyServiceType: "classic_groom", weightBand: "0-10kg", priceMode: "fixed", priceAud: "145.00", sortOrder: 10 },
  { id: 15, name: "Full Groom (Classic) - Regular Client - Small", legacyServiceType: "classic_groom", weightBand: "0-10kg", priceMode: "fixed", priceAud: "125.00", sortOrder: 15 },
  { id: 30, name: "Full Groom (Styled) - New Client - Small", legacyServiceType: "styled_groom", weightBand: "0-10kg", priceMode: "fixed", priceAud: "180.00", sortOrder: 30 },
];
const addOnCatalogue = [
  { id: 52, name: "Teeth Ultra Clean", priceMode: "fixed", priceAud: "65.00" },
  { id: 53, name: "Colour / Dye", priceMode: "quote", priceAud: null },
];

let contextPets: unknown[] = [];

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      bookingPricing: { context: { invalidate: vi.fn() } },
      pets: { listByClient: { invalidate: vi.fn() } },
    }),
    bookingPricing: {
      catalogue: { useQuery: () => ({ data: catalogue, isLoading: false }) },
      context: { useQuery: () => ({ data: { pets: contextPets }, isLoading: false }) },
    },
    appointmentAddOns: { catalogue: { useQuery: () => ({ data: addOnCatalogue, isLoading: false }) } },
    pets: { updateSizeBand: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { BookingPetPricing, type StagedAddOn } from "./BookingPetPricing";

const pet = (petId: number, name: string, tier = "new") => ({
  petId, name, breed: "Pomeranian", weightKg: null, sizeBand: "small",
  sizeBandSource: "manual", membershipTier: null, tier, last: null,
});

const extra = (name: string, displayPrice: string): StagedAddOn => ({
  pricingServiceId: 52, quantity: 1, name, displayPrice,
});

type PricingProps = ComponentProps<typeof BookingPetPricing>;

function renderPricing(over: Partial<PricingProps> = {}) {
  const props: PricingProps = {
    clientId: 1,
    petIds: [100],
    serviceType: "classic_groom",
    membershipCovered: false,
    priceByPetId: { "100": "145.00" },
    onPricesChange: vi.fn(),
    addOnsByPetId: {},
    onAddOnsChange: vi.fn(),
    onServiceTypeChange: vi.fn(),
    ...over,
  };
  return { props, ...render(<BookingPetPricing {...props} />) };
}

describe("BookingPetPricing", () => {
  beforeEach(() => { contextPets = [pet(100, "Teddy")]; });

  it("prices the dog from the catalogue", () => {
    renderPricing();
    expect(screen.getByText("Teddy")).toBeInTheDocument();
    expect(screen.getByText("Total $145.00")).toBeInTheDocument();
  });

  it("counts the extras in the total", () => {
    // The bug Andy caught: "Total $145.00" sat above three add-ons worth
    // $180. The figure staff read out to the client was short by all of it.
    renderPricing({
      addOnsByPetId: {
        "100": [extra("Teeth Brushing", "35.00"), extra("Teeth Ultra Clean", "65.00"), extra("Teeth Pack", "80.00")],
      },
    });
    expect(screen.getByText("Total $325.00")).toBeInTheDocument();
  });

  it("charges extras on a membership groom", () => {
    // The weekly payment covers the cut, not the de-matt done on the day.
    renderPricing({
      membershipCovered: true,
      addOnsByPetId: { "100": [extra("Anal Glands", "35.00")] },
    });
    expect(screen.getByText(/Covered by membership/)).toBeInTheDocument();
  });

  it("gives every dog its own extras picker", () => {
    // This pinned the opposite until 19/10: one shared picker with a
    // dropdown saying which dog. The dropdown kept its last choice, and
    // a de-matt on the wrong Cavoodle is a real charge on a real
    // invoice, so the picker moved inside each dog's box.
    contextPets = [pet(100, "Teddy"), pet(200, "Bella")];
    renderPricing({ petIds: [100, 200], priceByPetId: { "100": "145.00", "200": "145.00" } });
    expect(screen.getAllByText("Add an extra…")).toHaveLength(2);
  });

  it("names the dog each picker belongs to", () => {
    // The box is the signal, and the label says it in words too — one
    // dog's extras must never read as another's.
    contextPets = [pet(100, "Teddy"), pet(200, "Bella")];
    renderPricing({ petIds: [100, 200], priceByPetId: { "100": "145.00", "200": "145.00" } });
    expect(screen.getByText("Extras for Teddy")).toBeInTheDocument();
    expect(screen.getByText("Extras for Bella")).toBeInTheDocument();
  });

  it("no longer asks which dog an extra is for", () => {
    // Nothing to ask: the picker adds to the dog whose box it is in.
    contextPets = [pet(100, "Teddy"), pet(200, "Bella")];
    renderPricing({ petIds: [100, 200], priceByPetId: { "100": "145.00", "200": "145.00" } });
    expect(screen.queryByLabelText("Which dog the extra is for")).not.toBeInTheDocument();
  });

  it("shows each extra against the dog it belongs to", () => {
    contextPets = [pet(100, "Teddy"), pet(200, "Bella")];
    renderPricing({
      petIds: [100, 200],
      priceByPetId: { "100": "145.00", "200": "145.00" },
      addOnsByPetId: { "200": [extra("Teeth Ultra Clean", "65.00")] },
    });
    expect(screen.getByText("Teeth Ultra Clean")).toBeInTheDocument();
    expect(screen.getByText("Total $355.00")).toBeInTheDocument();
  });

  it("warns rather than silently pricing a dog with no size on file", () => {
    contextPets = [{ ...pet(100, "Teddy"), sizeBand: null }];
    renderPricing({ priceByPetId: {} });
    expect(screen.getByText(/No weight on file/)).toBeInTheDocument();
  });

  it("says a dog still needs a price rather than showing a settled total", () => {
    renderPricing({ priceByPetId: {} });
    expect(screen.getByText(/a dog still needs a price/)).toBeInTheDocument();
  });
});
