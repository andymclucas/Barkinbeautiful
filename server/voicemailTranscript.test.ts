import { describe, expect, it } from "vitest";
import { tidyTranscript, extractCallbackNumbers, normaliseSpokenDigits, formatAustralianNumber, worthShowingCallback } from "@shared/voicemailTranscript";

describe("reading a number out of a voicemail", () => {
  it("decodes the salon's own voicemails", () => {
    // Every one of these is a real transcript. The first is the one Andy
    // flagged; the rest are confirmed correct because the decoded number
    // matches the caller ID the call actually came from.
    const cases: [string, string][] = [
      ["can you call me back on 418 double 104 double 5. Think.", "0418110455"],
      ["call me back on a double 49636892, my names, diana", "0449636892"],
      ["My number here is 415757424.", "0415757424"],
      ["give me a call back on 043-401-7029", "0434017029"],
      ["give me a call on 2. I 421362, double 93. Thank you.", "0421362993"],
      ["which is mom and 043-323-0941. Baby.", "0433230941"],
    ];
    for (const [text, expected] of cases) {
      expect(extractCallbackNumbers(text)[0]).toBe(expected);
    }
  });

  it("finds the number when the caller withheld their caller ID", () => {
    // Missed call #1680004 came in as "+anonymous", so the transcript is
    // the only way to ring this person back.
    const text = "Hi, I need to change up the appointment. My phone number is are 415434209. Thank you.";
    expect(extractCallbackNumbers(text)).toEqual(["0415434209"]);
    expect(tidyTranscript(text)).toContain("0415 434 209");
  });

  it("expands spoken repeats without touching ordinary words", () => {
    expect(normaliseSpokenDigits("double 4")).toBe("44");
    expect(normaliseSpokenDigits("triple 7")).toBe("777");
    expect(normaliseSpokenDigits("double five")).toBe("55");
    // "Double booked" is a real thing a caller says and must survive.
    expect(normaliseSpokenDigits("I think I am double booked")).toBe("I think I am double booked");
    expect(normaliseSpokenDigits("double trouble")).toBe("double trouble");
  });

  it("formats mobiles and landlines the way they are dialled", () => {
    expect(formatAustralianNumber("0418110455")).toBe("0418 110 455");
    expect(formatAustralianNumber("0738215455")).toBe("07 3821 5455");
  });

  it("refuses a half-heard number rather than inventing one", () => {
    // Somebody will dial whatever is shown, so anything that is not a
    // complete Australian number comes back as nothing.
    expect(extractCallbackNumbers("call me on 1234")).toEqual([]);
    expect(extractCallbackNumbers("my number is 12345678901234")).toEqual([]);
    expect(extractCallbackNumbers("no number at all here")).toEqual([]);
  });

  it("leaves misheard words exactly as they are", () => {
    // It cannot repair "mini girdle" (a Mini Groodle) and must not try —
    // a transcript that quietly rewrites the message is worse than a rough
    // one. Only the digits change.
    const text = "She's the little mini girdle and I wanted a full game";
    expect(tidyTranscript(text)).toBe(text);
  });

  it("copes with nothing", () => {
    expect(tidyTranscript(null)).toBe("");
    expect(tidyTranscript(undefined)).toBe("");
    expect(extractCallbackNumbers("")).toEqual([]);
  });
});

describe("which spoken numbers are worth offering", () => {
  it("drops the caller's own number — the salon already has it", () => {
    expect(worthShowingCallback("0415757424", "+61415757424")).toBe(false);
    expect(worthShowingCallback("0415757424", "0415757424")).toBe(false);
  });

  it("drops a number one digit off the caller's — that is a mishearing", () => {
    // Missed call #1470001: rang from 0423 856 159, transcript said
    // 0433 856 159. Offering it would send somebody to a stranger.
    expect(worthShowingCallback("0433856159", "+61423856159")).toBe(false);
  });

  it("keeps a genuinely different number", () => {
    // #1740001: Connie rang from the salon's landline area code and asked
    // to be called on her mobile.
    expect(worthShowingCallback("0418110455", "+61738215455")).toBe(true);
    // Two digits out is a different number, not a slip.
    expect(worthShowingCallback("0433857159", "+61423856159")).toBe(true);
  });

  it("keeps everything when the caller withheld their number", () => {
    expect(worthShowingCallback("0415434209", "+anonymous")).toBe(true);
    expect(worthShowingCallback("0415434209", null)).toBe(true);
  });
});
