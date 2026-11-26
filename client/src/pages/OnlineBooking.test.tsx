import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const nextAvailable = vi.fn();
const previewNextAvailable = vi.fn();
const slotQuery = vi.fn();
const toastError = vi.fn();

vi.mock("@/lib/trpc", () => {
  const groomers = [
    { id: 5, name: "Ash", role: "groomer", colourHex: "#8b5cf6", photoUrl: null, bio: null, services: null, maxDogsPerSlot: 1 },
    { id: 6, name: "Brooke", role: "groomer", colourHex: "#f59e0b", photoUrl: null, bio: null, services: null, maxDogsPerSlot: 1 },
  ];
  const idle = { isPending: false, mutate: vi.fn() };
  return {
    trpc: {
      useUtils: () => ({
        onlineBooking: {
          nextAvailable: { fetch: (i: unknown) => nextAvailable(i) },
          previewNextAvailable: { fetch: (i: unknown) => previewNextAvailable(i) },
        },
      }),
      onlineBooking: {
        listGroomerProfiles: { useQuery: () => ({ data: groomers, isLoading: false }) },
        listPreviewGroomerProfiles: { useQuery: () => ({ data: groomers, isLoading: false }) },
        createGuest: { useMutation: () => idle },
        createPreviewGuest: { useMutation: () => idle },
        priceEstimate: { useQuery: () => ({ data: undefined, isLoading: false }) },
        listAvailableSlots: { useQuery: (input: unknown, opts: { enabled: boolean }) => { slotQuery(input, opts); return { data: [], isLoading: false }; } },
        listPreviewAvailableSlots: { useQuery: () => ({ data: [], isLoading: false }) },
      },
    },
  };
});
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: (m: string) => toastError(m) } }));
vi.mock("@/hooks/usePublicBrandTheme", () => ({ usePublicBrandTheme: () => ({ salonName: "Test Salon", logoUrl: null }) }));
vi.mock("@/components/SalonLogo", () => ({ SalonLogo: () => null }));
vi.mock("@/components/OnlineBookingEstimate", () => ({ OnlineBookingEstimate: () => null }));
vi.mock("@/components/DateField", () => ({
  DateField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="Date" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import OnlineBooking from "./OnlineBooking";
import { GROOMIGO_LOGO_ON_DARK } from "@/components/GroomigoLogo";

const FOUND = { date: "2026-12-09", scheduledStart: "2026-12-08T22:00:00.000Z", staffId: 6 };

beforeEach(() => {
  nextAvailable.mockReset();
  previewNextAvailable.mockReset();
  slotQuery.mockReset();
  toastError.mockReset();
});

describe("Online booking: Powered by Groomigo", () => {
  it("shows the standard Groomigo logo at the top and again at the bottom", () => {
    render(<OnlineBooking />);
    const marks = screen.getAllByTestId("powered-by-groomigo");
    expect(marks).toHaveLength(2);
    for (const mark of marks) {
      expect(mark).toHaveTextContent("Powered by");
      // The white-lettered drawing, because the page is always dark.
      const logo = mark.querySelector("img");
      expect(logo?.getAttribute("src")).toBe(GROOMIGO_LOGO_ON_DARK);
      expect(logo?.getAttribute("alt")).toBe("Groomigo");
    }
    // One in the page header, one in the footer.
    expect(marks[0].closest("header")).not.toBeNull();
    expect(marks[1].closest("footer")).not.toBeNull();
  });
});

describe("Online booking: Find next available", () => {
  it("cannot be pressed until the dog's weight is entered", async () => {
    const u = userEvent.setup();
    render(<OnlineBooking />);
    const button = screen.getByRole("button", { name: "Find next available" });
    expect(button).toBeDisabled();
    await u.type(screen.getByPlaceholderText("e.g. 14.5"), "8");
    expect(button).toBeEnabled();
  });

  it("with no groomer chosen, searches all of them and fills in groomer, day and time", async () => {
    nextAvailable.mockResolvedValue(FOUND);
    const u = userEvent.setup();
    render(<OnlineBooking />);
    await u.type(screen.getByPlaceholderText("e.g. 14.5"), "8");
    await u.click(screen.getByRole("button", { name: "Find next available" }));

    expect(nextAvailable).toHaveBeenCalledWith({ staffId: null, serviceType: "classic_groom", petWeightKg: 8 });
    expect(await screen.findByText(/Selected time:/)).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toHaveValue("2026-12-09");
    // The groomer it found is now the one the slot list is loaded for.
    const [lastInput, lastOpts] = slotQuery.mock.calls.at(-1)!;
    expect(lastInput).toMatchObject({ staffId: 6, date: "2026-12-09", petWeightKg: 8 });
    expect(lastOpts.enabled).toBe(true);
  });

  it("with a groomer chosen, searches only that groomer", async () => {
    nextAvailable.mockResolvedValue({ ...FOUND, staffId: 5 });
    const u = userEvent.setup();
    render(<OnlineBooking />);
    await u.click(screen.getByRole("button", { name: /Ash/ }));
    await u.type(screen.getByPlaceholderText("e.g. 14.5"), "8");
    await u.click(screen.getByRole("button", { name: "Find next available" }));
    expect(nextAvailable).toHaveBeenCalledWith({ staffId: 5, serviceType: "classic_groom", petWeightKg: 8 });
  });

  it("says so, and selects nothing, when no time is free", async () => {
    nextAvailable.mockResolvedValue(null);
    const u = userEvent.setup();
    render(<OnlineBooking />);
    await u.type(screen.getByPlaceholderText("e.g. 14.5"), "8");
    await u.click(screen.getByRole("button", { name: "Find next available" }));
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining("No free times in the next 8 weeks"));
    expect(screen.queryByText(/Selected time:/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toHaveValue("");
  });

  it("uses the preview search on the admin preview page", async () => {
    previewNextAvailable.mockResolvedValue(FOUND);
    const u = userEvent.setup();
    render(<OnlineBooking previewMode />);
    await u.type(screen.getByPlaceholderText("e.g. 14.5"), "8");
    await u.click(screen.getByRole("button", { name: "Find next available" }));
    expect(previewNextAvailable).toHaveBeenCalled();
    expect(nextAvailable).not.toHaveBeenCalled();
  });
});
