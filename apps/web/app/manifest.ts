import type { MetadataRoute } from "next";

/**
 * Installable web app (market-readiness #290, Q7: "add to home screen" before the Android app). Persian-first like the
 * site: it opens the Persian home; the other languages stay one tap away in the header. Web push is a later step
 * (needs VAPID keys and a subscription store), so there is no service worker yet.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "اپت لایف | opetlife",
    short_name: "opetlife",
    description: "سلامت، مراقبت، خدمات و لحظه‌های مشترک؛ یک دنیا برای تو و همراه کوچکت.",
    lang: "fa",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FFFBF5",
    theme_color: "#1F5A3D",
    categories: ["lifestyle", "health", "shopping"],
    icons: [
      { src: "/brand/opl/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/opl/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/opl/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
