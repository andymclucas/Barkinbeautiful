import { useEffect, useState } from "react";
import { boardFitScale } from "@shared/boardFitScale";

/**
 * The scale for the Workflow Board, from the width actually available to it.
 *
 * Returns a CALLBACK ref rather than taking a ref object: the board renders
 * nothing to measure while TV mode is on, and an effect keyed on a stable
 * ref object would never notice the element arriving when TV mode ends.
 *
 * Measures the UNSCALED wrapper, so shrinking the board inside it cannot
 * feed back into the measurement. The rule itself is shared/boardFitScale.ts.
 */
export function useBoardFitScale(): { ref: (el: HTMLElement | null) => void; scale: number } {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!el || typeof ResizeObserver === "undefined") {
      setScale(1);
      return;
    }
    const coarse =
      typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
    const measure = () => setScale(boardFitScale(el.clientWidth, { coarsePointer: coarse }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);

  return { ref: setEl, scale };
}
