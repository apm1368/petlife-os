"use client";

import { useEffect } from "react";

/**
 * Progressive reveal for landing bands. Content renders fully visible on the server; only once
 * this runs (and only without reduced motion) are not-yet-seen bands faded in as they enter.
 */
export function LandingReveal() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".lp");
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const bands = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const fold = window.innerHeight;
    for (const band of bands) if (band.getBoundingClientRect().top > fold) band.dataset.reveal = "pending";
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.reveal = "shown";
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    );
    bands.filter((b) => b.dataset.reveal === "pending").forEach((b) => observer.observe(b));
    return () => observer.disconnect();
  }, []);
  return null;
}
