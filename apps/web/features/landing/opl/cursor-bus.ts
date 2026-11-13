/** Shared, mutable pointer and Cookie positions so birds and the cursor dog react to each other without re-rendering. */
export const cursorBus = {
  pointerX: -9999,
  pointerY: -9999,
  pointerSeen: false,
  cookieX: -9999,
  cookieY: -9999,
  cookieOn: false,
  sayText: "",
  sayUntil: 0,
  activeWorldNode: null as HTMLElement | null,
  stageHover: false,
};

export function say(text: string, ms = 1600) {
  cursorBus.sayText = text;
  cursorBus.sayUntil = performance.now() + ms;
}

/** Media query that answers false where matchMedia is missing (server, test environments). */
export const mediaMatches = (query: string) =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;

export const prefersReducedMotion = () => mediaMatches("(prefers-reduced-motion: reduce)");

/** ResizeObserver with a window-resize fallback (older browsers, test environments). Returns a disconnect function. */
export function observeResize(el: Element, cb: () => void): () => void {
  if (typeof ResizeObserver === "function") { const ro = new ResizeObserver(() => cb()); ro.observe(el); return () => ro.disconnect(); }
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}

/** IntersectionObserver with an always-visible fallback. Returns a disconnect function. */
export function observeVisible(el: Element, cb: (visible: boolean) => void): () => void {
  if (typeof IntersectionObserver === "function") { const io = new IntersectionObserver(([e]) => cb(!!e?.isIntersecting)); io.observe(el); return () => io.disconnect(); }
  cb(true);
  return () => undefined;
}
