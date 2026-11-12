import type { RouteLocale } from "@/lib/i18n/config";

/** Drawing kit for reel scenes (docs/design/pattern-2026-11/reel.md): 360×640 space, localized, RTL/LTR mirrored. */
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const D = (d: number) => ` style="--d:${d}s"`;

export const BIRD_COLORS = {
  budgie: { b: "#7CC35A", h: "#F4D35E", w: "#4E8A3A", k: "#E9A23B", c: "#3D6FB6", crest: false },
  canary: { b: "#F6C944", h: "#F8D864", w: "#D9A12A", k: "#E8913A", c: "", crest: false },
  cockatiel: { b: "#BDB8AD", h: "#F2D06B", w: "#8F8A80", k: "#A4978A", c: "#F08A4B", crest: true },
  lovebird: { b: "#6DBE5B", h: "#F5926B", w: "#4C9A40", k: "#E8604C", c: "", crest: false },
} as const;
export type BirdKind = keyof typeof BIRD_COLORS;

export function birdInner(kind: BirdKind) {
  const c = BIRD_COLORS[kind];
  return `<g class="b-tail"><path d="M41 40 L59 50 L56 55 L38 45 Z" fill="${c.w}"/></g><g stroke="#9b7653" stroke-width="1.8" stroke-linecap="round"><path d="M28 47 v6"/><path d="M34 47 v6"/><path d="M25.5 53 h5"/><path d="M31.5 53 h5"/></g><ellipse cx="33" cy="38" rx="14" ry="10.5" fill="${c.b}"/><g class="b-head"><circle cx="21" cy="27" r="9" fill="${c.h}"/>${c.crest ? `<path d="M23 19 Q25 9 31 7 Q27 13 27 19 Z" fill="${c.h}"/>` : ""}${c.c ? `<circle cx="19" cy="31" r="2.6" fill="${c.c}"/>` : ""}<circle cx="18" cy="25" r="1.8" fill="#1d1d1b"/><circle cx="17.4" cy="24.4" r=".6" fill="#fff"/><path d="M12.5 26.5 Q9 28.5 12 31 Q14.5 30 14 27.5 Z" fill="${c.k}"/></g><g class="b-wing"><ellipse cx="36" cy="36.5" rx="10" ry="6.5" fill="${c.w}" transform="rotate(-14 36 36.5)"/></g>`;
}

export function makeKit(locale: RouteLocale) {
  const rtl = (locale === "fa" || locale === "ar");
  const dir = rtl ? "rtl" : "ltr";
  const X = (x: number) => (rtl ? x : 360 - x);
  const m = (v: number) => (rtl ? v : -v);
  const T = (x: number, y: number, str: string, o: { a?: "start" | "middle"; s?: number; w?: number; f?: string; c?: string; d?: number; ltr?: boolean } = {}) =>
    `<text x="${x}" y="${y}" direction="${o.ltr ? "ltr" : dir}" text-anchor="${o.a ?? "middle"}" font-family="Vazirmatn,Tahoma,sans-serif" font-size="${o.s ?? 16}" font-weight="${o.w ?? 700}" fill="${o.f ?? "#1E241F"}"${o.c ? ` class="${o.c}"` : ""}${o.d != null ? D(o.d) : ""}>${esc(str)}</text>`;
  const G = (x: number, y: number, cls: string, d: number | null, inner: string, sc?: number) =>
    `<g transform="translate(${x} ${y})${sc ? ` scale(${sc})` : ""}"><g class="${cls}"${d != null ? D(d) : ""}>${inner}</g></g>`;
  const PAW = (f: string) => `<g fill="${f}"><ellipse cx="0" cy="3.6" rx="5" ry="4.2"/><ellipse cx="-5.8" cy="-1.8" rx="1.9" ry="2.4"/><ellipse cx="-2.4" cy="-5.1" rx="1.9" ry="2.5"/><ellipse cx="2.4" cy="-5.1" rx="1.9" ry="2.5"/><ellipse cx="5.8" cy="-1.8" rx="1.9" ry="2.4"/></g>`;
  const HEART = (f: string) => `<path d="M0 9 C-13 0 -11 -11 -4.5 -11 C-1.5 -11 0 -8 0 -7 C0 -8 1.5 -11 4.5 -11 C11 -11 13 0 0 9Z" fill="${f}"/>`;
  const PIN = (f: string, inner = "") => `<path d="M0 0 C-10 -12 -15 -19 -15 -26 A15 15 0 1 1 15 -26 C15 -19 10 -12 0 0Z" fill="${f}"/>${inner}`;
  const LABEL = (w: number, fill: string, txt: string, tf: string) => `<rect x="${-w / 2}" y="-17" width="${w}" height="34" rx="17" fill="${fill}"/>${T(0, 6, txt, { s: 13, w: 850, f: tf })}`;
  const logo = (fill: string, nose: string) =>
    `<g class="a-pop"${D(0.45)}><path d="M19.9 51.8 L16 27 L39.6 36.6 Z" fill="${fill}" stroke="${fill}" stroke-width="5" stroke-linejoin="round"/></g>`
    + `<g class="a-pop"${D(0.55)}><path d="M76.1 51.8 L80 27 L56.4 36.6 Z" fill="${fill}" stroke="${fill}" stroke-width="5" stroke-linejoin="round"/></g>`
    + `<circle class="a-draw" pathLength="1"${D(0.1)} cx="48" cy="68" r="26" fill="none" stroke="${fill}" stroke-width="13"/>`
    + `<g class="a-pop"${D(0.8)}><ellipse cx="40.5" cy="65" rx="3" ry="3.6" fill="${fill}"/><ellipse cx="55.5" cy="65" rx="3" ry="3.6" fill="${fill}"/></g>`
    + `<g class="a-pop"${D(0.9)}><path d="M45 72 h6 l-3 3.6 z" fill="#F2B544"/></g>`
    + `<g class="a-rise"${D(0.5)}><rect x="92" y="36" width="13" height="84" rx="6.5" fill="${fill}"/></g>`
    + `<circle class="a-draw" pathLength="1"${D(0.6)} cx="122" cy="68" r="26" fill="none" stroke="${fill}" stroke-width="13"/>`
    + `<g class="a-pop"${D(1)}><circle cx="130" cy="62" r="3.4" fill="${fill}"/></g>`
    + `<g class="a-pop"${D(1.05)}><ellipse cx="157" cy="66" rx="6" ry="5" fill="${nose}"/></g>`
    + `<g class="a-pop"${D(1.15)}><path d="M109 38 C100 34 91 43 95 60 C98 72 106 77 110 70 C113 63 112 51 117 42 Z" fill="#F2B544"/></g>`
    + `<g class="a-rise"${D(0.9)}><rect x="170" y="22" width="13" height="78.5" rx="6.5" fill="${fill}"/></g>`
    + `<g class="a-sprout"${D(1.3)}><path d="M176.5 26 C176 12 186 3 198 3 C198 16 190 25 176.5 26 Z" fill="#7DB46C"/></g>`;
  const digits = (s: string) => (rtl ? s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]!) : s);
  return { rtl, dir, X, m, T, G, PAW, HEART, PIN, LABEL, logo, digits };
}
export type SceneKit = ReturnType<typeof makeKit>;
