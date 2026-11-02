import { describe, it, expect } from "vitest";
import { readMoegoBlock, readBlockWithRoster, blockSubject, toHHMM, isFullDayWindow } from "@shared/moegoBlocks";

/** Every row here was swept out of MoeGo on 02/11/2026. */
const block = (start: string, end: string, text: string, staff = "Megan Graham") =>
  ({ day: "13/11", start, end, text, staff });
const allDay = (text: string) => block("12:00am", "11:59pm", text);

describe("toHHMM", () => {
  it("reads MoeGo's clock", () => {
    expect(toHHMM("07:30am")).toBe("07:30");
    expect(toHHMM("12:00am")).toBe("00:00");
    expect(toHHMM("12:30pm")).toBe("12:30");
    expect(toHHMM("11:59pm")).toBe("23:59");
    expect(toHHMM("04:00pm")).toBe("16:00");
    expect(toHHMM("nonsense")).toBeNull();
  });
  it("knows an all-day window", () => {
    expect(isFullDayWindow("12:00am", "11:59pm")).toBe(true);
    expect(isFullDayWindow("07:30am", "05:30pm")).toBe(false);
  });
});

describe("notes are not absences", () => {
  /**
   * The finding that stopped this being a copy-and-paste job. Blocking
   * these would shut days the salon is busy on.
   */
  it.each([
    ["NO AIR CON OUT BACK"],
    ["Desheds day"],
    ["deshed day"],
    ["last day"],
    ["first day back"],
  ])("treats %s as a note", (text) => {
    expect(readMoegoBlock(allDay(text)).kind).toBe("note");
  });

  it("checks notes before absences, so a deshed day is not read as leave", () => {
    // "day" appears in both vocabularies; order decides it.
    expect(readMoegoBlock(allDay("Desheds day")).kind).toBe("note");
  });
});

describe("absences", () => {
  it.each([
    ["away Sydney"],
    ["loz away"],
    ["SABINA AWAY UNTIL THE 7TH"],
    ["away until the 27th"],
    ["Girls weekend"],
    ["Charlie away block box"],
    ["Blocking box Charlie & z away"],
    ["Steph wisdom teeth out on monday maybe fucked"],
  ])("reads %s as somebody being out", (text) => {
    expect(readMoegoBlock(allDay(text)).kind).toBe("absence");
  });

  it("keeps MoeGo's own window when it gave one", () => {
    const r = readMoegoBlock(block("07:30am", "05:30pm", "away Sydney"));
    expect(r).toMatchObject({ kind: "absence", isFullDay: false, startTime: "07:30", endTime: "17:30" });
  });

  it("blocks the whole day only when MoeGo did and the note adds no time", () => {
    expect(readMoegoBlock(allDay("loz away"))).toMatchObject({ kind: "absence", isFullDay: true, startTime: null });
  });
});

describe("a time in the note beats an all-day block", () => {
  /**
   * "Steph starting at 11:30 from dr" is entered as a FULL DAY block
   * and is not a day off. Blocking the day would take a working
   * afternoon off the roster.
   */
  it("turns a late start into a morning off", () => {
    expect(readMoegoBlock(allDay("Steph starting at 11:30 from dr")))
      .toMatchObject({ kind: "absence", isFullDay: false, startTime: "00:00", endTime: "11:30" });
  });

  it("turns an early finish into an afternoon off", () => {
    expect(readMoegoBlock(allDay("Finishing at 3:30pm")))
      .toMatchObject({ kind: "absence", isFullDay: false, startTime: "15:30", endTime: "23:59" });
  });

  /**
   * "finish no later than 2" means two in the AFTERNOON. Reading the
   * bare number as 02:00 would block the entire working day.
   */
  it("reads a bare hour as the afternoon", () => {
    expect(readMoegoBlock(allDay("Megs finish earlier no later than 2 Jax semi formal")).startTime).toBe("14:00");
    expect(readMoegoBlock(allDay("Megs finish at 4, final Japanese meeting before trip")).startTime).toBe("16:00");
  });

  it("still respects an explicit am", () => {
    expect(readMoegoBlock(allDay("finishing at 11am")).startTime).toBe("11:00");
  });
});

