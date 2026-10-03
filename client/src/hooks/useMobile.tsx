import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(
    undefined
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return !!isMobile;
}

// Whether the device actually has a hovering pointer (a mouse or trackpad).
//
// This is deliberately NOT useIsMobile(). Hover-only affordances break on
// touch because mobile browsers synthesise mouseenter on tap: one tap fired
// both the tap handler and the hover handler, so the Messages page opened the
// thread dialog AND the hover preview on top of it, showing the conversation
// twice. Width is the wrong question — a narrow desktop window still has a
// mouse, and an iPad in landscape is 1024px wide and still has none.
export function useHasHover() {
  const query = "(hover: hover) and (pointer: fine)";
  const [hasHover, setHasHover] = React.useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setHasHover(mql.matches);
    mql.addEventListener("change", onChange);
    setHasHover(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return hasHover;
}

/**
 * Is the viewport at least Tailwind's `lg` (1024px)?
 *
 * Needed where a component must not RENDER below/above a breakpoint, as
 * opposed to merely being hidden by a class. A Radix Dialog with
 * `lg:hidden` on its content still mounts its overlay, which greys out
 * and blocks the whole page — so the three-pane Messages layout has to
 * not mount the dialog at all on a wide screen.
 */
export function useIsWideScreen() {
  const query = "(min-width: 1024px)";
  const [isWide, setIsWide] = React.useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setIsWide(mql.matches);
    mql.addEventListener("change", onChange);
    setIsWide(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isWide;
}
