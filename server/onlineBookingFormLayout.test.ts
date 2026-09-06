import { describe, expect, it } from "vitest";
import {
  ONLINE_BOOKING_DATE_FIELD_LAYOUT,
  ONLINE_BOOKING_TOP_ROW_GRID,
} from "../client/src/lib/onlineBookingFormLayout";

describe("online booking top-row layout", () => {
  it("uses a two-column control grid and gives the requested date its own full row", () => {
    expect(ONLINE_BOOKING_TOP_ROW_GRID).toContain("sm:grid-cols-[minmax(150px,0.65fr)_minmax(0,1.35fr)]");
    expect(ONLINE_BOOKING_TOP_ROW_GRID).not.toContain("grid-cols-3");
    expect(ONLINE_BOOKING_DATE_FIELD_LAYOUT).toContain("sm:col-span-2");
  });
});
