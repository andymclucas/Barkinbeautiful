import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Appointments day viewport layout", () => {
  it("uses the available large-screen viewport below the dashboard padding", () => {
    const source = readFileSync(new URL("../client/src/pages/Calendar.tsx", import.meta.url), "utf8");

    expect(source).toContain('flex min-h-0 flex-col gap-4 lg:h-[calc(100dvh-2rem)]');
    expect(source).toContain('viewMode === "day" ? "flex min-h-0 flex-1 flex-col" : "min-h-0"');
  });

  it("keeps the day card flexible and confines overflow to the staff calendar grid", () => {
    const source = readFileSync(new URL("../client/src/pages/Calendar.tsx", import.meta.url), "utf8");

    expect(source).toContain("min-h-[500px] flex-1");
    expect(source).toContain("lg:min-h-0");
    expect(source).toContain('overflow-x-auto overscroll-x-contain flex-1 flex flex-col');
    expect(source).toContain('className="overflow-y-auto flex-1" ref={scrollRef}');
  });
});
