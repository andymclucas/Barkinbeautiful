import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GroomigoLogo, GROOMIGO_LOGO_ON_DARK, GROOMIGO_LOGO_ON_LIGHT, sidebarLogoTone } from "./GroomigoLogo";

describe("GroomigoLogo", () => {
  it("shows the white-lettered drawing on a surface that is always dark", () => {
    render(<GroomigoLogo tone="on-dark" height={52} />);
    const img = screen.getByRole("img", { name: "Groomigo" }) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(GROOMIGO_LOGO_ON_DARK);
  });

  it("shows the dark-ink drawing on a surface that is always light", () => {
    // White "groom" disappears on a light screen, which is why there are two.
    render(<GroomigoLogo tone="on-light" height={52} />);
    const img = screen.getByRole("img", { name: "Groomigo" }) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(GROOMIGO_LOGO_ON_LIGHT);
  });

  it("carries both drawings when it follows the theme, and names itself once", () => {
    const { container } = render(<GroomigoLogo height={120} />);
    const all = Array.from(container.querySelectorAll("img"));
    expect(all.map((i) => i.getAttribute("src"))).toEqual([GROOMIGO_LOGO_ON_LIGHT, GROOMIGO_LOGO_ON_DARK]);
    // The light drawing hides in dark mode and the dark one shows only then.
    expect(all[0].className).toContain("dark:hidden");
    expect(all[1].className).toContain("hidden");
    expect(all[1].className).toContain("dark:block");
    expect(screen.getAllByRole("img", { name: "Groomigo" })).toHaveLength(1);
  });

  it("reserves its space from the height alone, so the page does not jump as it loads", () => {
    render(<GroomigoLogo tone="on-dark" height={100} />);
    const img = screen.getByRole("img", { name: "Groomigo" }) as HTMLImageElement;
    expect(img.style.height).toBe("100px");
    expect(Number.parseInt(img.style.width, 10)).toBeGreaterThan(95);
    expect(Number.parseInt(img.style.width, 10)).toBeLessThan(110);
  });
});

describe("sidebarLogoTone", () => {
  it("uses the white lettering in Christmas mode, where the sidebar is dark green", () => {
    expect(sidebarLogoTone({ festive: true, sidebar: "#ffffff" })).toBe("on-dark");
    render(<GroomigoLogo tone={sidebarLogoTone({ festive: true })} height={60} />);
    expect((screen.getByRole("img", { name: "Groomigo" }) as HTMLImageElement).getAttribute("src")).toBe(GROOMIGO_LOGO_ON_DARK);
  });

  it("uses the white lettering on the default dark sidebar, whatever the app's mode", () => {
    expect(sidebarLogoTone({})).toBe("on-dark");
    expect(sidebarLogoTone({ sidebar: "#2b1830" })).toBe("on-dark");
  });

  it("uses the dark lettering when a salon picks a light sidebar", () => {
    expect(sidebarLogoTone({ sidebar: "#f5f0f7" })).toBe("on-light");
    render(<GroomigoLogo tone={sidebarLogoTone({ sidebar: "#f5f0f7" })} height={60} />);
    expect((screen.getByRole("img", { name: "Groomigo" }) as HTMLImageElement).getAttribute("src")).toBe(GROOMIGO_LOGO_ON_LIGHT);
  });

  it("derives the sidebar from the primary colour when none was chosen", () => {
    expect(sidebarLogoTone({ primary: "#d61572" })).toBe("on-dark");
  });
});