describe("what it refuses to guess", () => {
  it("leaves an all-day block with an opaque note unclear", () => {
    expect(readMoegoBlock(allDay("NO MORE FULLY BOOKED")).kind).toBe("unclear");
  });

  it("leaves a timed block that says nothing about absence unclear", () => {
    expect(readMoegoBlock(block("08:00am", "09:00am", "setting up")).kind).toBe("unclear");
  });

  /**
   * A short day IS an absence, even on a block MoeGo already timed.
   * Both of these went to the review pile for no reason until
   * finish/start were added to the absence vocabulary.
   */
  it("takes a short day on a timed block as an absence, keeping MoeGo's window", () => {
    expect(readMoegoBlock(block("12:30pm", "03:30pm", "Finishing at 3:30pm")))
      .toMatchObject({ kind: "absence", startTime: "12:30", endTime: "15:30" });
    expect(readMoegoBlock(block("02:15pm", "05:00pm", "Megs finish earlier no later than 2 Jax semi formal")))
      .toMatchObject({ kind: "absence", startTime: "14:15", endTime: "17:00" });
  });

  /**
   * A bare name is how this salon writes somebody being out, but the
   * roster lives in the database, so the caller decides.
   */
  it("accepts a bare name only when the caller confirms it is one", () => {
    expect(readMoegoBlock(allDay("Charlotte")).kind).toBe("unclear");
    expect(readBlockWithRoster(allDay("Charlotte"), (t) => t.trim() === "Charlotte").kind).toBe("absence");
    expect(readBlockWithRoster(allDay("NO MORE FULLY BOOKED"), (t) => t.trim() === "Charlotte").kind).toBe("unclear");
  });

  it("never claims an absence it cannot time", () => {
    expect(readMoegoBlock(block("rubbish", "rubbish", "away Sydney")).kind).toBe("unclear");
  });
});

describe("who the block is about", () => {
  /** First names as the salon writes them, mapped to the roster. */
  const nameIn = (text: string): string | null => {
    const t = String(text ?? "").toLowerCase();
    for (const [needle, who] of [
      ["steph", "Stephanie Baldwin"], ["sabina", "Sabina Orjuela"], ["subina", "Sabina Orjuela"],
      ["charlie", "Charlotte Purcell"], ["charlotte", "Charlotte Purcell"],
      ["zakaria", "Zakaria Romari"], ["megan", "Megs Graham"], ["megs", "Megs Graham"],
      ["brooklyn", "Brooklyn Cossey"], ["ashleigh", "Ashleigh Knight"],
      ["lauren", "Lauren Romari"], ["loz", "Lauren Romari"], ["bather", "Stephanie Baldwin"],
    ] as const) if (t.includes(needle)) return who;
    return null;
  };
  const b = (text: string, staff: string) => ({ day: "10/11", start: "07:30am", end: "08:30am", text, staff });

  /**
   * The catch that mattered. Three of Steph's and Sabina's absences sit
   * in Zakaria's column; acting on the column would have booked
   * Zakaria off for other people's dentist appointments.
   */
  it("refuses when the note and the column name different people", () => {
    expect(blockSubject(b("Steph wisdom teeth out on monday", "Zakaria"), nameIn).ok).toBe(false);
    expect(blockSubject(b("SABINA AWAY UNTIL THE 7TH", "Zakaria"), nameIn).ok).toBe(false);
    // Charlotte is already blocked; this one holds MEGAN'S slot shut.
    expect(blockSubject(b("Charlie away block box", "Megan"), nameIn).ok).toBe(false);
  });

  it("uses the column when the note names nobody", () => {
    expect(blockSubject(b("away Sydney", "Charlotte"), nameIn))
      .toMatchObject({ ok: true, name: "Charlotte Purcell", from: "column" });
    expect(blockSubject(b("Girls weekend", "Brooklyn"), nameIn))
      .toMatchObject({ ok: true, name: "Brooklyn Cossey", from: "column" });
  });

  it("uses the note when the column is empty", () => {
    expect(blockSubject(b("Lauren", ""), nameIn))
      .toMatchObject({ ok: true, name: "Lauren Romari", from: "text" });
  });

  it("is happy when they agree, including a nickname", () => {
    expect(blockSubject(b("loz away", "Lauren"), nameIn))
      .toMatchObject({ ok: true, name: "Lauren Romari" });
  });

  it("refuses when neither names anybody", () => {
    expect(blockSubject(b("NO MORE FULLY BOOKED", ""), nameIn).ok).toBe(false);
  });
});
