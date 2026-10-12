import { describe, expect, it } from "vitest";
import {
  canAssignTo, describeReadState, isUnread, markReadPatch, markUnreadPatch,
  type MessageReadRow,
} from "@shared/messageReadState";

const row = (over: Partial<MessageReadRow> = {}): MessageReadRow => ({
  readAt: null, readByUserId: null, firstReadAt: null, firstReadByUserId: null, ...over,
});
const T1 = new Date("2026-10-12T09:00:00Z");
const T2 = new Date("2026-10-12T15:30:00Z");

describe("isUnread", () => {
  it("is the same test every existing badge already makes", () => {
    expect(isUnread(row())).toBe(true);
    expect(isUnread(row({ readAt: T1 }))).toBe(false);
  });
});

describe("markReadPatch", () => {
  it("stamps both the live state and the first-read audit on a fresh row", () => {
    const patch = markReadPatch(row(), 7, T1);
    expect(patch).toEqual({ readAt: T1, readByUserId: 7, firstReadAt: T1, firstReadByUserId: 7 });
  });

  it("never overwrites who got there first", () => {
    // Lauren opens it, marks it unread, Megs opens it later. The salon still
    // needs to know Lauren saw it at 9am.
    const patch = markReadPatch(row({ firstReadAt: T1, firstReadByUserId: 7 }), 9, T2);
    expect(patch).toEqual({ readAt: T2, readByUserId: 9 });
    expect(patch).not.toHaveProperty("firstReadAt");
    expect(patch).not.toHaveProperty("firstReadByUserId");
  });
});

describe("markUnreadPatch", () => {
  it("clears only the live state", () => {
    expect(markUnreadPatch()).toEqual({ readAt: null, readByUserId: null });
  });

  it("cannot express clearing the audit, so it cannot do it by accident", () => {
    const patch = markUnreadPatch();
    expect(Object.keys(patch).sort()).toEqual(["readAt", "readByUserId"]);
  });

  it("round-trips: read, unread, and the first reader is still on record", () => {
    let r = row();
    r = { ...r, ...markReadPatch(r, 7, T1) };
    r = { ...r, ...markUnreadPatch() };
    expect(isUnread(r)).toBe(true);
    expect(r.firstReadAt).toEqual(T1);
    expect(r.firstReadByUserId).toBe(7);
  });
});

describe("canAssignTo", () => {
  const staff = { id: 3, tenantId: 1, isActive: true };

  it("allows an active staff member of the same salon", () => {
    expect(canAssignTo(staff, 1)).toEqual({ ok: true });
  });

  it("refuses a staff member from another salon", () => {
    // The multi-tenant leak this feature could introduce.
    const other = canAssignTo({ id: 3, tenantId: 2, isActive: true }, 1);
    expect(other.ok).toBe(false);
    expect(other).toHaveProperty("reason");
  });

  it("refuses somebody who has left", () => {
    // An assignment to a departed groomer reads as handled and is not.
    expect(canAssignTo({ ...staff, isActive: false }, 1).ok).toBe(false);
    expect(canAssignTo({ ...staff, isActive: 0 }, 1).ok).toBe(false);
    expect(canAssignTo({ ...staff, isActive: "0" }, 1).ok).toBe(false);
  });

  it("accepts the truthy shapes a raw driver read can give", () => {
    expect(canAssignTo({ ...staff, isActive: 1 }, 1)).toEqual({ ok: true });
    expect(canAssignTo({ ...staff, isActive: undefined }, 1)).toEqual({ ok: true });
  });

  it("refuses a staff member who no longer exists", () => {
    expect(canAssignTo(null, 1).ok).toBe(false);
    expect(canAssignTo(undefined, 1).ok).toBe(false);
  });
});

describe("describeReadState", () => {
  const names: Record<number, string> = { 7: "Lauren", 9: "Megs" };
  const nameFor = (id: number) => names[id] ?? null;

  it("says unread, and still names who had opened it", () => {
    const r = row({ firstReadAt: T1, firstReadByUserId: 7 });
    expect(describeReadState(r, nameFor)).toBe("Unread — first read by Lauren");
  });

  it("says plain unread when nobody ever opened it", () => {
    expect(describeReadState(row(), nameFor)).toBe("Unread");
  });

  it("names only the reader when they were also the first", () => {
    const r = row({ readAt: T1, readByUserId: 7, firstReadAt: T1, firstReadByUserId: 7 });
    expect(describeReadState(r, nameFor)).toBe("Read by Lauren");
  });

  it("names both when a second person read it after an unread", () => {
    const r = row({ readAt: T2, readByUserId: 9, firstReadAt: T1, firstReadByUserId: 7 });
    expect(describeReadState(r, nameFor)).toBe("Read by Megs — first read by Lauren");
  });

  it("copes with a user who has since been deleted", () => {
    const r = row({ readAt: T1, readByUserId: 404, firstReadAt: T1, firstReadByUserId: 404 });
    expect(describeReadState(r, nameFor)).toBe("Read by someone");
  });
});
