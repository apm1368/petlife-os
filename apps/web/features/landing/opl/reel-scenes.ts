import type { RouteLocale } from "@/lib/i18n/config";
import type { OplCopy } from "./opl-copy";
import { D, birdInner, makeKit } from "@/features/reel/scene-kit";
export { BIRD_COLORS, birdInner, type BirdKind } from "@/features/reel/scene-kit";

/**
 * Illustrated reel scenes (docs/design/pattern-2026-11/reel.md). Each scene is static, trusted SVG markup built
 * from constants and localized labels only; no visitor input ever reaches it. Space is 360×640; text lives in y 90–460.
 */
import type { ReelScene } from "@/features/reel/ReelSection";
export type { ReelScene };

export function buildReelScenes(copy: OplCopy, locale: RouteLocale): ReelScene[] {
  const { rtl, X, m, T, G, PAW, HEART, PIN, LABEL, logo, digits } = makeKit(locale);
  const S = copy.scenes;
  const brandWord = (fill: string, d: number) => T(180, 350, copy.brand, { s: rtl ? 46 : 44, w: rtl ? 900 : 700, f: fill, c: "a-rise", d });
  const unknown = copy.share.unknown.split(/[;؛]/)[0]!.trim();

  const s1 = `<circle cx="70" cy="110" r="70" fill="#FBE7C6"/><circle cx="310" cy="500" r="90" fill="#FBE7C6"/>`
    + G(300, 150, "a-float", 0, PAW("#EBD9B6"), 1.6) + G(64, 420, "a-float", 0.6, PAW("#EBD9B6"), 1.3)
    + `<g transform="translate(60 132) scale(1.2)">${logo("#1F5A3D", "#1E241F")}</g>`
    + brandWord("#1F5A3D", 1.35) + T(180, 388, S.tagline, { s: 16, w: 600, f: "#4F574F", c: "a-rise", d: 1.55 });

  const rows = ([[copy.share.sections.vaccination, "ok"], [copy.share.sections.medications, "time"], [copy.share.sections.allergies, "unk"]] as const).map(([label, kind], i) => {
    const y = 250 + i * 56, mx = X(106);
    const marker = kind === "ok" ? `<circle cx="${mx}" cy="${y + 22}" r="12" fill="#2E7650"/><path d="M${mx - 6} ${y + 22} l4 4 l8 -8" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
      : kind === "time" ? `<circle cx="${mx}" cy="${y + 22}" r="12" fill="#F2B544"/><path d="M${mx} ${y + 15} v7 l5 3" stroke="#3A2A05" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
      : `<rect x="${rtl ? 88 : 210}" y="${y + 11}" width="62" height="22" rx="11" fill="none" stroke="#B9AE9B" stroke-width="1.5" stroke-dasharray="4 3"/>${T(X(119), y + 26, unknown, { s: 11, w: 700, f: "#6B726A" })}`;
    return `<g class="a-rise"${D(0.8 + i * 0.18)}><rect x="84" y="${y}" width="192" height="44" rx="14" fill="#F4F9F3"/>${T(X(262), y + 28, label, { a: "start", s: 15, w: 750 })}${marker}</g>`;
  }).join("");
  const s2 = `<circle cx="310" cy="110" r="70" fill="#D2EACD"/><circle cx="40" cy="500" r="90" fill="#D2EACD"/><ellipse cx="180" cy="446" rx="104" ry="10" fill="rgb(31 90 61 / .12)"/>`
    + `<g class="a-rise"${D(0.05)}><rect x="62" y="118" width="236" height="318" rx="28" fill="#fff"/></g>`
    + G(X(262), 156, "a-pop", 0.3, `<circle r="16" fill="#E3F1E0"/><circle r="8" fill="none" stroke="#1F5A3D" stroke-width="4"/><path d="M-8 -3 L-9 -12 L-2 -8 Z M8 -3 L9 -12 L2 -8 Z" fill="#1F5A3D"/>`)
    + T(X(238), 152, S.healthTitle, { a: "start", s: 17, w: 850, c: "a-fade", d: 0.35 })
    + T(X(238), 172, S.healthSub, { a: "start", s: 12, w: 500, f: "#6B726A", c: "a-fade", d: 0.45 })
    + `<path class="a-draw" pathLength="1"${D(0.5)} d="M84 214 H140 L150 194 L162 236 L174 202 L182 214 H276" fill="none" stroke="#E46A5B" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
    + rows + `<g transform="translate(300 122)"><g class="a-float"><g class="a-pop"${D(1.4)}><circle r="24" fill="#F2B544"/>${HEART("#fff")}</g></g></g>`;

  let grid = "";
  const marks: Record<string, [string, number]> = { "0,2": ["#1F5A3D", 0.6], "1,5": ["#F2B544", 0.8], "3,1": ["#7DB46C", 1] };
  for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) {
    const cx = 84 + c * 32, cy = 236 + r * 38, mk = marks[`${r},${c}`];
    grid += mk ? G(cx, cy, "a-pop", mk[1], `<circle r="13" fill="${mk[0]}"/>`) : `<circle cx="${cx}" cy="${cy}" r="11" fill="#F4EFE3"/>`;
  }
  const pill = (w: number, bg: string, dot: string, txt: string, tf: string) => `<rect x="${-w / 2}" y="-22" width="${w}" height="44" rx="22" fill="${bg}"/><circle cx="${m(w / 2 - 24)}" cy="0" r="9" fill="${dot}"/>${T(m(w / 2 - 40), 6, txt, { a: "start", s: 14, w: 800, f: tf })}`;
  const s3 = `<circle cx="300" cy="530" r="100" fill="#FFE6A6"/><circle cx="40" cy="90" r="60" fill="#FFE6A6"/><ellipse cx="180" cy="410" rx="110" ry="10" fill="rgb(140 100 20 / .12)"/>`
    + `<g class="a-rise"${D(0.05)}><rect x="58" y="150" width="244" height="250" rx="26" fill="#fff"/><rect x="58" y="150" width="244" height="56" rx="26" fill="#1F5A3D"/><rect x="58" y="182" width="244" height="24" fill="#1F5A3D"/><circle cx="112" cy="150" r="7" fill="#F2B544"/><circle cx="248" cy="150" r="7" fill="#F2B544"/>${T(180, 186, S.calendarTitle, { s: 17, w: 850, f: "#fff" })}</g>`
    + grid + G(180, 104, "a-pop", 1.1, pill(228, "#fff", "#F2B544", S.reminderMed, "#1E241F")) + G(180, 446, "a-pop", 1.5, pill(228, "#1F5A3D", "#7DB46C", S.reminderVaccine, "#fff"))
    + `<g transform="translate(${X(318)} 196)"><g class="a-ring"><path d="M0 -16 C-10 -16 -14 -8 -14 2 L-14 10 L14 10 L14 2 C14 -8 10 -16 0 -16 Z" fill="#F2B544"/><circle cy="15" r="4" fill="#F2B544"/><circle cy="-18" r="3" fill="#F2B544"/></g></g>`;

  const s4 = `<circle cx="320" cy="90" r="80" fill="#2A6B49"/><circle cx="30" cy="560" r="100" fill="#2A6B49"/>`
    + `<g class="a-rise"${D(0.05)}><rect x="36" y="140" width="288" height="200" rx="26" fill="#2E7650"/><g fill="none" stroke="#3E8C60" stroke-width="12" stroke-linecap="round"><path d="M36 220 C120 200 200 280 324 250"/><path d="M150 140 C162 200 138 280 172 340"/><path d="M36 306 C120 290 240 316 324 296"/></g><ellipse cx="272" cy="186" rx="34" ry="22" fill="#3A8A5B"/><ellipse cx="80" cy="268" rx="26" ry="18" fill="#3A8A5B"/></g>`
    + G(96, 236, "a-drop", 0.3, PIN("#FFFDF8", `<circle cy="-26" r="6" fill="#2E7650"/>`)) + G(262, 292, "a-drop", 0.45, PIN("#FFFDF8", `<circle cy="-26" r="6" fill="#2E7650"/>`))
    + `<g transform="translate(206 222)"><circle class="a-pulse"${D(0.9)} r="22" fill="none" stroke="#F2B544" stroke-width="3"/></g>`
    + G(206, 222, "a-drop", 0.6, PIN("#F2B544", `<path d="M-3 -36 h6 v7 h7 v6 h-7 v7 h-6 v-7 h-7 v-6 h7z" fill="#3A2A05"/>`), 1.25)
    + G(206, 120, "a-pop", 0.95, LABEL(160, "#fff", S.nearestClinic, "#1F5A3D"))
    + (["10:00", "11:30", "17:00"]).map((t, i) => G([100, 180, 260][i]!, 372, i === 1 ? "a-pop" : "a-rise", i === 1 ? 1.25 : 1.05 + i * 0.05, `<rect x="-36" y="-18" width="72" height="36" rx="18" fill="${i === 1 ? "#F2B544" : "#FFFDF8"}"/>${T(0, 6, digits(t), { s: 14, w: 800, f: i === 1 ? "#3A2A05" : "#1F5A3D", ltr: true })}`)).join("")
    + G(180, 436, "a-pop", 1.65, `<rect x="-104" y="-25" width="208" height="50" rx="25" fill="#FFFDF8"/><circle cx="${m(76)}" r="14" fill="#2E7650"/><path d="M${m(76) - 7} 0 l5 5 l9 -9" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${T(m(52), 6, S.booked, { a: "start", s: 15, w: 850, f: "#1F5A3D" })}`);

  const s5 = `<circle cx="310" cy="120" r="80" fill="#F6C6A4"/><circle cx="50" cy="530" r="100" fill="#F6C6A4"/>`
    + `<g transform="translate(84 146)"><g class="a-spin"><path d="M0 -30 A30 30 0 1 1 -30 0" fill="none" stroke="#1F5A3D" stroke-width="6" stroke-linecap="round"/><path d="M-38 -8 L-30 0 L-22 -8" fill="none" stroke="#1F5A3D" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></g></g>`
    + G(96, 200, "a-pop", 1.4, LABEL(150, "#fff", S.repeat, "#1F5A3D"))
    + G(146, 250, "a-drop", 0.3, `<path d="M-28 -4 H28 C26 14 14 22 0 22 C-14 22 -26 14 -28 -4Z" fill="#F2B544"/><rect x="-31" y="-9" width="62" height="8" rx="4" fill="#DD9A25"/><circle cx="-8" cy="-12" r="4" fill="#9C6A3A"/><circle cx="2" cy="-14" r="4" fill="#9C6A3A"/><circle cx="11" cy="-11" r="4" fill="#9C6A3A"/>`)
    + `<g transform="translate(206 228) rotate(-24)"><g class="a-drop"${D(0.5)}><g fill="#FFFDF8"><circle cx="-18" cy="-5" r="6"/><circle cx="-18" cy="5" r="6"/><circle cx="18" cy="-5" r="6"/><circle cx="18" cy="5" r="6"/><rect x="-18" y="-5" width="36" height="10"/></g></g></g>`
    + G(236, 248, "a-drop", 0.7, `<rect x="-14" y="-24" width="28" height="46" rx="6" fill="#E46A5B"/><rect x="-14" y="-6" width="28" height="14" fill="#FFFDF8"/><ellipse cy="-24" rx="14" ry="4" fill="#F08A7C"/>`)
    + G(122, 234, "a-drop", 0.9, `<circle r="13" fill="#7DB46C"/><path d="M-12 -4 C-4 0 4 0 12 -4 M-12 5 C-4 1 4 1 12 5" stroke="#fff" stroke-width="2" fill="none"/>`)
    + `<g class="a-rise"${D(0)}><path d="M146 272 C146 232 214 232 214 272" fill="none" stroke="#1F5A3D" stroke-width="9" stroke-linecap="round"/><rect x="102" y="268" width="156" height="150" rx="24" fill="#1F5A3D"/><rect x="102" y="268" width="156" height="22" rx="11" fill="#2E7650"/>${T(180, 374, S.shop, { s: 22, w: 900, f: "#FFFDF8" })}<path d="M172 340 C171 326 180 318 192 318 C192 330 184 339 172 340Z" fill="#7DB46C"/></g>`;

  const bubbles = ([[60, 330, 14, 0], [96, 360, 9, 0.5], [132, 340, 18, 1], [250, 350, 12, 0.3], [296, 330, 8, 0.8], [222, 372, 16, 1.4], [170, 360, 10, 1.8]] as const)
    .map(([x, y, r, d]) => G(x, y, "a-up", d, `<circle r="${r}" fill="rgb(255 255 255 / .55)" stroke="#fff" stroke-width="2"/><circle cx="${(-r * 0.35).toFixed(1)}" cy="${(-r * 0.35).toFixed(1)}" r="${(r * 0.22).toFixed(1)}" fill="#fff"/>`)).join("");
  const s6 = `<circle cx="300" cy="560" r="110" fill="#D9D2F0"/><circle cx="60" cy="90" r="60" fill="#D9D2F0"/>` + bubbles
    + `<g transform="translate(112 200)"><g class="a-pop"${D(0.15)}><g class="a-snip"><path d="M0 0 L58 -10 L60 -4 Z" fill="#FFFDF8" stroke="#6A4D78" stroke-width="2" stroke-linejoin="round"/><circle cx="-16" cy="-10" r="10" fill="none" stroke="#6A4D78" stroke-width="5"/></g><path d="M0 0 L58 10 L60 4 Z" fill="#FFFDF8" stroke="#6A4D78" stroke-width="2" stroke-linejoin="round"/><circle cx="-16" cy="10" r="10" fill="none" stroke="#6A4D78" stroke-width="5"/><circle r="3.5" fill="#6A4D78"/></g></g>`
    + G(226, 170, "a-pop", 0.5, LABEL(160, "#fff", S.grooming, "#6A4D78"))
    + `<g class="a-rise"${D(0.35)}><path d="M110 330 L190 266 L270 330 Z" fill="#1F5A3D" stroke="#1F5A3D" stroke-width="10" stroke-linejoin="round"/><rect x="126" y="320" width="128" height="104" rx="12" fill="#FFF8EE"/><rect x="176" y="362" width="28" height="62" rx="14" fill="#F2B544"/><rect x="214" y="338" width="26" height="24" rx="6" fill="#FFE08A"/><rect x="140" y="338" width="26" height="24" rx="6" fill="#FFE08A"/></g>`
    + G(296, 268, "a-pop", 0.9, `<circle r="20" fill="#FFE08A"/><circle cx="9" cy="-6" r="17" fill="#E7E2F6"/>`)
    + ([[258, 236, 0], [318, 322, 0.4], [62, 272, 0.8]] as const).map(([x, y, d]) => G(x, y, "a-twinkle", d, `<path d="M0 -8 L2 -2 L8 0 L2 2 L0 8 L-2 2 L-8 0 L-2 -2Z" fill="#F2B544"/>`)).join("")
    + G(190, 456, "a-pop", 1.3, LABEL(150, "#1F5A3D", S.boarding, "#fff"));

  const rays = Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4; return `<path d="M${(Math.cos(a) * 30).toFixed(1)} ${(Math.sin(a) * 30).toFixed(1)} L${(Math.cos(a) * 40).toFixed(1)} ${(Math.sin(a) * 40).toFixed(1)}" stroke="#F2B544" stroke-width="5" stroke-linecap="round"/>`; }).join("");
  const CLOUD = `<g fill="#fff"><circle cx="-14" cy="0" r="12"/><circle cx="2" cy="-8" r="16"/><circle cx="18" cy="0" r="12"/><rect x="-26" y="0" width="56" height="12" rx="6"/></g>`;
  const ROAD = "M30 470 C150 450 260 470 262 396 C264 326 112 340 106 268 C100 206 190 176 252 156";
  const s7 = `<g transform="translate(292 108)"><g class="a-spin">${rays}</g><circle r="22" fill="#F2B544"/></g>` + G(84, 118, "a-float", 0, CLOUD) + G(214, 206, "a-float", 0.8, CLOUD, 0.8)
    + `<path data-road="1" class="a-draw" pathLength="1"${D(0.05)} d="${ROAD}" fill="none" stroke="#9CC6D8" stroke-width="30" stroke-linecap="round"/>`
    + `<path class="a-fade"${D(0.7)} d="${ROAD}" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="10 12" stroke-linecap="round"/>`
    + G(252, 152, "a-drop", 1, PIN("#1F5A3D", `<g transform="translate(0 -26) scale(.9)">${PAW("#fff")}</g>`)) + G(252, 92, "a-pop", 1.5, LABEL(140, "#fff", S.petFriendly, "#1F5A3D"))
    + `<g data-car="1" transform="translate(180 360)"><rect x="-32" y="-14" width="64" height="24" rx="10" fill="#E46A5B"/><rect x="-18" y="-30" width="34" height="20" rx="9" fill="#E46A5B"/><rect x="-14" y="-27" width="26" height="13" rx="5" fill="#fff"/><circle cx="-1" cy="-20" r="4.2" fill="none" stroke="#1F5A3D" stroke-width="2.2"/><path d="M-5 -22 L-6 -27 L-2.5 -24Z M3 -22 L4 -27 L0.5 -24Z" fill="#1F5A3D"/><circle cx="-17" cy="11" r="7" fill="#1E241F"/><circle cx="17" cy="11" r="7" fill="#1E241F"/><circle cx="-17" cy="11" r="2.6" fill="#fff"/><circle cx="17" cy="11" r="2.6" fill="#fff"/></g>`;

  const s8 = `<circle cx="320" cy="560" r="110" fill="#D9ECD5"/><circle cx="40" cy="90" r="70" fill="#D9ECD5"/>`
    + G(118, 214, "a-pop", 0.1, `<path d="M0 -78 C26 -60 50 -56 66 -56 V-6 C66 44 34 70 0 84 C-34 70 -66 44 -66 -6 V-56 C-50 -56 -26 -60 0 -78Z" fill="#1F5A3D"/><path d="M0 -62 C20 -48 38 -44 50 -44 V-6 C50 34 26 54 0 66Z" fill="#2E7650"/>`, 0.85)
    + `<g transform="translate(118 214) scale(.85)"><path class="a-draw" pathLength="1"${D(0.6)} d="M-26 2 L-6 22 L30 -18" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></g>`
    + G(118, 306, "a-rise", 0.9, LABEL(140, "#fff", S.insurance, "#1F5A3D"))
    + `<g transform="translate(246 352)">${[0, 0.6, 1.2].map((d) => `<circle class="a-pulse"${D(d)} r="40" fill="none" stroke="#2E7650" stroke-width="3"/>`).join("")}<circle r="58" fill="none" stroke="#C9E2C4" stroke-width="1.5" stroke-dasharray="3 6"/></g>`
    + G(246, 368, "a-drop", 1, PIN("#F2B544", `<g transform="translate(0 -26) scale(.9)">${PAW("#3A2A05")}</g>`)) + G(246, 438, "a-rise", 1.3, LABEL(150, "#1F5A3D", S.lost, "#fff"));

  const hearts = ([[70, 470, 0, "#E46A5B"], [130, 500, 0.7, "#F2B544"], [230, 480, 0.3, "#F2B544"], [290, 500, 1.1, "#E46A5B"], [180, 520, 1.5, "#E46A5B"]] as const).map(([x, y, d, f]) => G(x, y, "a-up", d, HEART(f), 0.9)).join("");
  const s9 = `<circle cx="60" cy="120" r="70" fill="#F8DCCB"/><circle cx="320" cy="530" r="100" fill="#F8DCCB"/>` + hearts
    + `<g class="a-rise"${D(0.1)}><path d="M110 280 L180 220 L250 280" fill="none" stroke="#1F5A3D" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><path d="M124 270 V360 H236 V270" fill="none" stroke="#1F5A3D" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></g>`
    + G(180, 316, "a-beat", 0, HEART("#E46A5B"), 2.2)
    + `<g class="a-pop"${D(0.9)}><svg x="150" y="160" width="60" height="60" viewBox="0 0 64 64" overflow="visible">${birdInner("budgie")}</svg></g>`
    + G(88, 150, "a-pop", 0.5, `<rect x="-58" y="-24" width="116" height="48" rx="20" fill="#fff"/><path d="M30 20 L40 34 L20 22Z" fill="#fff"/><circle class="a-twinkle" cx="-20" r="5" fill="#B9AE9B"/><circle class="a-twinkle" style="--d:.3s" cx="0" r="5" fill="#B9AE9B"/><circle class="a-twinkle" style="--d:.6s" cx="20" r="5" fill="#B9AE9B"/>`)
    + G(274, 176, "a-pop", 0.9, `<rect x="-46" y="-22" width="92" height="44" rx="20" fill="#1F5A3D"/><path d="M-30 18 L-40 32 L-18 20Z" fill="#1F5A3D"/><g transform="scale(.9)">${HEART("#FFFDF8")}</g>`)
    + [0, 1, 2, 3].map((i) => G(60 + i * 28, 420 - i * 22, "a-fade", 0.4 + i * 0.2, `<g transform="rotate(${30 + i * 4})">${PAW("#C9A27E")}</g>`)).join("")
    + G(180, 446, "a-pop", 1.3, LABEL(200, "#fff", S.support, "#1F5A3D"));

  const s10 = `<circle cx="320" cy="90" r="80" fill="#2A6B49"/><circle cx="40" cy="560" r="110" fill="#2A6B49"/>` + G(60, 96, "a-float", 0, PAW("#2E7650"), 1.8) + G(300, 420, "a-float", 0.5, PAW("#2E7650"), 1.5)
    + `<g transform="translate(60 128) scale(1.2)">${logo("#FFFDF8", "#F2B544")}</g>`
    + T(180, 346, copy.brand, { s: rtl ? 46 : 44, w: rtl ? 900 : 700, f: "#FFFDF8", c: "a-rise", d: 1.3 }) + T(180, 378, "opetlife.ir", { s: 16, w: 600, f: "#CFE3D4", c: "a-rise", d: 1.45, ltr: true })
    + G(180, 436, "a-pop", 1.7, `<rect x="-116" y="-26" width="232" height="52" rx="26" fill="#F2B544"/>${T(0, 7, S.start, { s: 16, w: 850, f: "#3A2A05" })}`);

  return [
    { bg: "#FDF4E6", svg: s1 }, { bg: "#E3F1E0", svg: s2 }, { bg: "#FFF1CC", svg: s3 }, { bg: "#1F5A3D", svg: s4, dark: true }, { bg: "#F9D9C2", svg: s5 },
    { bg: "#E7E2F6", svg: s6 }, { bg: "#D7ECF5", svg: s7 }, { bg: "#EAF4E8", svg: s8 }, { bg: "#FCEFE6", svg: s9 }, { bg: "#1F5A3D", svg: s10, dark: true },
  ];
}
