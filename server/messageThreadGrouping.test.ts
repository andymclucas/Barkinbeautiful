import { describe, expect, it } from "vitest";
import {
  GROUP_WINDOW_MS,
  buildThread,
  dayLabel,
  messageInstant,
  recentThread,
  type ThreadMessageInput,
} from "@shared/messageThreadGrouping";

const TZ = "Australia/Brisbane";
const at = (iso: string) => Date.parse(iso);

const msg = (
  id: number,
  direction: "inbound" | "outbound",
  iso: string | null,
  extra: Partial<ThreadMessageInput> = {},
): ThreadMessageInput => ({ id, direction, body: `m${id}`, sentAt: iso, ...extra });

describe("message thread grouping", () => {
  describe("messageInstant", () => {
    it("falls back through sentAt, receivedAt then createdAt", () => {
      expect(messageInstant({ id: 1, direction: "outbound", body: "", sentAt: "2026-09-25T00:00:00Z" }))
        .toBe(at("2026-09-25T00:00:00Z"));
      // Inbound rows often have no sentAt at all.
      expect(messageInstant({ id: 2, direction: "inbound", body: "", sentAt: null, receivedAt: "2026-09-25T01:00:00Z" }))
        .toBe(at("2026-09-25T01:00:00Z"));
      expect(messageInstant({ id: 3, direction: "inbound", body: "", createdAt: "2026-09-25T02:00:00Z" }))
        .toBe(at("2026-09-25T02:00:00Z"));
    });

    it("returns 0 for an unusable date rather than NaN", () => {
      // NaN would poison every comparison in the sort.
      expect(messageInstant({ id: 4, direction: "inbound", body: "", sentAt: "not a date" })).toBe(0);
      expect(messageInstant(null)).toBe(0);
    });
  });

  describe("ordering", () => {
    it("puts the newest message last, whatever order the rows arrive in", () => {
      const thread = buildThread(
        [msg(3, "inbound", "2026-09-25T03:00:00Z"), msg(1, "outbound", "2026-09-25T01:00:00Z"), msg(2, "inbound", "2026-09-25T02:00:00Z")],
        TZ,
      );
      const ids = thread.filter(e => e.kind === "message").map(e => (e as any).message.id);
      expect(ids).toEqual([1, 2, 3]);
    });

    it("keeps a message with a broken timestamp instead of dropping it", () => {
      const thread = buildThread([msg(1, "inbound", null), msg(2, "outbound", "2026-09-25T01:00:00Z")], TZ);
      const ids = thread.filter(e => e.kind === "message").map(e => (e as any).message.id);
      expect(ids).toContain(1);
      expect(ids).toContain(2);
    });
  });

  describe("day separators", () => {
    it("inserts one per calendar day, in the display timezone", () => {
      const thread = buildThread(
        [msg(1, "inbound", "2026-09-24T23:00:00Z"), msg(2, "inbound", "2026-09-25T23:00:00Z")],
        TZ,
      );
      const days = thread.filter(e => e.kind === "day");
      expect(days).toHaveLength(2);
    });

    it("splits the day differently for a viewer in another timezone", () => {
      // 20:00Z and 23:00Z are both the 26th in Brisbane (UTC+10), so one day —
      // but they straddle midnight in London (UTC+1 in September), so two.
      const rows = [msg(1, "inbound", "2026-09-25T20:00:00Z"), msg(2, "inbound", "2026-09-25T23:00:00Z")];
      expect(buildThread(rows, "Australia/Brisbane").filter(e => e.kind === "day")).toHaveLength(1);
      expect(buildThread(rows, "Europe/London").filter(e => e.kind === "day")).toHaveLength(2);
      // The mirror image: this pair straddles Brisbane midnight, not London's.
      const straddle = [msg(1, "inbound", "2026-09-25T13:00:00Z"), msg(2, "inbound", "2026-09-25T15:00:00Z")];
      expect(buildThread(straddle, "Australia/Brisbane").filter(e => e.kind === "day")).toHaveLength(2);
      expect(buildThread(straddle, "Europe/London").filter(e => e.kind === "day")).toHaveLength(1);
    });

    it("labels today and yesterday by name", () => {
      const now = at("2026-09-25T02:00:00Z"); // midday Brisbane
      expect(dayLabel(at("2026-09-25T01:00:00Z"), TZ, now)).toBe("Today");
      expect(dayLabel(at("2026-09-24T01:00:00Z"), TZ, now)).toBe("Yesterday");
      expect(dayLabel(at("2026-09-21T01:00:00Z"), TZ, now)).toContain("September");
    });
  });

  describe("runs of consecutive messages", () => {
    it("groups same-direction messages sent close together", () => {
      const thread = buildThread(
        [
          msg(1, "outbound", "2026-09-25T01:00:00Z"),
          msg(2, "outbound", "2026-09-25T01:01:00Z"),
          msg(3, "outbound", "2026-09-25T01:02:00Z"),
        ],
        TZ,
      );
      const messages = thread.filter(e => e.kind === "message") as any[];
      expect(messages.map(m => [m.isFirstOfGroup, m.isLastOfGroup])).toEqual([
        [true, false],
        [false, false],
        [false, true],
      ]);
    });

    it("breaks a run when the other side replies", () => {
      const thread = buildThread(
        [msg(1, "outbound", "2026-09-25T01:00:00Z"), msg(2, "inbound", "2026-09-25T01:01:00Z")],
        TZ,
      );
      const messages = thread.filter(e => e.kind === "message") as any[];
      expect(messages[0].isLastOfGroup).toBe(true);
      expect(messages[1].isFirstOfGroup).toBe(true);
    });

    it("breaks a run after a long gap, even from the same side", () => {
      const start = at("2026-09-25T01:00:00Z");
      const thread = buildThread(
        [
          msg(1, "outbound", new Date(start).toISOString()),
          msg(2, "outbound", new Date(start + GROUP_WINDOW_MS + 1000).toISOString()),
        ],
        TZ,
      );
      const messages = thread.filter(e => e.kind === "message") as any[];
      expect(messages[0].isLastOfGroup).toBe(true);
      expect(messages[1].isFirstOfGroup).toBe(true);
    });

    it("marks direction so the bubble knows which side it is on", () => {
      const thread = buildThread([msg(1, "outbound", "2026-09-25T01:00:00Z"), msg(2, "inbound", "2026-09-25T02:00:00Z")], TZ);
      const messages = thread.filter(e => e.kind === "message") as any[];
      expect(messages[0].outbound).toBe(true);
      expect(messages[1].outbound).toBe(false);
    });
  });

  describe("recentThread", () => {
    it("keeps the NEWEST messages, oldest first", () => {
      // The bug this guards: the preview showed the oldest four, so the most
      // recent message — the reason you are hovering — was never visible.
      const rows = Array.from({ length: 10 }, (_, i) =>
        msg(i + 1, i % 2 ? "outbound" : "inbound", `2026-09-25T0${i}:00:00Z`),
      );
      const ids = recentThread(rows, TZ, 4).filter(e => e.kind === "message").map(e => (e as any).message.id);
      expect(ids).toEqual([7, 8, 9, 10]);
    });

    it("copes with fewer messages than the limit", () => {
      const ids = recentThread([msg(1, "inbound", "2026-09-25T01:00:00Z")], TZ, 4)
        .filter(e => e.kind === "message").map(e => (e as any).message.id);
      expect(ids).toEqual([1]);
    });

    it("returns nothing for an empty thread", () => {
      expect(recentThread([], TZ, 4)).toEqual([]);
    });
  });
});
