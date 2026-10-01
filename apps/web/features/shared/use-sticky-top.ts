"use client";

import { useCallback, useRef } from "react";

/**
 * Callback ref for a sticky side panel that may be taller than the viewport (a product buy box).
 * It writes `--sticky-top`: under the header when the panel fits, otherwise negative, so the panel
 * scrolls until its bottom edge is in view and then holds — nothing is ever clipped or needs an
 * inner scrollbar.
 */
export function useStickyTop(header = 88, gap = 16) {
  const cleanup = useRef<(() => void) | undefined>(undefined);
  return useCallback(
    (el: HTMLElement | null) => {
      cleanup.current?.();
      cleanup.current = undefined;
      if (!el || typeof ResizeObserver === "undefined") return;
      const update = () =>
        el.style.setProperty(
          "--sticky-top",
          `${Math.min(header, window.innerHeight - el.offsetHeight - gap)}px`,
        );
      const ro = new ResizeObserver(update);
      ro.observe(el);
      window.addEventListener("resize", update);
      update();
      cleanup.current = () => {
        ro.disconnect();
        window.removeEventListener("resize", update);
      };
    },
    [header, gap],
  );
}
