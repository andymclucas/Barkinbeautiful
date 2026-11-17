/**
 * The standard Groomigo logo: the dog above the word "groomigo".
 *
 * Andy, 17/11/2026: "Groomigo wording needs to be underneath the dog icon
 * in all instances." One component so every screen shows the same drawing
 * at the same proportions. scripts/make-logo.mjs draws the two files and
 * records how each choice was made.
 *
 * There are two drawings because the lettering has to contrast with what
 * is behind it: white "groom" for a dark background, dark ink for a light
 * one. `tone="auto"` follows the app's light and dark mode; a surface that
 * is always dark (the staff "My day" header) asks for "on-dark" outright.
 *
 * The file names carry a version because static files are served
 * immutable for a year (server/_core/vite.ts).
 */
import { cn } from "@/lib/utils";

export const GROOMIGO_LOGO_ON_DARK = "/groomigo-logo-on-dark-v1.png";
export const GROOMIGO_LOGO_ON_LIGHT = "/groomigo-logo-on-light-v1.png";

/** Width over height of both drawings, so a height alone reserves the space. */
const ASPECT = 560 / 549;

export function GroomigoLogo({
  tone = "auto",
  height,
  className,
  alt = "Groomigo",
}: {
  /** "auto" follows light and dark mode. */
  tone?: "auto" | "on-dark" | "on-light";
  /** Rendered height in pixels. The word needs about 48 to stay readable. */
  height: number;
  className?: string;
  alt?: string;
}) {
  const size = { height, width: Math.round(height * ASPECT) };
  const shared = cn("select-none object-contain", className);
  if (tone !== "auto") {
    return <img src={tone === "on-dark" ? GROOMIGO_LOGO_ON_DARK : GROOMIGO_LOGO_ON_LIGHT} alt={alt} draggable={false} className={shared} style={size} />;
  }
  // Both drawings, one hidden by the theme. Only the first carries the
  // name, so a screen reader announces "Groomigo" once.
  return (
    <>
      <img src={GROOMIGO_LOGO_ON_LIGHT} alt={alt} draggable={false} className={cn(shared, "dark:hidden")} style={size} />
      <img src={GROOMIGO_LOGO_ON_DARK} alt="" aria-hidden="true" draggable={false} className={cn(shared, "hidden dark:block")} style={size} />
    </>
  );
}

export default GroomigoLogo;
