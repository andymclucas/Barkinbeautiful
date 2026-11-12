import { describe, expect, it } from "vitest";
import { asksForPerson, canAnswerSupport, historyForModel, isWithPerson, supportPushText, unreadCount } from "./supportChat";

describe("asksForPerson", () => {
  it("catches plain requests for a person", () => {
    for (const text of [
      "Can I speak to a human?",
      "talk to a real person please",
      "I want to chat with someone",
      "get Andy",
      "Put me through to an agent",
    ]) expect(asksForPerson(text), text).toBe(true);
  });

  it("does not trip on ordinary questions", () => {
    for (const text of [
      "How do I cancel one dog on a booking?",
      "The person on the calendar is wrong",
      "How do I call a client from the app?",
      "Where is the human resources page",
    ]) expect(asksForPerson(text), text).toBe(false);
  });
});

describe("historyForModel", () => {
  it("drops system lines, joins runs and starts with the user", () => {
    expect(historyForModel([
      { sender: "ai", body: "Hello" },
      { sender: "user", body: "one" },
      { sender: "user", body: "two" },
      { sender: "system", body: "Passed to a person" },
      { sender: "ai", body: "answer" },
      { sender: "user", body: "three" },
    ])).toEqual([
      { role: "user", content: "one\n\ntwo" },
      { role: "assistant", content: "answer" },
      { role: "user", content: "three" },
    ]);
  });
});

describe("unreadCount", () => {
  const messages = [
    { id: 1, sender: "user" as const },
    { id: 2, sender: "ai" as const },
    { id: 3, sender: "human" as const },
    { id: 4, sender: "user" as const },
  ];
  it("counts the other side's messages past the read mark", () => {
    expect(unreadCount(messages, 1, "user")).toBe(2);
    expect(unreadCount(messages, 3, "user")).toBe(0);
    expect(unreadCount(messages, 0, "agent")).toBe(2);
    expect(unreadCount(messages, 4, "agent")).toBe(0);
  });
});

describe("the rest", () => {
  it("only lists Andy as support", () => {
    expect(canAnswerSupport({ id: 30001 })).toBe(true);
    expect(canAnswerSupport({ id: 1 })).toBe(false);
    expect(canAnswerSupport(null)).toBe(false);
  });
  it("knows when a person owns the conversation", () => {
    expect(isWithPerson("waiting")).toBe(true);
    expect(isWithPerson("human")).toBe(true);
    expect(isWithPerson("ai")).toBe(false);
  });
  it("writes the phone notification", () => {
    expect(supportPushText("Megan", "Barkin' Beautiful", "The board   won't load", true))
      .toEqual({ title: "Megan wants to talk to a person", body: "Barkin' Beautiful: The board won't load" });
    expect(supportPushText(null, null, "ok", false))
      .toEqual({ title: "Someone replied in support chat", body: "ok" });
  });
});
