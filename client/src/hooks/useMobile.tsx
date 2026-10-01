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
