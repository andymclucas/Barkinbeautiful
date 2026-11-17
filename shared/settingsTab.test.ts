import { describe, expect, it } from "vitest";
import { requestedSettingsTab, settingsTabHref, SETTINGS_TABS } from "./settingsTab";

describe("which Settings tab the address asks for", () => {
  it("opens the tab a link names", () => {
    expect(requestedSettingsTab("?tab=billing")).toBe("billing");
    expect(requestedSettingsTab("tab=security")).toBe("security");
    for (const tab of SETTINGS_TABS) expect(requestedSettingsTab(`?tab=${tab}`)).toBe(tab);
  });

  it("lands Stripe's return from Checkout on Billing", () => {
    // success_url and cancel_url are /settings?billing=started|cancelled.
    expect(requestedSettingsTab("?billing=started")).toBe("billing");
    expect(requestedSettingsTab("?billing=cancelled")).toBe("billing");
  });

  it("asks for nothing when the address says nothing", () => {
    // Null, not "salon": an open page must not be yanked back to the
    // first tab when the subscription card tidies ?billing= away.
    expect(requestedSettingsTab("")).toBeNull();
    expect(requestedSettingsTab(null)).toBeNull();
    expect(requestedSettingsTab("?billing=")).toBeNull();
    expect(requestedSettingsTab("?other=1")).toBeNull();
  });

  it("ignores a tab that does not exist", () => {
    expect(requestedSettingsTab("?tab=nonsense")).toBeNull();
    expect(requestedSettingsTab("?tab=Billing")).toBeNull();
    // A junk tab does not hide a genuine return from Stripe.
    expect(requestedSettingsTab("?tab=nonsense&billing=started")).toBe("billing");
  });

  it("builds a link the same function reads back", () => {
    expect(settingsTabHref("billing")).toBe("/settings?tab=billing");
    expect(settingsTabHref("salon")).toBe("/settings");
    for (const tab of SETTINGS_TABS) {
      const search = settingsTabHref(tab).split("?")[1] ?? "";
      expect(requestedSettingsTab(search) ?? "salon").toBe(tab);
    }
  });
});
