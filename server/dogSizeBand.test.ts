import { describe, expect, it } from "vitest";
import { bandFromServiceText, extractKgRanges, bandForRange, sizeBandLabel } from "@shared/dogSizeBand";

const band = (text: string) => {
  const result = bandFromServiceText(text);
  return "band" in result ? result.band : null;
};

describe("every spelling of a weight band found in the real MoeGo export", () => {
  // Taken from the 2018–2027 appointment export: 162 distinct service names
  // naming a kg figure, reduced to these 24 distinct band fragments.
  it("reads the small band however it is written", () => {
    for (const text of [
      "SML-10kg", "-SML-10kg", "-SML -10kg", "customer SML 10kg",
      "- SMALL-10kg", "omer SML STYLE10kg",
    ]) expect(band(text)).toBe("small");
  });

  it("reads the small-medium band", () => {
    for (const text of [
      "11-13kg", "- SML-MED 11-13KG", "lient-SML/MED 11-13kg",
      "STYLED 11-13kg", "oom - Sml-med 11-13KG",
    ]) expect(band(text)).toBe("small_medium");
  });

  it("reads the medium band, including MoeGo's 14-17 against the salon's 14-16", () => {
    for (const text of ["MED14-17KG", "- Medium 14-16KG", "w Client -Med 14-16kg"]) {
      expect(band(text)).toBe("medium");
    }
  });

  it("reads the large band", () => {
    for (const text of [
      "LARGE 17-25KG", "La 17-25KG", "- Large17-25kg",
      "Client Large 17-25kg", "Large 17-25KG",
    ]) expect(band(text)).toBe("large");
  });

  it("reads extra large and giant", () => {
    expect(band("- XL 26-34KG")).toBe("extra_large");
    expect(band("- XLarge26-34kg")).toBe("extra_large");
    expect(band("Giant 36-80KG")).toBe("giant");
  });

  it("refuses the two ranges that genuinely straddle bands", () => {
    // A dog filed one band too small is quoted and timed too short, so
    // these are left for a human rather than rounded.
    expect(bandFromServiceText("STYLED MEDIUM 8-16KG")).toEqual({ band: null, reason: "ambiguous_range" });
    expect(bandFromServiceText("ient Large-XL 20-30kg")).toEqual({ band: null, reason: "ambiguous_range" });
  });
});

describe("pulling the numbers out", () => {
  it("prefers a range over its own second number", () => {
    // "11-13kg" must not read as "13kg".
    expect(extractKgRanges("11-13kg")).toEqual([[11, 13]]);
  });

  it("treats a single figure as an upper bound", () => {
    expect(extractKgRanges("SML-10kg")).toEqual([[0, 10]]);
  });

  it("copes with no space, odd case and stray punctuation", () => {
    expect(extractKgRanges("XLarge26-34kg")).toEqual([[26, 34]]);
    expect(extractKgRanges("MED14-17KG")).toEqual([[14, 17]]);
    expect(extractKgRanges("- SML -10kg")).toEqual([[0, 10]]);
  });

  it("finds nothing in text with no weight", () => {
    expect(extractKgRanges("Quick Bath - Small to medium")).toEqual([]);
    expect(bandFromServiceText("Nail trim")).toEqual({ band: null, reason: "no_band_in_text" });
    expect(bandFromServiceText("")).toEqual({ band: null, reason: "no_band_in_text" });
    expect(bandFromServiceText(null)).toEqual({ band: null, reason: "no_band_in_text" });
  });
});

describe("two services naming different bands", () => {
  it("refuses rather than picking one", () => {
    // A joined multi-pet row. Resolving it needs the pets aligned by
    // position, which is the caller's job — guessing here would file one
    // dog under the other dog's size.
    const joined = "Diamond SML-10kg-Full Groom Classic,Bronze XLarge26-34kg Full Groom Classic";
    expect(bandFromServiceText(joined)).toEqual({ band: null, reason: "conflicting_bands" });
  });

  it("accepts two services naming the SAME band", () => {
    const joined = "Diamond -SML-10kg-Style Full Groom,Diamond SML-10kg-Full Groom Classic";
    expect(band(joined)).toBe("small");
  });
});

describe("band ranges", () => {
  it("maps a clean range to its band", () => {
    expect(bandForRange([17, 25])).toBe("large");
    expect(bandForRange([26, 34])).toBe("extra_large");
  });

  it("labels for display come from the salon's own band list", () => {
    expect(sizeBandLabel("small")).toBe("Small (0–10 kg)");
    expect(sizeBandLabel("giant")).toBe("Giant (36–80 kg)");
  });
});
