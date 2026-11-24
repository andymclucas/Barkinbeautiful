import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const createBooking = vi.fn();
const g = globalThis as any;

const nextAvailable = vi.fn();
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ clientPortal: { bookingNextAvailable: { fetch: (i: unknown) => nextAvailable(i) } } }),
    clientPortal: {
      bookingOptions: { useQuery: () => ({ data: g.__options }) },
      bookingSlots: { useQuery: () => ({ data: g.__slots ?? [], isLoading: false }) },
      createBooking: { useMutation: () => ({ isPending: false, mutate: (i: unknown) => createBooking(i) }) },
      addExtras: { useMutation: () => ({ isPending: false, mutate: vi.fn() }) },
    },
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/DateField", () => ({
  DateField: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input aria-label="Date" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { PortalBookingDialog, PortalBookCard } from "./PortalBooking";

const OPTIONS = {
  enabled: true,
  bufferMinutes: 30,
  pets: [
    { id: 1, name: "Penny", weightKg: 7, sizeBand: "small", planState: "covered", memberService: "styled_groom" },
    { id: 2, name: "Louie", weightKg: 9, sizeBand: "small", planState: "none", memberService: null },
    { id: 3, name: "Bruce", weightKg: 30, sizeBand: "large", planState: "on_plan_not_usable", memberService: null },
  ],
  services: [
    { petId: 1, services: [{ serviceType: "styled_groom", label: "Styled groom", minutes: 150, price: "0.00" }] },
    { petId: 2, services: [
      { serviceType: "classic_groom", label: "Classic groom", minutes: 120, price: "85.00" },
      { serviceType: "bath_only", label: "Bath and dry", minutes: 60, price: "45.00" },
    ] },
    { petId: 3, services: [] },
  ],
  addOns: [{ id: 9, name: "Teeth clean", description: null, price: "15.00" }],
  groomers: [{ id: 5, name: "Ash" }],
};

describe("PortalBookingDialog", () => {
  beforeEach(() => { createBooking.mockClear(); g.__options = OPTIONS; g.__slots = []; });
  const user = () => userEvent.setup({ delay: null });

  it("books a member's dog for its plan's groom with no extras offered", async () => {
    g.__slots = [{ scheduledStart: "2026-12-02T00:00:00.000Z", scheduledEnd: "2026-12-02T02:30:00.000Z", durationMinutes: 150 }];
    render(<PortalBookingDialog open onClose={() => {}} onBooked={() => {}} />);
    const u = user();
    await u.click(screen.getByRole("button", { name: "Penny" }));
    expect(screen.getByText(/included in your membership/)).toBeInTheDocument();
    expect(screen.queryByText("Teeth clean")).not.toBeInTheDocument();
    await u.type(screen.getByLabelText("Date"), "2026-12-02");
    await u.click(screen.getByRole("button", { name: "10:00 am" }));
    await u.click(screen.getByRole("button", { name: "Book" }));
    expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({ petId: 1, serviceType: "styled_groom", addOnIds: [] }));
  });

  it("lets a dog with no plan choose a service and extras, and shows the estimate", async () => {
    g.__slots = [{ scheduledStart: "2026-12-02T00:00:00.000Z", scheduledEnd: "2026-12-02T01:00:00.000Z", durationMinutes: 60 }];
    render(<PortalBookingDialog open onClose={() => {}} onBooked={() => {}} />);
    const u = user();
    await u.click(screen.getByRole("button", { name: "Louie" }));
    await u.click(screen.getByRole("button", { name: /Bath and dry/ }));
    await u.type(screen.getByLabelText("Date"), "2026-12-02");
    await u.click(screen.getByRole("button", { name: "10:00 am" }));
    await u.click(screen.getByRole("checkbox"));
    expect(screen.getByText("Estimated total $60.00")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Book" }));
    expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({ petId: 2, serviceType: "bath_only", addOnIds: [9], staffId: null }));
  });

  it("jumps to the next free time with one press", async () => {
    nextAvailable.mockResolvedValue({ date: "2026-12-09", scheduledStart: "2026-12-09T01:00:00.000Z", staffId: 5 });
    g.__slots = [{ scheduledStart: "2026-12-09T01:00:00.000Z", scheduledEnd: "2026-12-09T03:00:00.000Z", durationMinutes: 120 }];
    render(<PortalBookingDialog open onClose={() => {}} onBooked={() => {}} />);
    const u = user();
    await u.click(screen.getByRole("button", { name: "Louie" }));
    await u.click(screen.getByRole("button", { name: /Classic groom/ }));
    await u.click(screen.getByRole("button", { name: "Book next available" }));
    expect(nextAvailable).toHaveBeenCalledWith(expect.objectContaining({ petId: 2, serviceType: "classic_groom", staffId: null }));
    expect(await screen.findByText(/Wednesday 9 December at 11:00 am/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Book" }));
    expect(createBooking).toHaveBeenCalledWith(expect.objectContaining({ petId: 2, serviceType: "classic_groom", scheduledStart: new Date("2026-12-09T01:00:00.000Z") }));
  });

  it("sends a dog whose plan cannot be used to the salon", async () => {
    render(<PortalBookingDialog open onClose={() => {}} onBooked={() => {}} />);
    await user().click(screen.getByRole("button", { name: "Bruce" }));
    expect(screen.getByText(/can't be booked online at the moment/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Book" })).toBeDisabled();
  });
});

describe("PortalBookCard", () => {
  it("is hidden when the salon has online booking off", () => {
    g.__options = { ...OPTIONS, enabled: false };
    const { container } = render(<PortalBookCard onBook={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("is hidden on a staff preview", () => {
    g.__options = OPTIONS;
    const { container } = render(<PortalBookCard readOnly onBook={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
