import { describe, expect, it } from "vitest";
import { orderMessageThreads } from "./messageThreadOrder";

const at = (day: number, hour = 9) => new Date(Date.UTC(2026, 10, day, hour));
const thread = (id: string, day: number, unreadCount = 0) => ({ id, lastAt: at(day), unreadCount });

describe("orderMessageThreads", () => {
  it("puts a conversation with unread messages above newer read ones", () => {
    const order = orderMessageThreads([thread("new", 23), thread("old-unread", 22, 1), thread("older", 21)]);
    expect(order.map((t) => t.id)).toEqual(["old-unread", "new", "older"]);
  });

  it("keeps the unread ones newest first among themselves", () => {
    const order = orderMessageThreads([thread("a", 20, 2), thread("b", 22, 1), thread("c", 23)]);
    expect(order.map((t) => t.id)).toEqual(["b", "a", "c"]);
  });

  it("is plain newest first when nothing is unread", () => {
    const order = orderMessageThreads([thread("a", 20), thread("b", 22), thread("c", 21)]);
    expect(order.map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("keeps the three Sunday texts on page one behind 71 newer conversations", () => {
    const newer = Array.from({ length: 71 }, (_, i) => thread(`n${i}`, 23));
    const unread = [thread("u1", 22, 1), thread("u2", 22, 1), thread("u3", 22, 1)];
    const page = orderMessageThreads([...newer, ...unread]).slice(0, 50);
    expect(page.slice(0, 3).map((t) => t.id).sort()).toEqual(["u1", "u2", "u3"]);
  });

  it("does not change the array it was given", () => {
    const input = [thread("a", 20), thread("b", 22, 1)];
    orderMessageThreads(input);
    expect(input.map((t) => t.id)).toEqual(["a", "b"]);
  });
});
