import type { RouteLocale } from "@/lib/i18n/config";
import { useOplCopy } from "@/features/landing/opl/opl-copy";
import { makeKit } from "@/features/reel/scene-kit";

/**
 * Row 9 of docs/design/pattern-2026-11/pages.md: sign-in and sign-up show only the reel's logo scene as their picture.
 * The light theme gets the cream opening scene, the dark theme the forest closing one; the logo builds once on open
 * (reel.css `.opl-anim`) and rests fully drawn under reduced motion. Static, trusted markup from constants only.
 */
export function AuthLogoScene({ locale, className = "" }: { locale: RouteLocale; className?: string }) {
  const { rtl, T, G, PAW, logo } = makeKit(locale);
  const brand = useOplCopy().brand;
  const word = (fill: string) => T(180, 350, brand, { s: rtl ? 46 : 44, w: rtl ? 900 : 700, f: fill, c: "a-rise", d: 1.35 });
  const light = `<circle cx="70" cy="110" r="70" fill="#FBE7C6"/><circle cx="310" cy="500" r="90" fill="#FBE7C6"/>`
    + G(300, 150, "a-float", 0, PAW("#EBD9B6"), 1.6) + G(64, 420, "a-float", 0.6, PAW("#EBD9B6"), 1.3) + G(250, 560, "a-float", 1.1, PAW("#EBD9B6"), 1.1)
    + `<g transform="translate(60 132) scale(1.2)">${logo("#1F5A3D", "#1E241F")}</g>` + word("#1F5A3D");
  const dark = `<circle cx="320" cy="90" r="80" fill="#2A6B49"/><circle cx="40" cy="560" r="110" fill="#2A6B49"/>`
    + G(300, 170, "a-float", 0, PAW("#3B7E59"), 1.6) + G(64, 430, "a-float", 0.6, PAW("#3B7E59"), 1.3)
    + `<g transform="translate(60 132) scale(1.2)">${logo("#FFFDF8", "#F2B544")}</g>` + word("#FFFDF8");
  const svg = (inner: string) => `<svg viewBox="0 0 360 640" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${inner}</svg>`;
  return <div className={`opl-auth-scene ${className}`} aria-hidden="true">
    <div className="opl-auth-scene__art opl-anim is-light" style={{ background: "#FDF4E6" }} dangerouslySetInnerHTML={{ __html: svg(light) }} />
    <div className="opl-auth-scene__art opl-anim is-dark" style={{ background: "#1F5A3D" }} dangerouslySetInnerHTML={{ __html: svg(dark) }} />
  </div>;
}
