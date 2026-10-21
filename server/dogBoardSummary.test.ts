import { describe, it, expect } from "vitest";
import { dogBoardSummary } from "../shared/dogBoardSummary";

const NOON = new Date("2026-10-22T02:00:00Z"); // midday Brisbane

describe("dogBoardSummary", () => {
  it("is empty for a dog with nothing recorded, so a card can say so", () => {
    const out = dogBoardSummary({ petName: "Rosie" }, NOON);
    expect(out.isEmpty).toBe(true);
    expect(out.alert).toBeNull();
    expect(out.collect).toBeNull();
    expect(out.addOnBadges).toEqual([]);
  });

  it("surfaces a danger alert with its text", () => {
    const out = dogBoardSummary({ petAlertLevel: "danger", petWarnings: "Bites when brushed" }, NOON);
    expect(out.alert).toEqual({ level: "danger", text: "Bites when brushed" });
    expect(out.isEmpty).toBe(false);
  });

  it("keeps a danger flag even when nobody wrote why", () => {
    // The flag is the warning. Dropping it because the text is blank
    // would hide the one thing that matters.
    expect(dogBoardSummary({ petAlertLevel: "danger" }, NOON).alert)
      .toEqual({ level: "danger", text: null });
  });

  it("ignores an alert level that is neither danger nor caution", () => {
    for (const level of ["none", "", "ok", null, undefined]) {
      expect(dogBoardSummary({ petAlertLevel: level as string }, NOON).alert, String(level)).toBeNull();
    }
  });

  it("reads the alert level whatever case it is stored in", () => {
    expect(dogBoardSummary({ petAlertLevel: "DANGER" }, NOON).alert?.level).toBe("danger");
    expect(dogBoardSummary({ petAlertLevel: "Caution" }, NOON).alert?.level).toBe("caution");
  });

  it("carries the out-time and how it is tracking", () => {
    const out = dogBoardSummary({
      collectBy: new Date("2026-10-22T04:00:00Z"),   // 2pm Brisbane
      workflowState: "bathing",
      petSizeBand: "small",
    }, NOON);
    expect(out.collect?.label).toBe("BY 14:00");
    expect(out.collect?.risk).not.toBe("none");
  });

  it("has no out-time when the dog has no deadline", () => {
    expect(dogBoardSummary({ workflowState: "bathing" }, NOON).collect).toBeNull();
  });

  it("shortens the add-ons for a badge and spells them out for a tooltip", () => {
    const out = dogBoardSummary({
      addOns: [{ name: "Teeth Ultra Clean" }, { name: "Anal Glands", quantity: 2 }],
    }, NOON);
    expect(out.addOnBadges).toEqual(["Teeth ultra", "Glands"]);
    expect(out.addOnLine).toBe("Teeth Ultra Clean, Anal Glands ×2");
  });

  it("drops a nameless add-on rather than rendering a blank badge", () => {
    const out = dogBoardSummary({ addOns: [{ name: "Glands" }, { name: "   " }] }, NOON);
    expect(out.addOnBadges).toEqual(["Glands"]);
  });

  it("keeps the style note separate from the notes typed today", () => {
    // One is how this dog is always cut; the other is what happened this
    // morning. Merging them loses which is which.
    const out = dogBoardSummary({
      groomStyleNote: "Teddy bear face, #4 body",
      notes: "Owner running late",
    }, NOON);
    expect(out.styleNote).toBe("Teddy bear face, #4 body");
    expect(out.appointmentNotes).toBe("Owner running late");
  });

  it("keeps the board scribble separate from the sold add-ons", () => {
    const out = dogBoardSummary({
      workflowAddOns: "check left ear",
      addOns: [{ name: "Teeth Brushing" }],
    }, NOON);
    expect(out.boardNote).toBe("check left ear");
    expect(out.addOnBadges).toEqual(["Teeth"]);
  });

  it("splits MoeGo's comma-joined tags", () => {
    const out = dogBoardSummary({ petMoegoCodeLabels: "✂5f, #7f, No cologne, SENSITIVE" }, NOON);
    expect(out.codes).toEqual(["✂5f", "#7f", "No cologne", "SENSITIVE"]);
  });

  it("drops empty fragments from a trailing or doubled comma", () => {
    expect(dogBoardSummary({ petMoegoCodeLabels: "#3,, ,SENSITIVE," }, NOON).codes)
      .toEqual(["#3", "SENSITIVE"]);
  });

  it("treats whitespace-only text as absent everywhere", () => {
    const out = dogBoardSummary({
      groomStyleNote: "   ", notes: "\n", workflowAddOns: "  ", petWarnings: " ",
    }, NOON);
    expect(out.styleNote).toBeNull();
    expect(out.appointmentNotes).toBeNull();
    expect(out.boardNote).toBeNull();
    expect(out.isEmpty).toBe(true);
  });

  it("is not empty when any single thing is present", () => {
    const each = [
      { petAlertLevel: "caution" },
      { addOns: [{ name: "Glands" }] },
      { groomStyleNote: "short all over" },
      { notes: "ring on arrival" },
      { workflowAddOns: "left ear" },
      { petMoegoCodeLabels: "#3" },
      { collectBy: new Date("2026-10-22T04:00:00Z"), workflowState: "bathing" },
    ];
    for (const row of each) {
      expect(dogBoardSummary(row, NOON).isEmpty, JSON.stringify(row)).toBe(false);
    }
  });
});
