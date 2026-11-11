import { describe, expect, it } from "vitest";
import { looksLikeVideoStart, parseRange, piecesForRange } from "./issueVideo";

describe("parseRange", () => {
  it("serves the whole file with no header or an odd one", () => {
    expect(parseRange(undefined, 100)).toBeNull();
    expect(parseRange("items=0-5", 100)).toBeNull();
  });

  it("reads the forms browsers send for media", () => {
    expect(parseRange("bytes=0-", 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=0-1", 100)).toEqual({ start: 0, end: 1 }); // Safari's first probe
    expect(parseRange("bytes=50-500", 100)).toEqual({ start: 50, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
  });

  it("refuses a range outside the file", () => {
    expect(parseRange("bytes=100-", 100)).toBe("unsatisfiable");
    expect(parseRange("bytes=60-50", 100)).toBe("unsatisfiable");
  });
});

describe("piecesForRange", () => {
  it("maps a byte range onto fixed-size pieces", () => {
    expect(piecesForRange(0, 9, 10)).toEqual([{ seq: 0, from: 0, to: 9 }]);
    expect(piecesForRange(5, 24, 10)).toEqual([
      { seq: 0, from: 5, to: 9 },
      { seq: 1, from: 0, to: 9 },
      { seq: 2, from: 0, to: 4 },
    ]);
    expect(piecesForRange(10, 10, 10)).toEqual([{ seq: 1, from: 0, to: 0 }]);
  });
});

describe("looksLikeVideoStart", () => {
  it("knows MP4/QuickTime and WebM, and nothing else", () => {
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypisom"), Buffer.alloc(8)]);
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(12)]);
    expect(looksLikeVideoStart(mp4)).toBe(true);
    expect(looksLikeVideoStart(webm)).toBe(true);
    expect(looksLikeVideoStart(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>"))).toBe(false);
    expect(looksLikeVideoStart(Buffer.from("<html><body>hi</body></html>"))).toBe(false);
  });
});
