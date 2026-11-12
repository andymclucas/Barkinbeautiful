import { describe, expect, it } from "vitest";
import { phoneKind } from "./PortalInstallTip";

describe("which Home Screen instructions a phone gets", () => {
  it("tells an iPhone in Safari to use Share, and an iPhone in another browser to open Safari", () => {
    expect(phoneKind("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1")).toBe("ios-safari");
    expect(phoneKind("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 CriOS/126.0 Mobile/15E148 Safari/604.1")).toBe("ios-other");
  });

  it("knows an Android phone", () => {
    expect(phoneKind("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36")).toBe("android");
  });

  it("offers nothing to a desktop rather than guessing", () => {
    expect(phoneKind("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15")).toBeNull();
  });
});
