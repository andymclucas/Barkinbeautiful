import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const nextAvailable = vi.fn();
const previewNextAvailable = vi.fn();
const slotQuery = vi.fn();
const anySlotQuery = vi.fn();
const createGuest = vi.fn();
const g = globalThis as any;
const toastError = vi.fn();

vi.mock("@/lib/trpc", () => {
  const groomers = [
    { id: 5, name: "Ash", role: "groomer", colourHex: "#8b5cf6", photoUrl: null, bio: null, services: null, maxDogsPerSlot: 1 },
    { id: 6, name: "Brooke", role: "groomer", colourHex: "#f59e0b", photoUrl: null, bio: null, services: null, maxDogsPerSlot: 1 },
  ];
  const idle = { isPending: false, mutate: vi.fn() };
  const create = { isPending: false, mutate: (i: unknown) => createGuest(i) };
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
        createGuest: { useMutation: () => create },
        createPreviewGuest: { useMutation: () => idle },
        priceEstimate: { useQuery: () => ({ data: undefined, isLoading: false }) },
        listAvailableSlots: { useQuery: (input: unknown, opts: { enabled: boolean }) => { slotQuery(input, opts); return { data: [], isLoading: false }; } },
        listPreviewAvailableSlots: { useQuery: () => ({ data: [], isLoading: false }) },
        listAvailableSlotsAnyGroomer: { useQuery: (input: unknown, opts: { enabled: boolean }) => { anySlotQuery(input, opts); return { data: opts.enabled ? g.__anySlots ?? [] : undefined, isLoading: false }; } },
        listPreviewAvailableSlotsAnyGroomer: { useQuery: () => ({ data: [], isLoading: false }) },
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
  anySlotQuery.mockReset();
  createGuest.mockReset();
  g.__anySlots = undefined;
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

  it("with no groomer chosen, searches all of them and lands on No preferred groomer with the time filled in", async () => {
    nextAvailable.mockResolvedValue(FOUND);
    const u = userEvent.setup();
    render(<OnlineBooking />);
    await u.type(screen.getByPlaceholderText("e.g. 14.5"), "8");
    await u.click(screen.getByRole("button", { name: "Find next available" }));

    expect(nextAvailable).toHaveBeenCalledWith({ staffId: null, serviceType: "classic_groom", petWeightKg: 8 });
    // The time, and the groomer who is free then (staff 6 is Brooke).
    expect(await screen.findByText(/Selected time:.* with Brooke/)).toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toHaveValue("2026-12-09");
    expect(screen.getByRole("button", { name: /No preferred groomer/ })).toHaveAttribute("aria-pressed", "true");
    // The day's other times are loaded across every groomer, not for one.
    const [lastInput, lastOpts] = anySlotQuery.mock.calls.at(-1)!;
    expect(lastInput).toMatchObject({ date: "2026-12-09", petWeightKg: 8, serviceType: "classic_groom" });
    expect(lastOpts.enabled).toBe(true);
    expect(slotQuery.mock.calls.at(-1)![1].enabled).toBe(false);
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

describe("Online booking: No preferred groomer", () => {
  const fill = async (u: ReturnType<typeof userEvent.setup>) => {
    await u.type(screen.getByPlaceholderText("e.g. 14.5"), "8");
    await u.type(screen.getByLabelText("Date"), "2026-12-09");
  };

  it("is offered first, ahead of the named groomers", () => {
    render(<OnlineBooking />);
    const cards = screen.getByLabelText("Available groomers").querySelectorAll("button");
    expect(cards[0]).toHaveTextContent("No preferred groomer");
    expect(cards[0]).toHaveAttribute("aria-pressed", "false");
    expect(cards).toHaveLength(3);
  });

  it("lists the day's times across every groomer", async () => {
    g.__anySlots = [{ scheduledStart: "2026-12-08T22:00:00.000Z", scheduledEnd: "2026-12-09T00:00:00.000Z", durationMinutes: 120, staffId: 5 }];
    const u = userEvent.setup();
    render(<OnlineBooking />);
    await u.click(screen.getByRole("button", { name: /No preferred groomer/ }));
    await fill(u);
    const [input, opts] = anySlotQuery.mock.calls.at(-1)!;
    expect(input).toEqual({ serviceType: "classic_groom", petWeightKg: 8, date: "2026-12-09" });
    expect(opts.enabled).toBe(true);
    // The single-groomer list is not asked for a groomer that was never chosen.
    expect(slotQuery.mock.calls.every(([, o]) => o.enabled === false)).toBe(true);
  });

  it("books the chosen time with the groomer who is free then", async () => {
    g.__anySlots = [{ scheduledStart: "2026-12-08T22:00:00.000Z", scheduledEnd: "2026-12-09T00:00:00.000Z", durationMinutes: 120, staffId: 5 }];
    const u = userEvent.setup();
    const { container } = render(<OnlineBooking />);
    await u.click(screen.getByRole("button", { name: /No preferred groomer/ }));
    await fill(u);
    const request = screen.getByRole("button", { name: "Request this booking" });
    // A time has to be picked before there is a groomer to book with.
    expect(request).toBeDisabled();

    const times = Array.from(container.querySelectorAll("button")).filter((b) => /^\d{1,2}:\d{2}/.test(b.textContent ?? ""));
    expect(times).toHaveLength(1);
    await u.click(times[0]);
    expect(screen.getByText(/Selected time:.* with Ash/)).toBeInTheDocument();

    const text = Array.from(container.querySelectorAll("input")).filter((i) => !i.getAttribute("aria-label") && i.type !== "number");
    await u.type(text[0], "Sarah");
    await u.type(text[1], "Jones");
    await u.type(text[2], "0400000000");
    await u.type(text[4], "Bella");
    expect(request).toBeEnabled();
    await u.click(request);
    expect(createGuest).toHaveBeenCalledWith(expect.objectContaining({ staffId: 5, firstName: "Sarah", petName: "Bella", weightKg: 8 }));
  });

  it("with it chosen, Find next available searches every groomer", async () => {
    nextAvailable.mockResolvedValue(FOUND);
    const u = userEvent.setup();
    render(<OnlineBooking />);
    await u.click(screen.getByRole("button", { name: /No preferred groomer/ }));
    await u.type(screen.getByPlaceholderText("e.g. 14.5"), "8");
    await u.click(screen.getByRole("button", { name: "Find next available" }));
    expect(nextAvailable).toHaveBeenCalledWith({ staffId: null, serviceType: "classic_groom", petWeightKg: 8 });
  });
});
