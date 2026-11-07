import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { clients } from "../drizzle/schema";
import {
  CLIENT_LIST_MAX_PAGE_SIZE, CLIENT_LIST_PAGE_SIZES,
} from "@shared/clientList";
import {
  CLIENT_STATUSES,
  CLIENT_STATUS_BULK_MAX,
  CLIENT_STATUS_COPY,
  SETTABLE_CLIENT_STATUSES,
  isSettableClientStatus,
} from "@shared/clientStatus";

/**
 * The client status rule.
 *
 * The Clients page filtered on four statuses for months while nothing
 * could set three of them — no setter, no control, and the MoeGo import
 * did not write it either. These tests cover the two ways that can
 * happen again: the list drifting from the column, and `lapsed` being
 * quietly added to the things a person can choose.
 */
describe("client status", () => {
  it("lists exactly the values the column accepts", () => {
    // The anti-drift pin. If someone adds a status to the schema, this
    // fails until the shared list and its copy learn about it — which is
    // what stops a fifth value appearing in a dropdown with no meaning
    // attached, or being left out of one and silently unreachable.
    const column = getTableColumns(clients).status;
    expect([...(column.enumValues ?? [])].sort()).toEqual([...CLIENT_STATUSES].sort());
  });

  it("only lets a person choose a status that is actually a choice", () => {
    for (const status of SETTABLE_CLIENT_STATUSES) {
      expect(CLIENT_STATUSES).toContain(status);
    }
  });

  it("never lets lapsed be set by hand", () => {
    // The whole reason the settable list exists. "Who has stopped coming"
    // is computed from visit history against each household's own rhythm
    // in shared/lapsedClients.ts; a hand-set column would be a second,
    // disagreeing answer to the same question.
    expect(SETTABLE_CLIENT_STATUSES).not.toContain("lapsed");
    expect(isSettableClientStatus("lapsed")).toBe(false);
    // Still a real column value, though — it is in the MySQL enum and
    // removing it would be a data migration for no gain.
    expect(CLIENT_STATUSES).toContain("lapsed");
  });

  it("describes every status, including the one that cannot be chosen", () => {
    for (const status of CLIENT_STATUSES) {
      const copy = CLIENT_STATUS_COPY[status];
      expect(copy?.label.trim(), `${status} needs a label`).not.toBe("");
      expect(copy?.meaning.trim(), `${status} needs a meaning`).not.toBe("");
    }
    // Lapsed's copy has to say why it is not selectable, or the greyed-out
    // row in the UI is just a mystery.
    expect(CLIENT_STATUS_COPY.lapsed.meaning).toMatch(/Reporting page/i);
  });

  it("says plainly that blocked does not stop a booking", () => {
    // Andy, 07/11/2026, asked whether Blocked should also warn at booking
    // time and chose to leave it as marketing-only. The copy therefore has
    // to carry the limit, because "Blocked" on its own reads like a
    // do-not-book and a groomer would trust it.
    expect(CLIENT_STATUS_COPY.blocked.meaning).toMatch(/does NOT stop a booking/i);
  });

  it("caps a bulk change at no less than one full page of the list", () => {
    // The invariant, not the number. Ticking the header checkbox selects
    // a whole page, so a page larger than the cap would build a selection
    // the server refuses outright — the change would fail as a whole
    // rather than part-applying. Adding a bigger page size therefore has
    // to fail here until the cap is reconsidered.
    expect(CLIENT_STATUS_BULK_MAX).toBeGreaterThanOrEqual(CLIENT_LIST_MAX_PAGE_SIZE);
    for (const size of CLIENT_LIST_PAGE_SIZES) {
      expect(size, "a page size must be selectable in one bulk call")
        .toBeLessThanOrEqual(CLIENT_STATUS_BULK_MAX);
    }
  });

  it("rejects anything that is not a status", () => {
    for (const junk of ["", "ACTIVE", "deleted", null, undefined, 3]) {
      expect(isSettableClientStatus(junk)).toBe(false);
    }
    expect(isSettableClientStatus("active")).toBe(true);
    expect(isSettableClientStatus("inactive")).toBe(true);
    expect(isSettableClientStatus("blocked")).toBe(true);
  });
});
