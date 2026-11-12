import type { RouteLocale } from "@/lib/i18n/config";
import type { ReelScene } from "./ReelSection";
import { D, makeKit } from "./scene-kit";
import { buildReelScenes } from "@/features/landing/opl/reel-scenes";
import { oplCopy } from "@/features/landing/opl/opl-copy";
import { familyCopy, type Family } from "./family-copy";

/** Which landing scenes each family reuses around its two own scenes (A, B). Numbers index the landing reel. */
const SEQUENCE: Record<Family, (number | "A" | "B")[]> = {
  care: [0, 1, "A", 2, "B"],
  services: [0, "A", 3, 5, "B"],
  shop: [0, "A", 4, "B", 2],
  travel: [0, 6, "A", "B"],
  safe: [0, 7, "A", "B"],
  together: [0, 8, "A", "B"],
  learn: [0, "A", "B", 1],
};

export function buildFamilyReel(family: Family, locale: RouteLocale): { scenes: ReelScene[]; kicks: string[]; subs: string[]; text: (typeof familyCopy)["fa"][Family] } {
  const c = oplCopy[locale];
  const f = familyCopy[locale][family];
  const L = f.labels;
  const k = makeKit(locale);
  const { rtl, X, m, T, G, PAW, HEART, LABEL, logo, digits } = k;
  const landing = buildReelScenes(c, locale);
  const bar = (x: number, y: number, w: number, fill: string, d?: number) => `<rect x="${rtl ? x : 360 - x - w}" y="${y}" width="${w}" height="8" rx="4" fill="${fill}"${d != null ? ` class="a-fade"${D(d)}` : ""}/>`;
  const check = (x: number, y: number, ok = true) => ok
    ? `<circle cx="${x}" cy="${y}" r="10" fill="#2E7650"/><path d="M${x - 5} ${y} l3.5 3.5 l6.5 -6.5" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<circle cx="${x}" cy="${y}" r="10" fill="#E9E3D6"/><path d="M${x - 4} ${y} h8" stroke="#8C8577" stroke-width="2.6" stroke-linecap="round"/>`;
  const pill = (w: number, fill: string, txt: string, tf: string) => LABEL(w, fill, txt, tf);
  const blob = (a: string) => `<circle cx="310" cy="110" r="70" fill="${a}"/><circle cx="40" cy="520" r="90" fill="${a}"/>`;

  const scenes: Record<Family, () => { A: ReelScene; B: ReelScene }> = {
    care: () => ({
      A: { bg: "#FDF4E6", svg: blob("#FBE7C6")
        + G(180, 104, "a-pop", 0.1, pill(116, "#F2B544", L.today!, "#3A2A05"))
        + ([[L.feed!, "feed"], [L.walk!, "walk"], [L.meds!, "meds"]] as const).map(([label, kind], i) => {
          const cy = 186 + i * 82;
          const icon = kind === "feed" ? `<path d="M-13 -2 H13 C12 7 6 11 0 11 C-6 11 -12 7 -13 -2Z" fill="#F2B544"/><rect x="-14" y="-6" width="28" height="5" rx="2.5" fill="#DD9A25"/>`
            : kind === "walk" ? PAW("#2E7650")
            : `<g transform="rotate(-35)"><rect x="-13" y="-6" width="26" height="12" rx="6" fill="#F7B3A9"/><path d="M0 -6 H-7 A6 6 0 0 0 -7 6 H0 Z" fill="#E46A5B"/></g>`;
          return `<g class="a-rise"${D(0.25 + i * 0.15)}><rect x="40" y="${cy - 35}" width="280" height="70" rx="20" fill="#fff"/><g transform="translate(${X(286)} ${cy})"><circle r="20" fill="${["#FFF1CC", "#E3F1E0", "#FCE3DE"][i]}"/>${icon}</g>${T(X(256), cy - 2, label, { a: "start", s: 15, w: 800 })}${bar(166, cy + 10, 90, "#EFE8DA")}${check(X(74), cy, false)}</g>`
            + G(X(74), cy, "a-pop", 1 + i * 0.45, check(0, 0));
        }).join("")
        + `<rect x="60" y="430" width="240" height="14" rx="7" fill="#F2EBDF"/><path class="a-draw" pathLength="1"${D(2.3)} d="M${X(67)} 437 H${X(293)}" stroke="#2E7650" stroke-width="14" stroke-linecap="round" fill="none"/>`
        + G(180, 490, "a-pop", 2.7, `<rect x="-70" y="-22" width="140" height="44" rx="22" fill="#1F5A3D"/>${check(m(44), 0, true)}${T(m(26), 6, L.done!, { a: "start", s: 14, w: 850, f: "#fff" })}`) },
      B: { bg: "#EEF7EC", svg: blob("#D9ECD5")
        + G(180, 104, "a-pop", 0.1, pill(150, "#1F5A3D", L.shared!, "#fff"))
        + ([[72, 196, "#F2B544"], [288, 196, "#E98A5B"], [72, 420, "#6A4D78"], [288, 420, "#7DB46C"]] as const).map(([x, y, col], i) => {
          const tx = x < 180 ? 112 : 248, ty = y < 300 ? 236 : 372;
          return `<path class="a-draw" pathLength="1"${D(0.8 + i * 0.18)} d="M${x} ${y} L${tx} ${ty}" stroke="#9CC9A5" stroke-width="4" stroke-linecap="round" fill="none"/>`
            + G(x, y, "a-pop", 0.5 + i * 0.18, `<circle r="30" fill="#fff"/><circle r="24" fill="${col}"/><circle cy="-6" r="8" fill="#FFF8EE"/><path d="M-13 15 C-11 4 11 4 13 15 Z" fill="#FFF8EE"/>`);
        }).join("")
        + G(180, 304, "a-rise", 0.2, `<rect x="-74" y="-86" width="148" height="172" rx="26" fill="#fff"/><g transform="translate(0 -34)"><circle r="30" fill="#E3F1E0"/><g transform="scale(2)">${PAW("#2E7650")}</g></g><rect x="-48" y="12" width="96" height="10" rx="5" fill="#1E241F"/><rect x="-36" y="32" width="72" height="8" rx="4" fill="#D6CFC2"/><g transform="translate(0 62)">${HEART("#E46A5B")}</g>`)
        + G(X(72), 196, "a-pop", 1.8, `<g transform="translate(${m(-22)} 22)">${check(0, 0)}</g>`)
        + G(X(288), 420, "a-pop", 2.1, `<g transform="translate(${m(22)} 22)">${check(0, 0)}</g>`)
        + G(180, 520, "a-pop", 2.4, pill(130, "#fff", L.family!, "#1F5A3D")) },
    }),
    services: () => ({
      A: { bg: "#EEF7EC", svg: blob("#D9ECD5")
        + `<g class="a-rise"${D(0.05)}><rect x="40" y="118" width="280" height="50" rx="25" fill="#fff"/><circle cx="${X(292)}" cy="141" r="9" fill="none" stroke="#1F5A3D" stroke-width="3"/><path d="M${X(292) + m(-6)} 148 l${m(-6)} 6" stroke="#1F5A3D" stroke-width="3" stroke-linecap="round"/>${T(X(270), 149, L.search!, { a: "start", s: 13, w: 600, f: "#6B726A" })}</g>`
        + [[L.vet!, 94, "#1F5A3D", "#fff"], [L.grooming!, 184, "#fff", "#1F5A3D"], [L.boarding!, 274, "#fff", "#1F5A3D"]].map(([t, x, bgc, tc], i) => G(X(x as number), 198, "a-pop", 0.3 + i * 0.1, pill(84, bgc as string, t as string, tc as string))).join("")
        + [250, 322, 394].map((y, i) => `<g class="a-rise"${D(0.7 + i * 0.15)}><rect x="40" y="${y}" width="280" height="60" rx="18" fill="#fff"/><g transform="translate(${X(286)} ${y + 30})"><circle r="19" fill="#E3F1E0"/>${PAW("#2E7650")}</g>${bar(140, y + 20, 116, "#1E241F")}${bar(176, y + 36, 80, "#D6CFC2")}${i === 0 ? `<g transform="translate(${X(84)} ${y + 30})"><rect x="-34" y="-12" width="68" height="24" rx="12" fill="#1F5A3D"/>${T(0, 5, L.verified!, { s: 11, w: 800, f: "#fff" })}</g>` : ""}</g>`).join("") },
      B: { bg: "#FFF1CC", svg: blob("#FFE6A6")
        + `<g class="a-rise"${D(0.05)}><rect x="58" y="120" width="244" height="230" rx="26" fill="#fff"/><rect x="58" y="120" width="244" height="52" rx="26" fill="#1F5A3D"/><rect x="58" y="150" width="244" height="22" fill="#1F5A3D"/>${T(180, 153, L.month!, { s: 16, w: 850, f: "#fff" })}</g>`
        + Array.from({ length: 21 }, (_, i) => { const r = Math.floor(i / 7), col = i % 7, cx = 84 + col * 32, cy = 204 + r * 40; return i === 10 ? G(cx, cy, "a-pop", 0.8, `<circle r="15" fill="#F2B544"/>${T(0, 5, digits(String(i + 8)), { s: 12, w: 800, f: "#3A2A05", ltr: true })}`) : `<circle cx="${cx}" cy="${cy}" r="12" fill="#F4EFE3"/>`; }).join("")
        + ["10:00", "11:30", "17:00"].map((t, i) => G([100, 180, 260][i]!, 384, i === 1 ? "a-pop" : "a-rise", i === 1 ? 1.3 : 1.1, `<rect x="-36" y="-18" width="72" height="36" rx="18" fill="${i === 1 ? "#1F5A3D" : "#fff"}"/>${T(0, 6, digits(t), { s: 14, w: 800, f: i === 1 ? "#fff" : "#1F5A3D", ltr: true })}`)).join("")
        + G(180, 446, "a-pop", 1.7, `<rect x="-90" y="-25" width="180" height="50" rx="25" fill="#F2B544"/>${check(m(62), 0)}${T(m(40), 6, L.confirm!, { a: "start", s: 16, w: 850, f: "#3A2A05" })}`) },
    }),
    shop: () => ({
      A: { bg: "#FDF4E6", svg: blob("#FBE7C6")
        + ([[L.food!, "bag"], [L.bowl!, "bowl"], [L.toy!, "toy"], [L.care!, "care"]] as const).map(([label, kind], i) => {
          const cx = i % 2 ? 248 : 112, cy = i < 2 ? 200 : 336;
          const icon = kind === "bag" ? `<rect x="-20" y="-30" width="40" height="46" rx="8" fill="#C98E4E"/><rect x="-14" y="-16" width="28" height="14" rx="4" fill="#FFF8EE"/>`
            : kind === "bowl" ? `<path d="M-26 -8 H26 C24 8 13 16 0 16 C-13 16 -24 8 -26 -8Z" fill="#F2B544"/><rect x="-28" y="-12" width="56" height="7" rx="3.5" fill="#DD9A25"/>`
            : kind === "toy" ? `<g fill="#7DB46C"><circle cx="-16" cy="-12" r="7"/><circle cx="-16" cy="-2" r="7"/><circle cx="16" cy="-12" r="7"/><circle cx="16" cy="-2" r="7"/><rect x="-16" y="-12" width="32" height="10"/></g>`
            : `<rect x="-11" y="-30" width="22" height="44" rx="8" fill="#6A4D78"/><rect x="-6" y="-38" width="12" height="10" rx="3" fill="#B9A6C6"/>`;
          return G(cx, cy, "a-pop", 0.2 + i * 0.15, `<rect x="-62" y="-58" width="124" height="116" rx="22" fill="#fff"/><g transform="translate(0 -6)">${icon}</g>${T(0, 40, label, { s: 13, w: 800 })}<g class="a-pop"${D(0.9 + i * 0.12)}><circle cx="${m(-44)}" cy="-40" r="12" fill="#1F5A3D"/><path d="M${m(-44) - 5} -40 h10 M${m(-44)} -45 v10" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/></g>`);
        }).join("")
        + G(X(290), 104, "a-pop", 0.1, `<rect x="-58" y="-20" width="116" height="40" rx="20" fill="#1F5A3D"/><path d="M${m(34)} -8 h-8 l-6 14 h-18" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>${T(m(4), 5, L.cart!, { a: "start", s: 13, w: 800, f: "#fff" })}<g class="a-pop"${D(1.5)}><circle cx="${m(-52)}" cy="-16" r="12" fill="#E46A5B"/>${T(m(-52), -12, digits("4"), { s: 12, w: 900, f: "#fff", ltr: true })}</g>`) },
      B: { bg: "#D7ECF5", svg: blob("#C2E0EC")
        + `<path data-road="1" class="a-draw" pathLength="1"${D(0.05)} d="M30 450 C120 440 200 400 268 350" fill="none" stroke="#9CC6D8" stroke-width="28" stroke-linecap="round"/>`
        + G(296, 316, "a-rise", 0.3, `<path d="M-40 -6 L0 -40 L40 -6 Z" fill="#1F5A3D" stroke="#1F5A3D" stroke-width="8" stroke-linejoin="round"/><rect x="-32" y="-10" width="64" height="54" rx="8" fill="#FFF8EE"/><rect x="-9" y="14" width="18" height="30" rx="9" fill="#F2B544"/>`)
        + `<g data-car="1" transform="translate(120 420)"><rect x="-30" y="-24" width="40" height="30" rx="6" fill="#E46A5B"/><rect x="10" y="-16" width="22" height="22" rx="6" fill="#E46A5B"/><rect x="14" y="-12" width="12" height="9" rx="3" fill="#fff"/><rect x="-22" y="-16" width="20" height="14" rx="3" fill="#F2B544"/><circle cx="-16" cy="8" r="7" fill="#1E241F"/><circle cx="20" cy="8" r="7" fill="#1E241F"/></g>`
        + G(180, 128, "a-pop", 0.3, pill(130, "#F2B544", L.onTheWay!, "#3A2A05"))
        + G(180, 176, "a-pop", 2.2, pill(130, "#1F5A3D", L.delivered!, "#fff"))
        + G(296, 372, "a-drop", 2.3, `<rect x="-14" y="-12" width="28" height="24" rx="4" fill="#C98E4E"/><path d="M-14 -4 h28 M0 -12 v24" stroke="#A3733F" stroke-width="2"/>`) },
    }),
    travel: () => ({
      A: { bg: "#EAF4E8", svg: blob("#D9ECD5")
        + ([[L.stayA!, "#7DB46C", [true, true, true]], [L.stayB!, "#9CC6D8", [true, false, true]]] as const).map(([name, sky, rows], i) => {
          const x = i ? 186 : 34;
          const art = i ? `<path d="M${x + 10} 230 q20 -12 40 0 t40 0 t40 0" stroke="#fff" stroke-width="4" fill="none"/>` : `<path d="M${x + 14} 240 l34 -40 l22 24 l18 -16 l38 32 Z" fill="#fff" opacity=".9"/>`;
          return `<g class="a-rise"${D(0.1 + i * 0.25)}><rect x="${x}" y="130" width="140" height="290" rx="22" fill="#fff"/><rect x="${x}" y="130" width="140" height="120" rx="22" fill="${sky}"/><rect x="${x}" y="226" width="140" height="24" fill="${sky}"/>${art}${T(x + 70, 278, name, { s: 13, w: 850 })}`
            + [L.dogs!, L.cats!, L.yard!].map((r, j) => `${T(rtl ? x + 124 : x + 16, 314 + j * 34, r, { a: "start", s: 11, w: 700, f: "#4F574F" })}<g class="a-pop"${D(0.8 + i * 0.25 + j * 0.15)}>${check(rtl ? x + 18 : x + 122, 310 + j * 34, rows[j])}</g>`).join("") + "</g>";
        }).join("") },
      B: { bg: "#FDF4E6", svg: blob("#FBE7C6")
        + `<g class="a-rise"${D(0.05)}><rect x="70" y="118" width="220" height="310" rx="20" fill="#1F5A3D"/>${T(180, 158, L.passport!, { s: 16, w: 850, f: "#FFFDF8" })}<rect x="88" y="178" width="184" height="232" rx="14" fill="#FFFDF8"/></g>`
        + G(180, 236, "a-pop", 0.4, `<circle r="38" fill="#E3F1E0"/><g transform="scale(2.2)">${PAW("#2E7650")}</g>`)
        + [L.vaccine!, L.microchip!].map((r, j) => `<g class="a-rise"${D(0.7 + j * 0.2)}>${bar(110, 296 + j * 40, 90, "#D6CFC2")}${T(X(250), 304 + j * 40, r, { a: "start", s: 12, w: 800 })}${check(X(116), 300 + j * 40)}</g>`).join("")
        + G(X(250), 388, "a-pop", 1.4, `<circle r="28" fill="none" stroke="#E46A5B" stroke-width="3" stroke-dasharray="4 3"/><g transform="rotate(-18) scale(1.6)">${PAW("#E46A5B")}</g>`) },
    }),
    safe: () => ({
      A: { bg: "#EEF7EC", svg: blob("#D9ECD5")
        + ([[L.basic!, false], [L.plus!, true], [L.accident!, false]] as const).map(([name, on], i) => {
          const x = [72, 180, 288][i]!, fill = on ? "#1F5A3D" : "#fff", tf = on ? "#fff" : "#1E241F";
          return G(x, 280, "a-pop", 0.2 + i * 0.2, `<rect x="-50" y="-120" width="100" height="240" rx="22" fill="${fill}"/><path d="M0 -92 C10 -85 20 -83 26 -83 V-62 C26 -42 13 -32 0 -26 C-13 -32 -26 -42 -26 -62 V-83 C-20 -83 -10 -85 0 -92Z" fill="${on ? "#F2B544" : "#E3F1E0"}"/>${T(0, -2, name, { s: 13, w: 850, f: tf })}<rect x="-32" y="24" width="64" height="8" rx="4" fill="${on ? "#2E7650" : "#EFE8DA"}"/><rect x="-32" y="44" width="48" height="8" rx="4" fill="${on ? "#2E7650" : "#EFE8DA"}"/><rect x="-32" y="64" width="56" height="8" rx="4" fill="${on ? "#2E7650" : "#EFE8DA"}"/>${on ? `<g class="a-pop"${D(1.2)}>${check(0, 100)}</g>` : ""}`, on ? 1.06 : 1);
        }).join("") },
      B: { bg: "#FFF0E4", svg: blob("#FBDCC6")
        + `<g class="a-rise"${D(0.05)}><rect x="84" y="112" width="192" height="276" rx="14" fill="#fff"/><rect x="84" y="112" width="192" height="52" rx="14" fill="#E46A5B"/><rect x="84" y="148" width="192" height="16" fill="#E46A5B"/>${T(180, 146, L.lost!, { s: 20, w: 900, f: "#fff" })}<circle cx="180" cy="222" r="40" fill="#FBE7C6"/><g transform="translate(180 222) scale(2.4)">${PAW("#C98E4E")}</g>${bar(110, 286, 140, "#1E241F")}${bar(110, 306, 100, "#D6CFC2")}${bar(110, 326, 120, "#D6CFC2")}</g>`
        + [0, 1, 2].map((i) => G([300, 318, 290][i]!, [180, 250, 320][i]!, "a-pop", 0.9 + i * 0.2, `<circle r="16" fill="${["#1F5A3D", "#F2B544", "#2D58A6"][i]}"/><path d="M-6 2 l6 -6 l6 6" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`)).join("")
        + G(180, 430, "a-pop", 1.6, pill(150, "#1F5A3D", L.share!, "#fff")) + G(X(250), 92, "a-pop", 2, pill(130, "#F2B544", L.seen!, "#3A2A05")) },
    }),
    together: () => ({
      A: { bg: "#FCEFE6", svg: blob("#F8DCCB")
        + ([[L.food!, 0.72, "#F2B544"], [L.medicine!, 0.45, "#E46A5B"], [L.shelter!, 0.86, "#2E7650"]] as const).map(([name, p, col], i) => {
          const y = 140 + i * 96, x0 = rtl ? 252 : 108, x1 = rtl ? 252 - 180 * p : 108 + 180 * p;
          return `<g class="a-rise"${D(0.1 + i * 0.15)}><rect x="40" y="${y}" width="280" height="78" rx="20" fill="#fff"/><circle cx="${X(292)}" cy="${y + 39}" r="18" fill="${col}"/>${T(X(262), y + 32, name, { a: "start", s: 14, w: 850 })}<rect x="${rtl ? 72 : 108}" y="${y + 50}" width="180" height="10" rx="5" fill="#F2EBDF"/><path class="a-draw" pathLength="1"${D(0.7 + i * 0.2)} d="M${x0} ${y + 55} H${x1}" stroke="${col}" stroke-width="10" stroke-linecap="round"/></g>`;
        }).join("")
        + G(180, 446, "a-pop", 1.6, `<g transform="scale(1.6)">${HEART("#E46A5B")}</g>`) },
      B: { bg: "#FDF4E6", svg: blob("#FBE7C6")
        + [[-10, "#7DB46C", 130], [8, "#9CC6D8", 150], [-4, "#F2B544", 170]].map(([rot, col, y], i) => `<g transform="translate(180 ${(y as number) + 80}) rotate(${rot})"><g class="a-drop"${D(0.2 + i * 0.35)}><rect x="-86" y="-96" width="172" height="196" rx="8" fill="#fff"/><rect x="-72" y="-82" width="144" height="138" rx="4" fill="${col}"/><g transform="translate(0 -14) scale(2.6)">${i === 2 ? HEART("#fff") : PAW("#fff")}</g></g></g>`).join("")
        + G(180, 450, "a-pop", 1.5, pill(130, "#1F5A3D", L.album!, "#fff")) },
    }),
    learn: () => ({
      A: { bg: "#EEF7EC", svg: blob("#D9ECD5")
        + [0, 1, 2].map((i) => `<g class="a-rise"${D(0.1 + i * 0.2)}><g transform="translate(${180 + (i - 1) * 18} ${170 + i * 64})"><rect x="-120" y="-50" width="240" height="150" rx="20" fill="#fff"/><rect x="-120" y="-50" width="240" height="56" rx="20" fill="${["#9CC6D8", "#F2B544", "#7DB46C"][i]}"/><rect x="-120" y="-10" width="240" height="16" fill="${["#9CC6D8", "#F2B544", "#7DB46C"][i]}"/><rect x="${rtl ? -10 : -100}" y="22" width="110" height="8" rx="4" fill="#1E241F"/><rect x="${rtl ? 30 : -100}" y="40" width="70" height="8" rx="4" fill="#D6CFC2"/></g></g>`).join("")
        + G(X(100), 368, "a-pop", 1, pill(96, "#1F5A3D", L.guide!, "#fff")) + G(X(220), 368, "a-pop", 1.15, pill(96, "#fff", L.journal!, "#1F5A3D"))
        + G(X(290), 120, "a-pop", 1.4, `<path d="M-12 -18 h24 v36 l-12 -9 l-12 9 Z" fill="#E46A5B"/>`) },
      B: { bg: "#E7E2F6", svg: blob("#D9D2F0")
        + G(180, 118, "a-pop", 0.1, pill(170, "#fff", L.faq!, "#6A4D78"))
        + G(X(220), 210, "a-pop", 0.4, `<rect x="-100" y="-34" width="200" height="68" rx="22" fill="#1F5A3D"/><circle cx="${m(70)}" r="14" fill="#F2B544"/>${T(m(70), 6, "?", { s: 16, w: 900, f: "#3A2A05", ltr: true })}${T(m(48), 6, L.ticket!, { a: "start", s: 13, w: 800, f: "#fff" })}`)
        + G(X(140), 300, "a-pop", 0.9, `<rect x="-100" y="-30" width="200" height="60" rx="22" fill="#fff"/><circle class="a-twinkle" cx="-24" r="6" fill="#B9AE9B"/><circle class="a-twinkle" style="--d:.3s" cx="0" r="6" fill="#B9AE9B"/><circle class="a-twinkle" style="--d:.6s" cx="24" r="6" fill="#B9AE9B"/>`)
        + G(180, 404, "a-pop", 1.8, `<rect x="-96" y="-25" width="192" height="50" rx="25" fill="#fff"/>${check(m(68), 0)}${T(m(46), 6, L.answered!, { a: "start", s: 15, w: 850, f: "#1F5A3D" })}`) },
    }),
  };

  const outro: ReelScene = { bg: "#1F5A3D", dark: true, svg: `<circle cx="320" cy="90" r="80" fill="#2A6B49"/><circle cx="40" cy="560" r="110" fill="#2A6B49"/>`
    + `<g transform="translate(60 128) scale(1.2)">${logo("#FFFDF8", "#F2B544")}</g>`
    + T(180, 346, c.brand, { s: rtl ? 46 : 44, w: rtl ? 900 : 700, f: "#FFFDF8", c: "a-rise", d: 1.3 }) + T(180, 378, "opetlife.ir", { s: 16, w: 600, f: "#CFE3D4", c: "a-rise", d: 1.45, ltr: true })
    + G(180, 436, "a-pop", 1.7, `<rect x="-116" y="-26" width="232" height="52" rx="26" fill="#F2B544"/>${T(0, 7, f.cta, { s: 16, w: 850, f: "#3A2A05" })}`) };

  const own = scenes[family](); // only the requested family is drawn: other families read labels this one lacks
  const out: ReelScene[] = [], kicks: string[] = [], subs: string[] = [];
  for (const step of SEQUENCE[family]) {
    if (step === "A" || step === "B") { out.push(own[step]); kicks.push(f[step === "A" ? "a" : "b"].k); subs.push(f[step === "A" ? "a" : "b"].s); }
    else { out.push(landing[step]!); kicks.push(c.scenes.k[step]!); subs.push(c.scenes.s[step]!); }
  }
  out.push(outro); kicks.push(""); subs.push(c.scenes.s[9]!);
  return { scenes: out, kicks, subs, text: f };
}
