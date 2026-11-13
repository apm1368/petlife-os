// Original flat vector art for opetlife article covers, infographics and motion graphics.
// Every shape is drawn here; nothing is traced or taken from elsewhere.
// Characters are drawn in local coordinates with the origin at the bottom centre (y grows down, so the
// figure lives at negative y). Named groups (#head, #tail, #eyes, #paw) are what the animator moves.

const C = {
  forest: "#1F5A3D", honey: "#F2B544", leaf: "#7DB46C", charcoal: "#1E241F", paper: "#FFFBF5",
  ink: "#2A2420", pink: "#F4A6B8", pinkDeep: "#E57F98", blush: "#F7B8B0", white: "#FFFFFF",
  sky: "#BFE3F5", skyDeep: "#7FC1E3", red: "#E5675A", green: "#5BAE6A", cream: "#FFF4DD",
};

const DOG = { fur: "#E9B661", furDark: "#C98B3A", light: "#F8DFA6", ear: "#C47F33" };
const PUP = { fur: "#F0C987", furDark: "#D49B4E", light: "#FBE9C2", ear: "#CF9246" };
const CAT = { fur: "#F2A65E", furDark: "#D47F35", light: "#FFF1DC", eye: "#9DCB55" };
const KIT = { fur: "#A9ADBA", furDark: "#848896", light: "#EEF0F5", eye: "#7FB8E0" };

function eyes(expr, x, y, gap, eyeColor) {
  const l = -gap, r = gap;
  if (expr === "sleepy") {
    return `<g id="eyes"><path d="M${x + l - 13} ${y} q13 9 26 0" stroke="${C.ink}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M${x + r - 13} ${y} q13 9 26 0" stroke="${C.ink}" stroke-width="5" fill="none" stroke-linecap="round"/></g>`;
  }
  const iris = eyeColor
    ? (cx) => `<ellipse cx="${cx}" cy="${y}" rx="15" ry="17" fill="${eyeColor}"/><ellipse cx="${cx}" cy="${y + 1}" rx="5" ry="13" fill="${C.ink}"/>`
    : (cx) => `<ellipse cx="${cx}" cy="${y}" rx="12" ry="14" fill="${C.ink}"/>`;
  const glint = (cx) => `<circle cx="${cx + 4}" cy="${y - 5}" r="4" fill="#fff"/><circle cx="${cx - 4}" cy="${y + 5}" r="2" fill="#fff" opacity=".8"/>`;
  const brows = expr === "worried"
    ? `<path d="M${x + l - 16} ${y - 20} q14 -12 26 -4" stroke="${C.ink}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".55"/><path d="M${x + r + 16} ${y - 20} q-14 -12 -26 -4" stroke="${C.ink}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".55"/>`
    : expr === "alert"
      ? `<path d="M${x + l - 14} ${y - 26} q14 -12 28 0" stroke="${C.ink}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".5"/><path d="M${x + r - 14} ${y - 26} q14 -12 28 0" stroke="${C.ink}" stroke-width="4" fill="none" stroke-linecap="round" opacity=".5"/>`
      : "";
  return `<g id="eyes">${iris(x + l)}${iris(x + r)}${glint(x + l)}${glint(x + r)}</g>${brows}`;
}

/** Golden long-haired dog sitting, fluffy drooping ears, pink lace collar. opts: {puppy, expr, tongue} */
function dog(opts = {}) {
  const P = opts.puppy ? PUP : DOG;
  const expr = opts.expr || "happy";
  const hs = opts.puppy ? 1.12 : 1; // puppies have bigger heads
  const bodyScale = opts.puppy ? 0.82 : 1;
  const lace = Array.from({ length: 9 }, (_, i) => {
    const t = i / 8; const x = -70 + 140 * t; const y = -238 + 22 * Math.sin(Math.PI * t) * 1.0;
    return `<circle cx="${x.toFixed(1)}" cy="${(y + 8).toFixed(1)}" r="7" fill="${C.white}" opacity=".9"/>`;
  }).join("");
  const mouth = expr === "worried"
    ? `<path d="M-16 -286 q16 -10 32 0" stroke="${C.ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`
    : `<path d="M0 -306 v10 M-22 -292 q11 10 22 -4 q11 14 22 4" stroke="${C.ink}" stroke-width="4" fill="none" stroke-linecap="round"/>${opts.tongue !== false && expr !== "alert" ? `<path d="M-10 -289 q10 26 20 0 z" fill="${C.pinkDeep}"/>` : ""}`;
  const head = `<g id="head" style="transform-box:fill-box;transform-origin:50% 85%">
    <path d="M-70 -405 C-112 -416 -152 -380 -160 -330 C-166 -290 -161 -262 -149 -242 C-141 -230 -129 -238 -124 -229 C-116 -219 -102 -227 -100 -240 C-92 -272 -84 -322 -62 -372 Z" fill="${P.ear}"/>
    <path d="M70 -405 C112 -416 152 -380 160 -330 C166 -290 161 -262 149 -242 C141 -230 129 -238 124 -229 C116 -219 102 -227 100 -240 C92 -272 84 -322 62 -372 Z" fill="${P.ear}"/>
    <ellipse cx="0" cy="-338" rx="102" ry="94" fill="${P.fur}"/>
    <path d="M-30 -428 q12 -22 30 -6 q14 -20 28 4 q-20 4 -30 14 q-12 -12 -28 -12z" fill="${P.fur}"/>
    <ellipse cx="0" cy="-300" rx="58" ry="42" fill="${P.light}"/>
    <ellipse cx="-62" cy="-312" rx="16" ry="10" fill="${C.blush}" opacity=".55"/>
    <ellipse cx="62" cy="-312" rx="16" ry="10" fill="${C.blush}" opacity=".55"/>
    ${eyes(expr, 0, -350, 38)}
    <path d="M-19 -330 Q0 -342 19 -330 Q15 -311 0 -307 Q-15 -311 -19 -330 Z" fill="${C.ink}"/>
    <ellipse cx="-6" cy="-331" rx="6" ry="3" fill="#fff" opacity=".6"/>
    ${mouth}
    <path d="M-82 -392 C-100 -380 -112 -350 -114 -318 C-104 -334 -96 -360 -78 -382Z" fill="${P.furDark}" opacity=".35"/>
    <path d="M82 -392 C100 -380 112 -350 114 -318 C104 -334 96 -360 78 -382Z" fill="${P.furDark}" opacity=".35"/>
  </g>`;
  const body = `<g transform="scale(${bodyScale}) ">
    <path id="tail" style="transform-box:fill-box;transform-origin:0% 100%" d="M108 -62 C196 -78 236 -160 196 -236 C192 -214 180 -196 170 -190 C176 -160 160 -120 120 -104 Z" fill="${P.furDark}"/>
    <path d="M196 -236 c-6 18 -16 30 -26 36 c14 -2 26 -12 30 -24z" fill="${P.fur}" opacity=".7"/>
    <ellipse cx="-96" cy="-56" rx="76" ry="60" fill="${P.fur}"/>
    <ellipse cx="96" cy="-56" rx="76" ry="60" fill="${P.fur}"/>
    <path d="M-112 -22 C-132 -150 -92 -252 0 -262 C92 -252 132 -150 112 -22 Z" fill="${P.fur}"/>
    <path d="M-62 -232 C-84 -172 -54 -110 0 -92 C54 -110 84 -172 62 -232 C34 -206 -34 -206 -62 -232 Z" fill="${P.light}"/>
    <path d="M-40 -110 q8 12 16 0 q8 12 16 0 q8 12 16 0 q8 12 16 0" stroke="${P.light}" stroke-width="10" fill="none" stroke-linecap="round"/>
    <rect x="-64" y="-152" width="48" height="146" rx="24" fill="${P.fur}"/>
    <rect x="16" y="-152" width="48" height="146" rx="24" fill="${P.fur}"/>
    <ellipse cx="-40" cy="-9" rx="36" ry="17" fill="${P.light}"/>
    <ellipse cx="40" cy="-9" rx="36" ry="17" fill="${P.light}"/>
    <path d="M-50 -14 v-8 M-38 -12 v-10 M-26 -14 v-8 M30 -14 v-8 M42 -12 v-10 M54 -14 v-8" stroke="${P.furDark}" stroke-width="3" stroke-linecap="round" opacity=".6"/>
    <path d="M-80 -264 Q0 -228 80 -264 L76 -242 Q0 -206 -76 -242 Z" fill="${C.pink}"/>
    ${lace}
    <circle cx="0" cy="-214" r="14" fill="${C.honey}" stroke="#D99A22" stroke-width="3"/>
  </g>`;
  return `<g class="char dog">${body}<g transform="translate(0 ${(1 - bodyScale) * 250}) scale(${hs})" style="transform-origin:0 -260px">${head}</g></g>`;
}

/** Sitting cat (orange tabby by default; kitten = small grey). opts: {kitten, expr, cone, paw} */
function cat(opts = {}) {
  const P = opts.kitten ? KIT : CAT;
  const expr = opts.expr || "happy";
  const hs = opts.kitten ? 1.15 : 1;
  const bs = opts.kitten ? 0.8 : 1;
  const stripes = `<path d="M-70 -170 q20 6 30 -4 M-80 -120 q22 8 34 -4 M70 -170 q-20 6 -30 -4 M80 -120 q-22 8 -34 -4" stroke="${P.furDark}" stroke-width="9" fill="none" stroke-linecap="round" opacity=".7"/>`;
  const mouth = expr === "alert"
    ? `<ellipse cx="0" cy="-280" rx="9" ry="11" fill="${C.ink}"/><path d="M-5 -276 q5 8 10 0" fill="${C.pinkDeep}"/>`
    : expr === "worried"
      ? `<path d="M-12 -278 q12 -8 24 0" stroke="${C.ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`
      : `<path d="M-14 -284 q7 8 14 -2 q7 10 14 2" stroke="${C.ink}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
  const earTilt = expr === "alert" ? 12 : 0;
  const head = `<g id="head" style="transform-box:fill-box;transform-origin:50% 90%">
    <g transform="rotate(${-earTilt} -60 -370)"><path d="M-88 -322 L-100 -424 L-28 -372 Z" fill="${P.fur}"/><path d="M-80 -340 L-88 -402 L-46 -370 Z" fill="${C.pink}"/></g>
    <g transform="rotate(${earTilt} 60 -370)"><path d="M88 -322 L100 -424 L28 -372 Z" fill="${P.fur}"/><path d="M80 -340 L88 -402 L46 -370 Z" fill="${C.pink}"/></g>
    <ellipse cx="0" cy="-318" rx="98" ry="82" fill="${P.fur}"/>
    <path d="M-98 -300 l-18 8 l18 4 l-14 12 l20 -2" fill="${P.fur}"/><path d="M98 -300 l18 8 l-18 4 l14 12 l-20 -2" fill="${P.fur}"/>
    <path d="M-12 -396 v22 M0 -400 v26 M12 -396 v22" stroke="${P.furDark}" stroke-width="7" stroke-linecap="round" opacity=".75"/>
    <ellipse cx="-17" cy="-288" rx="22" ry="16" fill="${P.light}"/><ellipse cx="17" cy="-288" rx="22" ry="16" fill="${P.light}"/>
    <ellipse cx="0" cy="-272" rx="16" ry="10" fill="${P.light}"/>
    <ellipse cx="-58" cy="-298" rx="15" ry="9" fill="${C.blush}" opacity=".6"/><ellipse cx="58" cy="-298" rx="15" ry="9" fill="${C.blush}" opacity=".6"/>
    ${eyes(expr, 0, -328, 38, P.eye)}
    <path d="M-10 -304 h20 l-10 11 z" fill="${C.pinkDeep}" stroke-linejoin="round"/>
    ${mouth}
    <path d="M-38 -292 l-62 -10 M-38 -284 l-60 4 M38 -292 l62 -10 M38 -284 l60 4" stroke="${C.ink}" stroke-width="2.5" stroke-linecap="round" opacity=".55"/>
  </g>`;
  const cone = opts.cone ? `<g class="cone"><ellipse cx="0" cy="-322" rx="152" ry="132" fill="${C.sky}" opacity=".45"/><ellipse cx="0" cy="-322" rx="152" ry="132" fill="none" stroke="${C.skyDeep}" stroke-width="7"/><ellipse cx="0" cy="-322" rx="118" ry="102" fill="none" stroke="#fff" stroke-width="3" opacity=".7"/></g>` : "";
  const pawUp = opts.paw
    ? `<g id="paw" style="transform-box:fill-box;transform-origin:0% 100%"><path d="M40 -150 L106 -252" stroke="${P.fur}" stroke-width="38" stroke-linecap="round" fill="none"/><circle cx="110" cy="-258" r="23" fill="${P.light}"/><path d="M100 -270 v8 M110 -273 v9 M120 -270 v8" stroke="${P.furDark}" stroke-width="3" stroke-linecap="round" opacity=".7"/></g><rect x="16" y="-60" width="38" height="54" rx="19" fill="${P.fur}"/><ellipse cx="35" cy="-10" rx="27" ry="14" fill="${P.light}"/>`
    : `<rect x="16" y="-124" width="38" height="118" rx="19" fill="${P.fur}"/><ellipse cx="35" cy="-10" rx="27" ry="14" fill="${P.light}"/>`;
  const body = `<g transform="scale(${bs})">
    <path id="tail" style="transform-box:fill-box;transform-origin:0% 100%" d="M78 -22 C176 -18 206 -96 166 -150 C152 -168 136 -160 146 -142 C170 -100 146 -50 70 -48 Z" fill="${P.furDark}"/>
    <path d="M-96 -12 C-118 -126 -82 -236 0 -246 C82 -236 118 -126 96 -12 Z" fill="${P.fur}"/>
    ${stripes}
    <path d="M-42 -232 C-58 -170 -32 -118 0 -108 C32 -118 58 -170 42 -232 C20 -214 -20 -214 -42 -232 Z" fill="${P.light}"/>
    <rect x="-54" y="-124" width="38" height="118" rx="19" fill="${P.fur}"/>
    <ellipse cx="-35" cy="-10" rx="27" ry="14" fill="${P.light}"/>
    ${pawUp}
  </g>`;
  return `<g class="char cat">${body}${cone}<g transform="translate(0 ${(1 - bs) * 240}) scale(${hs})" style="transform-origin:0 -250px">${head}</g></g>`;
}

// ---------- props (local origin = centre) ----------
const S = (inner, w = 4) => `stroke="${C.charcoal}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round" ${inner}`;
const props = {
  heart: () => `<path d="M0 30 C-46 0 -52 -36 -26 -46 C-12 -51 -2 -42 0 -32 C2 -42 12 -51 26 -46 C52 -36 46 0 0 30Z" fill="${C.pink}"/><path d="M-26 -30 q-10 6 -8 18" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" opacity=".7"/>`,
  shield: () => `<path d="M0 -70 L56 -48 C58 6 36 46 0 66 C-36 46 -58 6 -56 -48 Z" fill="${C.leaf}"/><path d="M0 -70 L56 -48 C58 6 36 46 0 66 Z" fill="${C.green}" opacity=".5"/><path d="M-22 -2 l16 18 l30 -34" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  check: () => `<circle r="34" fill="${C.green}"/><path d="M-15 0 l10 12 l22 -24" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  no: () => `<circle r="34" fill="${C.red}"/><path d="M-13 -13 l26 26 M13 -13 l-26 26" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`,
  calendar: () => `<rect x="-70" y="-62" width="140" height="124" rx="16" fill="#fff" ${S("")}/><rect x="-70" y="-62" width="140" height="34" rx="16" fill="${C.red}"/><rect x="-70" y="-40" width="140" height="12" fill="${C.red}"/><path d="M-40 -74 v22 M40 -74 v22" ${S('fill="none"', 7)}/>${[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => `<rect x="${-54 + c * 30}" y="${-14 + r * 24}" width="18" height="14" rx="4" fill="${(r * 4 + c) % 3 === 0 ? C.leaf : "#EAE3D6"}"/>`).join("")).join("")}`,
  clock: () => `<circle r="56" fill="#fff" ${S("")}/><circle r="44" fill="${C.cream}"/><path d="M0 0 v-30 M0 0 l22 12" ${S('fill="none"', 7)}/><circle r="6" fill="${C.charcoal}"/>`,
  vial: () => `<g transform="rotate(20)"><rect x="-22" y="-56" width="44" height="18" rx="5" fill="${C.skyDeep}"/><rect x="-26" y="-40" width="52" height="96" rx="14" fill="#fff" ${S("")}/><rect x="-22" y="0" width="44" height="52" rx="10" fill="${C.sky}"/><path d="M-12 -24 v22" stroke="#fff" stroke-width="6" stroke-linecap="round"/><path d="M-10 18 h20 M0 8 v20" stroke="${C.skyDeep}" stroke-width="6" stroke-linecap="round"/></g>`,
  syringe: () => `<g transform="rotate(-35)"><rect x="-16" y="-62" width="32" height="92" rx="8" fill="#fff" ${S("")}/><rect x="-12" y="-20" width="24" height="46" rx="5" fill="${C.sky}"/><rect x="-26" y="-70" width="52" height="10" rx="5" fill="${C.skyDeep}"/><rect x="-5" y="-96" width="10" height="28" rx="4" fill="${C.skyDeep}"/><path d="M0 30 v26" stroke="${C.charcoal}" stroke-width="4" stroke-linecap="round"/><path d="M-16 -40 h10 M-16 -24 h10 M-16 -8 h10" stroke="${C.charcoal}" stroke-width="3" stroke-linecap="round"/></g>`,
  stethoscope: () => `<path d="M-40 -60 v40 q0 40 40 40 q40 0 40 -40 v-40" stroke="${C.forest}" stroke-width="10" fill="none" stroke-linecap="round"/><path d="M0 20 v30 q0 30 34 30" stroke="${C.forest}" stroke-width="10" fill="none" stroke-linecap="round"/><circle cx="46" cy="80" r="20" fill="${C.honey}" stroke="${C.forest}" stroke-width="8"/><circle cx="-40" cy="-64" r="8" fill="${C.charcoal}"/><circle cx="40" cy="-64" r="8" fill="${C.charcoal}"/>`,
  thermometer: () => `<g transform="rotate(25)"><rect x="-13" y="-70" width="26" height="110" rx="13" fill="#fff" ${S("")}/><circle cy="50" r="22" fill="${C.red}" ${S("")}/><rect x="-5" y="-30" width="10" height="70" rx="5" fill="${C.red}"/><path d="M13 -50 h10 M13 -30 h10 M13 -10 h10" stroke="${C.charcoal}" stroke-width="3" stroke-linecap="round"/></g>`,
  bone: () => `<g transform="rotate(-20)"><path d="M-46 -10 h92 a16 16 0 1 1 10 22 a16 16 0 1 1 -10 22 h-92 a16 16 0 1 1 -10 -22 a16 16 0 1 1 10 -22z" transform="translate(0 -12)" fill="${C.cream}" ${S("")}/></g>`,
  treat: () => `<circle r="22" fill="#C98B3A" ${S("", 3)}/><circle cx="-6" cy="-5" r="4" fill="#8A5A22"/><circle cx="7" cy="4" r="3" fill="#8A5A22"/>`,
  bowl: (o = {}) => `<path d="M-80 -6 h160 l-18 52 q-4 12 -18 12 h-88 q-14 0 -18 -12z" fill="${o.color || C.red}" ${S("")}/><ellipse cx="0" cy="-6" rx="80" ry="16" fill="${o.fill || "#C98B3A"}" ${S("")}/>${o.fill ? "" : `<circle cx="-30" cy="-12" r="9" fill="#8A5A22"/><circle cx="-4" cy="-16" r="9" fill="#A9702E"/><circle cx="24" cy="-11" r="9" fill="#8A5A22"/><circle cx="48" cy="-14" r="8" fill="#A9702E"/>`}`,
  waterBowl: () => props.bowl({ color: C.skyDeep, fill: C.sky }),
  riceBowl: () => `<path d="M-70 -4 h140 q-6 60 -70 64 q-64 -4 -70 -64z" fill="#fff" ${S("")}/><path d="M-62 -4 q62 -60 124 0z" fill="${C.cream}" ${S("", 3)}/><circle cx="-20" cy="-22" r="5" fill="#fff"/><circle cx="8" cy="-28" r="5" fill="#fff"/><circle cx="30" cy="-16" r="5" fill="#fff"/><path d="M-50 20 h100" stroke="${C.leaf}" stroke-width="8" stroke-linecap="round"/>`,
  peePad: () => `<g transform="skewX(-14)"><rect x="-120" y="-36" width="240" height="72" rx="12" fill="#fff" ${S("")}/><rect x="-104" y="-24" width="208" height="48" rx="8" fill="${C.sky}" opacity=".7"/><path d="M-104 0 h208 M-52 -24 v48 M0 -24 v48 M52 -24 v48" stroke="#fff" stroke-width="4"/></g>`,
  drop: () => `<path d="M0 -46 C18 -18 32 0 32 16 a32 32 0 0 1 -64 0 C-32 0 -18 -18 0 -46Z" fill="${C.skyDeep}"/><path d="M-12 8 q0 14 12 18" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" opacity=".8"/>`,
  door: () => `<rect x="-90" y="-180" width="180" height="300" rx="14" fill="#C9E3C2" ${S("")}/><rect x="-74" y="-164" width="148" height="128" rx="8" fill="${C.sky}" ${S("", 3)}/><path d="M0 -164 v128 M-74 -100 h148" stroke="#fff" stroke-width="5"/><circle cx="56" cy="20" r="9" fill="${C.honey}" ${S("", 3)}/><path d="M-110 120 h220" ${S('fill="none"', 6)}/>`,
  plant: () => `<path d="M-34 0 h68 l-10 62 h-48z" fill="${C.honey}" ${S("")}/><path d="M0 0 C-10 -40 -50 -60 -70 -50 C-60 -20 -30 -6 0 0Z" fill="${C.leaf}" ${S("", 3)}/><path d="M0 0 C10 -50 40 -80 66 -72 C62 -36 34 -10 0 0Z" fill="${C.green}" ${S("", 3)}/><path d="M0 0 C-4 -50 6 -90 20 -110 C30 -80 22 -30 0 0Z" fill="${C.leaf}" ${S("", 3)}/>`,
  window: () => `<rect x="-130" y="-110" width="260" height="220" rx="18" fill="${C.sky}" ${S("")}/><path d="M0 -110 v220 M-130 0 h260" stroke="#fff" stroke-width="10"/><circle cx="-60" cy="-56" r="22" fill="#FFF3B0"/><path d="M40 60 q20 -30 40 0 q20 -24 40 0" stroke="#fff" stroke-width="6" fill="none" opacity=".8"/><rect x="-150" y="104" width="300" height="20" rx="8" fill="#EAD8BE" ${S("", 3)}/>`,
  moon: () => `<path d="M10 -50 a52 52 0 1 0 40 84 a42 42 0 1 1 -40 -84z" fill="#FFE59A" ${S("", 3)}/>`,
  magnifier: () => `<circle r="48" fill="${C.sky}" opacity=".55"/><circle r="48" fill="none" ${S("", 9)}/><path d="M34 34 l44 44" stroke="${C.charcoal}" stroke-width="16" stroke-linecap="round"/><path d="M-22 -18 q8 -16 26 -18" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round"/>`,
  flea: () => `<ellipse rx="14" ry="10" fill="#6B3E1F"/><path d="M-6 6 l-10 14 M2 8 l-4 16 M8 6 l10 14 M10 -4 l16 -6" stroke="#6B3E1F" stroke-width="3" stroke-linecap="round"/>`,
  tick: () => `<ellipse rx="16" ry="20" fill="#5A3A2A"/><circle cy="-22" r="7" fill="#3B2418"/><path d="M-14 -6 l-14 -8 M-15 4 l-16 0 M-13 14 l-14 8 M14 -6 l14 -8 M15 4 l16 0 M13 14 l14 8" stroke="#3B2418" stroke-width="3" stroke-linecap="round"/>`,
  comb: () => `<g transform="rotate(-15)"><rect x="-80" y="-18" width="160" height="26" rx="10" fill="${C.honey}" ${S("")}/>${Array.from({ length: 13 }, (_, i) => `<rect x="${-74 + i * 12}" y="6" width="6" height="34" rx="3" fill="${C.honey}" ${S("", 2)}/>`).join("")}</g>`,
  brush: () => `<g transform="rotate(-25)"><rect x="-18" y="10" width="36" height="90" rx="14" fill="${C.forest}"/><rect x="-46" y="-50" width="92" height="64" rx="18" fill="${C.honey}" ${S("")}/>${Array.from({ length: 7 }, (_, i) => `<path d="M${-36 + i * 12} -50 v-18" stroke="${C.charcoal}" stroke-width="4" stroke-linecap="round"/>`).join("")}</g>`,
  plate: () => `<ellipse rx="140" ry="40" fill="#fff" ${S("")}/><ellipse rx="104" ry="26" fill="#F6EFE3"/>`,
  grapes: () => `${[[0, -40], [-20, -16], [20, -16], [-38, 8], [0, 8], [38, 8], [-20, 32], [20, 32], [0, 54]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="20" fill="#7A4FA3" ${S("", 3)}/>`).join("")}<path d="M0 -60 q8 -20 24 -24" stroke="#5A8A3A" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M8 -70 q26 -18 40 4 q-24 10 -40 -4z" fill="${C.leaf}"/>`,
  chocolate: () => `<g transform="rotate(-12)"><rect x="-70" y="-44" width="140" height="88" rx="10" fill="#6B3E1F" ${S("")}/>${[0, 1, 2, 3].map((c) => [0, 1].map((r) => `<rect x="${-62 + c * 32}" y="${-36 + r * 38}" width="26" height="32" rx="5" fill="#80502A"/>`).join("")).join("")}<path d="M10 -44 h60 v88 h-30z" fill="#E9DCC4" ${S("")}/></g>`,
  onion: () => `<path d="M0 -60 C40 -30 56 10 40 40 C28 62 -28 62 -40 40 C-56 10 -40 -30 0 -60Z" fill="#D9A3C9" ${S("")}/><path d="M0 -60 C14 -20 16 20 0 56 M0 -60 C-14 -20 -16 20 0 56" stroke="#B57AA6" stroke-width="4" fill="none"/><path d="M0 -60 q-4 -20 6 -30" stroke="${C.leaf}" stroke-width="7" fill="none" stroke-linecap="round"/>`,
  carrot: () => `<g transform="rotate(30)"><path d="M0 70 L-26 -40 Q0 -56 26 -40Z" fill="#F08A3C" ${S("")}/><path d="M-10 0 h12 M-6 30 h10 M-16 -24 h14" stroke="#C9661F" stroke-width="4" stroke-linecap="round"/><path d="M0 -46 q-20 -30 -10 -48 q10 18 10 30 q0 -26 16 -40 q6 26 -6 52" fill="${C.leaf}" ${S("", 3)}/></g>`,
  drumstick: () => `<g transform="rotate(-30)"><path d="M-10 10 C-50 30 -70 -20 -50 -50 C-30 -78 20 -66 26 -30 C30 -10 20 6 6 14Z" fill="#E0954A" ${S("")}/><rect x="2" y="8" width="16" height="50" rx="8" fill="${C.cream}" ${S("", 3)}/><circle cx="2" cy="62" r="11" fill="${C.cream}" ${S("", 3)}/><circle cx="18" cy="62" r="11" fill="${C.cream}" ${S("", 3)}/></g>`,
  pot: () => `<path d="M-90 -40 h180 v70 q0 40 -40 40 h-100 q-40 0 -40 -40z" fill="${C.forest}" ${S("")}/><rect x="-100" y="-56" width="200" height="22" rx="10" fill="#2E7A54" ${S("")}/><path d="M-100 -10 h-24 M100 -10 h24" ${S('fill="none"', 10)}/><path d="M-40 -76 q10 -20 0 -40 M0 -80 q10 -20 0 -40 M40 -76 q10 -20 0 -40" stroke="#C9D3CF" stroke-width="7" fill="none" stroke-linecap="round" opacity=".9"/>`,
  basket: () => `<path d="M-170 -60 h340 l-30 120 q-6 20 -26 20 h-228 q-20 0 -26 -20z" fill="#D8A15A" ${S("")}/>${[-110, -55, 0, 55, 110].map((x) => `<path d="M${x} -58 l${x * 0.1} 136" stroke="#B57E3A" stroke-width="6"/>`).join("")}<path d="M-160 -20 h320 M-150 20 h300" stroke="#B57E3A" stroke-width="6"/><path d="M-180 -64 q180 -40 360 0" stroke="${C.pink}" stroke-width="26" fill="none" stroke-linecap="round"/>`,
  bottle: () => `<g transform="rotate(-30)"><rect x="-20" y="-40" width="40" height="90" rx="14" fill="#fff" ${S("")}/><rect x="-16" y="0" width="32" height="46" rx="10" fill="${C.cream}"/><rect x="-24" y="-54" width="48" height="18" rx="6" fill="${C.pink}" ${S("", 3)}/><path d="M-10 -54 q10 -36 20 0" fill="${C.honey}" ${S("", 3)}/><path d="M20 -20 h-8 M20 -4 h-8 M20 12 h-8" stroke="${C.charcoal}" stroke-width="3"/></g>`,
  blanket: () => `<path d="M-150 0 q40 -30 80 0 q40 30 80 0 q40 -30 80 0 l-10 50 h-220z" fill="#BFDDF0" ${S("")}/><path d="M-120 24 h20 M-60 30 h20 M0 24 h20 M60 30 h20" stroke="#fff" stroke-width="6" stroke-linecap="round"/>`,
  litterBox: () => `<path d="M-190 -70 h380 l-24 110 q-4 16 -22 16 h-288 q-18 0 -22 -16z" fill="${C.leaf}" ${S("")}/><rect x="-200" y="-82" width="400" height="24" rx="12" fill="${C.green}" ${S("")}/><path d="M-140 -10 h40 M-20 6 h40 M100 -10 h40" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".6"/>`,
  litterBoxBack: () => `<ellipse cy="-70" rx="186" ry="20" fill="#E9DCC4"/>`,
  scoop: () => `<g transform="rotate(-30)"><rect x="-8" y="10" width="16" height="80" rx="8" fill="${C.honey}" ${S("")}/><path d="M-46 -50 h92 l-12 60 h-68z" fill="${C.honey}" ${S("")}/><path d="M-30 -36 v34 M-10 -36 v34 M10 -36 v34 M30 -36 v34" stroke="${C.charcoal}" stroke-width="4" stroke-linecap="round"/></g>`,
  puddle: () => `<path d="M-80 0 q-20 -30 20 -34 q30 -20 60 0 q40 -6 40 20 q20 24 -30 30 q-50 10 -90 -16z" fill="${C.sky}" ${S("", 3)}/><path d="M-30 -10 q20 -8 40 0" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  spray: () => `<rect x="-36" y="-30" width="72" height="110" rx="20" fill="${C.sky}" ${S("")}/><rect x="-22" y="0" width="44" height="40" rx="8" fill="#fff" opacity=".8"/><path d="M-14 -30 v-30 h50 l14 16 h-30 v14z" fill="#fff" ${S("")}/><path d="M66 -56 l26 -10 M66 -44 l30 0 M66 -32 l26 10" stroke="${C.skyDeep}" stroke-width="5" stroke-linecap="round"/>`,
  sparkles: () => `<path d="M0 -40 L8 -8 L40 0 L8 8 L0 40 L-8 8 L-40 0 L-8 -8Z" fill="${C.honey}"/><path d="M50 -50 L54 -36 L68 -32 L54 -28 L50 -14 L46 -28 L32 -32 L46 -36Z" fill="${C.honey}" opacity=".8"/>`,
  question: () => `<circle r="44" fill="#fff" ${S("")}/><path d="M-14 -12 q0 -20 16 -20 q16 0 16 16 q0 12 -14 18 v10" stroke="${C.forest}" stroke-width="9" fill="none" stroke-linecap="round"/><circle cy="26" r="6" fill="${C.forest}"/><path d="M-30 32 l-14 20 l26 -10" fill="#fff" ${S("")}/>`,
  exclaim: () => `<circle r="44" fill="${C.honey}" ${S("")}/><path d="M0 -26 v28" stroke="${C.charcoal}" stroke-width="10" stroke-linecap="round"/><circle cy="20" r="7" fill="${C.charcoal}"/><path d="M28 34 l16 18 l-26 -8" fill="${C.honey}" ${S("")}/>`,
  woof: () => `<path d="M-110 -50 h220 q20 0 20 20 v60 q0 20 -20 20 h-150 l-40 30 l10 -30 h-40 q-20 0 -20 -20 v-60 q0 -20 20 -20z" fill="#fff" ${S("")}/><circle cx="-62" cy="0" r="12" fill="${C.forest}"/><path d="M-34 -26 q20 26 0 52 M0 -38 q30 38 0 76 M34 -50 q40 50 0 100" stroke="${C.forest}" stroke-width="8" fill="none" stroke-linecap="round" transform="translate(0 0) scale(0.8)"/>`,
  zzz: () => `<path d="M-30 -30 h30 l-30 30 h30 M10 -60 h22 l-22 22 h22 M40 -86 h16 l-16 16 h16" stroke="${C.forest}" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  hand: () => `<path d="M-40 70 v-60 q0 -14 12 -14 q12 0 12 14 v-52 q0 -14 13 -14 q13 0 13 14 v44 v-56 q0 -14 13 -14 q13 0 13 14 v58 v-44 q0 -14 12 -14 q12 0 12 14 v84 q0 50 -50 50 h-10 q-30 0 -50 -30 l-30 -44 q-8 -12 2 -20 q10 -8 20 2z" fill="#F4C9A4" ${S("")}/>`,
  soap: () => `<rect x="-60" y="-26" width="120" height="58" rx="20" fill="${C.pink}" ${S("")}/><circle cx="-20" cy="-50" r="18" fill="#fff" opacity=".85" ${S("", 3)}/><circle cx="20" cy="-70" r="12" fill="#fff" opacity=".85" ${S("", 3)}/><circle cx="46" cy="-46" r="9" fill="#fff" opacity=".85" ${S("", 3)}/>`,
  rope: () => `<g transform="rotate(-10)"><path d="M-110 0 C-60 -30 60 30 110 0" stroke="${C.red}" stroke-width="22" fill="none" stroke-linecap="round"/><path d="M-110 0 C-60 -30 60 30 110 0" stroke="#fff" stroke-width="22" fill="none" stroke-dasharray="14 18" stroke-linecap="butt" opacity=".7"/><circle cx="-120" cy="2" r="20" fill="${C.honey}" ${S("", 3)}/><circle cx="120" cy="-2" r="20" fill="${C.honey}" ${S("", 3)}/></g>`,
  ball: () => `<circle r="34" fill="${C.honey}" ${S("")}/><path d="M-30 -14 q30 14 60 0 M-30 14 q30 -14 60 0" stroke="#fff" stroke-width="5" fill="none"/>`,
  wand: () => `<path d="M-90 80 L40 -60" stroke="${C.forest}" stroke-width="8" stroke-linecap="round"/><path d="M40 -60 q40 -10 50 30 q10 40 -20 60" stroke="${C.charcoal}" stroke-width="3" fill="none"/><path d="M70 30 l-14 30 l20 -6 l6 20 l14 -30z" fill="${C.pink}" ${S("", 3)}/>`,
  clicker: () => `<rect x="-36" y="-50" width="72" height="100" rx="30" fill="${C.honey}" ${S("")}/><circle cy="-6" r="20" fill="${C.red}" ${S("", 3)}/><path d="M-50 -60 q-10 -14 0 -26 M58 -60 q10 -14 0 -26" stroke="${C.forest}" stroke-width="5" fill="none" stroke-linecap="round"/>`,
  post: () => `<rect x="-120" y="40" width="240" height="40" rx="12" fill="#B57E3A" ${S("")}/><rect x="-40" y="-300" width="80" height="344" rx="14" fill="#E4C493" ${S("")}/>${Array.from({ length: 10 }, (_, i) => `<path d="M-40 ${-284 + i * 32} l80 14" stroke="#C49A5E" stroke-width="5"/>`).join("")}<rect x="-90" y="-330" width="180" height="40" rx="14" fill="#B57E3A" ${S("")}/>`,
  sofa: () => `<rect x="-260" y="-150" width="520" height="150" rx="40" fill="#C9B6E4" ${S("")}/><rect x="-300" y="-90" width="90" height="150" rx="34" fill="#B7A1D8" ${S("")}/><rect x="210" y="-90" width="90" height="150" rx="34" fill="#B7A1D8" ${S("")}/><rect x="-220" y="-40" width="440" height="90" rx="24" fill="#D8C9EE" ${S("")}/><path d="M-170 -110 l16 40 M-150 -114 l16 40 M-130 -110 l16 40" stroke="#8B71B5" stroke-width="6" stroke-linecap="round"/><rect x="-250" y="56" width="20" height="30" rx="6" fill="${C.charcoal}"/><rect x="230" y="56" width="20" height="30" rx="6" fill="${C.charcoal}"/>`,
  chart: () => `<path d="M-140 60 h80 v-50 h80 v-50 h80 v-50 h60" stroke="${C.forest}" stroke-width="12" fill="none" stroke-linejoin="round" stroke-linecap="round"/><circle cx="-100" cy="60" r="20" fill="${C.honey}" ${S("", 3)}/><circle cx="-20" cy="10" r="20" fill="${C.leaf}" ${S("", 3)}/><circle cx="60" cy="-40" r="20" fill="${C.pink}" ${S("", 3)}/><circle cx="140" cy="-90" r="20" fill="${C.sky}" ${S("", 3)}/>`,
  target: () => `<path d="M-100 70 L60 -40" stroke="${C.forest}" stroke-width="9" stroke-linecap="round"/><circle cx="72" cy="-48" r="26" fill="${C.red}" ${S("", 3)}/><circle cx="72" cy="-48" r="12" fill="#fff"/>`,
  hairball: () => `<circle r="30" fill="#D9925A" ${S("", 3)}/><path d="M-20 -10 q20 -14 40 4 M-22 8 q22 -10 44 8 M-10 -22 q12 14 4 40" stroke="#B5703A" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  paw: () => `<ellipse cy="14" rx="30" ry="24" fill="${C.forest}"/><ellipse cx="-30" cy="-18" rx="11" ry="14" fill="${C.forest}"/><ellipse cx="-10" cy="-32" rx="11" ry="14" fill="${C.forest}"/><ellipse cx="12" cy="-32" rx="11" ry="14" fill="${C.forest}"/><ellipse cx="32" cy="-18" rx="11" ry="14" fill="${C.forest}"/>`,
  scratchLines: () => `<path d="M-30 -30 q-14 30 0 60 M0 -40 q-14 40 0 80 M30 -30 q-14 30 0 60" stroke="${C.red}" stroke-width="7" fill="none" stroke-linecap="round" opacity=".8"/>`,
  motion: () => `<path d="M-40 -30 q-20 30 0 60 M-20 -44 q-26 44 0 88" stroke="${C.forest}" stroke-width="6" fill="none" stroke-linecap="round" opacity=".6"/>`,
  cushion: () => `<ellipse cy="0" rx="240" ry="46" fill="#F7C9A8" ${S("")}/><ellipse cy="-10" rx="200" ry="28" fill="#FBDCC3"/>`,
  germ: () => `<circle r="26" fill="${C.leaf}" ${S("", 3)}/>${Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return `<path d="M${(Math.cos(a) * 26).toFixed(1)} ${(Math.sin(a) * 26).toFixed(1)} L${(Math.cos(a) * 40).toFixed(1)} ${(Math.sin(a) * 40).toFixed(1)}" stroke="${C.charcoal}" stroke-width="3"/><circle cx="${(Math.cos(a) * 42).toFixed(1)}" cy="${(Math.sin(a) * 42).toFixed(1)}" r="5" fill="${C.leaf}" ${S("", 2)}/>`; }).join("")}<circle cx="-8" cy="-6" r="5" fill="${C.charcoal}"/><circle cx="8" cy="-6" r="5" fill="${C.charcoal}"/>`,
  // ---- batch B props (services, shop, brands, reel) ----
  pin: () => `<path d="M0 74 C-12 44 -52 12 -52 -20 a52 52 0 0 1 104 0 C52 12 12 44 0 74Z" fill="${C.red}" ${S("")}/><circle cy="-20" r="20" fill="#fff" ${S("", 3)}/>`,
  cross: () => `<rect x="-50" y="-50" width="100" height="100" rx="26" fill="#fff" ${S("")}/><path d="M-13 -32 h26 v19 h19 v26 h-19 v19 h-26 v-19 h-19 v-26 h19z" fill="${C.red}"/>`,
  clinic: () => `<rect x="-150" y="-120" width="300" height="230" rx="16" fill="#FFFDF8" ${S("")}/><rect x="-170" y="-150" width="340" height="42" rx="14" fill="${C.green}" ${S("")}/><rect x="-34" y="-232" width="68" height="68" rx="18" fill="#fff" ${S("")}/><path d="M-9 -218 h18 v13 h13 v18 h-13 v13 h-18 v-13 h-13 v-18 h13z" fill="${C.red}"/>${[[-118, -84], [-48, -84], [22, -84], [92, -84]].map(([x, y]) => `<rect x="${x}" y="${y}" width="40" height="44" rx="8" fill="#FFE59A" ${S("", 3)}/>`).join("")}<rect x="-40" y="10" width="80" height="100" rx="10" fill="${C.sky}" ${S("", 3)}/><circle cx="24" cy="62" r="5" fill="${C.charcoal}"/><path d="M-190 110 h380" ${S('fill="none"', 6)}/>`,
  phone: () => `<rect x="-66" y="-120" width="132" height="240" rx="24" fill="${C.charcoal}"/><rect x="-55" y="-102" width="110" height="196" rx="14" fill="#fff"/><rect x="-44" y="-88" width="88" height="26" rx="13" fill="${C.cream}" ${S("", 2)}/><circle cx="-28" cy="-75" r="7" fill="none" stroke="${C.forest}" stroke-width="3"/><path d="M-23 -70 l6 6" stroke="${C.forest}" stroke-width="3" stroke-linecap="round"/><rect x="-44" y="-50" width="88" height="40" rx="10" fill="${C.sky}"/><rect x="-44" y="-2" width="40" height="40" rx="10" fill="${C.honey}"/><rect x="4" y="-2" width="40" height="40" rx="10" fill="${C.leaf}"/><rect x="-44" y="46" width="88" height="34" rx="10" fill="${C.pink}"/><rect x="-18" y="104" width="36" height="6" rx="3" fill="#fff" opacity=".6"/>`,
  bag: (o = {}) => `<path d="M-72 -104 h144 l12 194 q0 16 -16 16 h-136 q-16 0 -16 -16z" fill="${o.color || C.leaf}" ${S("")}/><path d="M-72 -104 l8 -22 h128 l8 22z" fill="${o.top || "#FFFDF8"}" ${S("", 3)}/><circle cy="4" r="44" fill="#fff" opacity=".92"/><g transform="translate(0 8) scale(0.78)">${props.paw()}</g><path d="M-48 70 h96 M-34 86 h68" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".75"/>`,
  kibble: () => `${[[-34, 0, "#8A5A22"], [-6, -12, "#A9702E"], [24, -2, "#8A5A22"], [-18, 16, "#A9702E"], [12, 18, "#8A5A22"], [40, 16, "#A9702E"]].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="11" fill="${c}" ${S("", 2)}/>`).join("")}`,
  cart: () => `<path d="M-120 -78 h34 l34 118 h128 l26 -86 h-170" fill="none" stroke="${C.forest}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/><path d="M-74 -40 h164 l-20 66 h-124z" fill="${C.honey}" ${S("", 3)}/><circle cx="-36" cy="70" r="16" fill="${C.charcoal}"/><circle cx="78" cy="70" r="16" fill="${C.charcoal}"/><circle cx="-36" cy="70" r="6" fill="#fff"/><circle cx="78" cy="70" r="6" fill="#fff"/>`,
  box: () => `<path d="M-84 -42 L0 -84 L84 -42 L84 52 L0 94 L-84 52Z" fill="#D8A15A" ${S("")}/><path d="M-84 -42 L0 0 L84 -42 M0 0 V94" stroke="${C.charcoal}" stroke-width="4" fill="none" stroke-linejoin="round"/><path d="M-44 -63 L42 -20 V8" stroke="#F6E3C0" stroke-width="13" fill="none" opacity=".9"/><path d="M30 46 C14 36 12 24 20 21 C25 19 29 22 30 25 C31 22 35 19 40 21 C48 24 46 36 30 46Z" fill="${C.pink}" transform="translate(4 -8)"/>`,
  scale: () => `<rect x="-96" y="-22" width="192" height="44" rx="18" fill="#fff" ${S("")}/><path d="M-34 -22 a34 30 0 0 1 68 0" fill="${C.sky}" ${S("", 3)}/><path d="M0 -22 l14 -18" stroke="${C.red}" stroke-width="5" stroke-linecap="round"/><path d="M-70 8 h140" stroke="#EAE3D6" stroke-width="6" stroke-linecap="round"/>`,
  litterBag: () => `<path d="M-70 -100 h140 l10 190 q0 14 -14 14 h-132 q-14 0 -14 -14z" fill="${C.skyDeep}" ${S("")}/><path d="M-70 -100 l8 -20 h124 l8 20z" fill="#FFFDF8" ${S("", 3)}/><ellipse cy="14" rx="48" ry="40" fill="#fff" opacity=".9"/>${[[-20, 4], [0, -10], [20, 6], [-8, 26], [14, 28], [30, -8], [-30, 22]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#D9C7A6"/>`).join("")}<path d="M-46 76 h92" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".7"/>`,
  crystals: () => `${[[-30, 0, 18], [6, -14, 14], [30, 8, 16], [-4, 18, 12]].map(([x, y, r]) => `<path d="M${x} ${y - r} L${x + r * 0.9} ${y} L${x} ${y + r} L${x - r * 0.9} ${y}Z" fill="#EAF6FC" ${S("", 2)}/>`).join("")}`,
  house: () => `<path d="M-124 -6 L0 -124 L124 -6 Z" fill="${C.red}" ${S("")}/><rect x="-100" y="-20" width="200" height="140" rx="12" fill="${C.honey}" ${S("")}/><path d="M-40 120 v-52 a40 40 0 0 1 80 0 v52z" fill="${C.charcoal}" opacity=".88"/><path d="M0 -62 C-16 -72 -18 -86 -9 -89 C-4 -91 -1 -87 0 -84 C1 -87 4 -91 9 -89 C18 -86 16 -72 0 -62Z" fill="#fff"/><path d="M-80 20 h30 M50 20 h30" stroke="#D49B4E" stroke-width="6" stroke-linecap="round"/>`,
  suitcase: () => `<rect x="-84" y="-62" width="168" height="124" rx="20" fill="${C.skyDeep}" ${S("")}/><path d="M-30 -62 v-20 q0 -12 12 -12 h36 q12 0 12 12 v20" stroke="${C.charcoal}" stroke-width="7" fill="none"/><path d="M-84 -6 h168" stroke="#fff" stroke-width="6" opacity=".55"/><g transform="translate(46 30) scale(0.42)">${props.paw()}</g>`,
  scissors: () => `<g transform="rotate(-24)"><path d="M-4 -4 L84 -24 L88 -12 Z" fill="#E4EAEE" ${S("", 3)}/><path d="M-4 4 L84 24 L88 12 Z" fill="#E4EAEE" ${S("", 3)}/><circle cx="-38" cy="-24" r="22" fill="none" stroke="${C.red}" stroke-width="11"/><circle cx="-38" cy="24" r="22" fill="none" stroke="${C.red}" stroke-width="11"/><circle r="7" fill="${C.charcoal}"/></g>`,
  dryer: () => `<rect x="-38" y="28" width="34" height="86" rx="14" fill="${C.forest}" ${S("", 3)}/><circle cx="-20" cy="0" r="48" fill="${C.pink}" ${S("")}/><circle cx="-20" cy="0" r="22" fill="#fff" ${S("", 3)}/><rect x="12" y="-26" width="86" height="52" rx="12" fill="${C.pink}" ${S("")}/><path d="M112 -22 q18 -10 36 0 M112 0 q18 -10 36 0 M112 22 q18 -10 36 0" stroke="${C.skyDeep}" stroke-width="6" fill="none" stroke-linecap="round"/>`,
  bubbles: () => `${[[0, 0, 26], [36, -30, 16], [-30, -38, 12], [44, 18, 10]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity=".9" ${S("", 3)}/><path d="M${x - r * 0.45} ${y - r * 0.2} q${r * 0.15} ${-r * 0.35} ${r * 0.5} ${-r * 0.4}" stroke="${C.skyDeep}" stroke-width="3" fill="none" stroke-linecap="round"/>`).join("")}`,
  car: () => `<path d="M-180 34 v-44 q0 -22 22 -26 l44 -8 l44 -54 q12 -14 30 -14 h112 q18 0 30 14 l42 54 q34 6 34 34 v44z" fill="${C.honey}" ${S("")}/><path d="M-96 -46 l36 -44 h66 v44z" fill="${C.sky}" ${S("", 3)}/><path d="M28 -46 v-44 h44 q10 0 16 8 l28 36z" fill="${C.sky}" ${S("", 3)}/><rect x="-34" y="-142" width="68" height="28" rx="9" fill="${C.green}" ${S("", 3)}/><g transform="translate(0 -128) scale(0.3)"><ellipse cy="14" rx="30" ry="24" fill="#fff"/><ellipse cx="-30" cy="-18" rx="11" ry="14" fill="#fff"/><ellipse cx="-10" cy="-32" rx="11" ry="14" fill="#fff"/><ellipse cx="12" cy="-32" rx="11" ry="14" fill="#fff"/><ellipse cx="32" cy="-18" rx="11" ry="14" fill="#fff"/></g><path d="M-180 4 h360" stroke="#D49B4E" stroke-width="6"/><circle cx="-104" cy="36" r="32" fill="${C.charcoal}"/><circle cx="-104" cy="36" r="13" fill="#DDE3E8"/><circle cx="112" cy="36" r="32" fill="${C.charcoal}"/><circle cx="112" cy="36" r="13" fill="#DDE3E8"/><rect x="164" y="-20" width="18" height="14" rx="4" fill="#FFF3B0" ${S("", 2)}/>`,
  carrier: () => `<path d="M-46 -72 q46 -46 92 0" stroke="${C.charcoal}" stroke-width="9" fill="none" stroke-linecap="round"/><rect x="-116" y="-72" width="232" height="146" rx="32" fill="${C.leaf}" ${S("")}/><rect x="-86" y="-46" width="106" height="94" rx="16" fill="#fff" ${S("", 3)}/><path d="M-60 -46 v94 M-33 -46 v94 M-6 -46 v94 M-86 -14 h106 M-86 16 h106" stroke="${C.charcoal}" stroke-width="3" opacity=".55"/><path d="M42 -40 v80 M62 -40 v80 M82 -40 v80" stroke="${C.green}" stroke-width="7" stroke-linecap="round"/>`,
  whistle: () => `<path d="M-70 -24 h76 a42 42 0 1 1 -18 62 h-58z" fill="${C.honey}" ${S("")}/><circle cx="24" cy="18" r="15" fill="#fff" ${S("", 3)}/><path d="M-70 -10 l-26 -26" stroke="${C.red}" stroke-width="7" stroke-linecap="round"/>`,
  leash: () => `<path d="M-96 -96 q-36 -26 -4 -52 q34 -14 40 24 C-40 10 50 -30 96 60" stroke="${C.red}" stroke-width="11" fill="none" stroke-linecap="round"/><rect x="86" y="56" width="24" height="36" rx="7" fill="#DDE3E8" ${S("", 3)}/><circle cx="98" cy="98" r="9" fill="none" stroke="${C.charcoal}" stroke-width="4"/>`,
  cones: () => `${[-70, 0, 70].map((x, i) => `<path d="M${x} -40 L${x + 30} 30 H${x - 30} Z" fill="${["#F08A3C", C.honey, "#F08A3C"][i]}" ${S("", 3)}/><path d="M${x - 14} -6 H${x + 14}" stroke="#fff" stroke-width="7"/><rect x="${x - 40}" y="28" width="80" height="12" rx="4" fill="${C.charcoal}" opacity=".8"/>`).join("")}`,
  umbrella: () => `<path d="M-130 0 a130 108 0 0 1 260 0 q-22 -18 -43 0 q-22 -18 -43 0 q-22 -18 -44 0 q-22 -18 -43 0 q-22 -18 -44 0 q-21 -18 -43 0z" fill="${C.skyDeep}" ${S("")}/><path d="M-43 0 q10 -70 43 -108 q33 38 43 108" fill="${C.sky}" ${S("", 3)}/><path d="M0 -108 v-16" stroke="${C.charcoal}" stroke-width="7" stroke-linecap="round"/><path d="M0 0 v96 q0 22 -22 22 q-18 0 -20 -18" stroke="${C.charcoal}" stroke-width="8" fill="none" stroke-linecap="round"/>`,
  doc: () => `<rect x="-64" y="-84" width="128" height="168" rx="14" fill="#fff" ${S("")}/><path d="M-40 -52 h80 M-40 -28 h80 M-40 -4 h56 M-40 20 h70" stroke="#D8D1C4" stroke-width="8" stroke-linecap="round"/><circle cx="34" cy="56" r="22" fill="${C.green}"/><path d="M24 56 l7 8 l14 -16" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  globe: () => `<circle r="72" fill="${C.sky}" ${S("")}/><path d="M-50 -30 q20 -24 46 -16 q10 16 -8 26 q-18 6 -16 26 q-20 4 -30 -14 q-6 -12 8 -22z M18 -56 q30 6 40 30 q-14 6 -26 -2 q-14 -10 -14 -28z M10 20 q26 -8 40 8 q4 26 -20 40 q-14 -4 -16 -22 q-10 -10 -4 -26z" fill="${C.leaf}" ${S("", 3)}/><ellipse rx="72" ry="26" fill="none" stroke="#fff" stroke-width="3" opacity=".7"/><path d="M0 -72 v144" stroke="#fff" stroke-width="3" opacity=".7"/>`,
  star: () => `<path d="M0 -46 L13 -14 L46 -12 L20 9 L29 42 L0 23 L-29 42 L-20 9 L-46 -12 L-13 -14Z" fill="${C.honey}" ${S("", 3)}/>`,
  ringToy: () => `<circle r="44" fill="${C.pink}" ${S("")}/><circle r="18" fill="#FFFDF8" ${S("", 3)}/><path d="M-30 -18 q10 -14 26 -16" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" opacity=".8"/>`,
  search: () => `<rect x="-190" y="-34" width="380" height="68" rx="34" fill="#fff" ${S("")}/><circle cx="-148" cy="-4" r="15" fill="none" stroke="${C.forest}" stroke-width="6"/><path d="M-137 7 l12 12" stroke="${C.forest}" stroke-width="6" stroke-linecap="round"/><path d="M-108 0 h190" stroke="#E4DCCD" stroke-width="12" stroke-linecap="round"/><rect x="96" y="-16" width="6" height="32" rx="3" fill="${C.forest}"/>`,
};

const PALETTES = {
  honey: { bg: "#FFF7EA", a: "#FCE3B0", b: "#DDEFD7", c: "#FAD6C4", floor: "#F3E3C9" },
  mint: { bg: "#F4FBF4", a: "#D5EDD0", b: "#FCE7B8", c: "#CFE8F3", floor: "#E2EEDD" },
  peach: { bg: "#FFF5EF", a: "#FAD6C4", b: "#FCE7B8", c: "#E6DDF4", floor: "#F3DFD2" },
  sky: { bg: "#F3F9FD", a: "#D3EAF6", b: "#FCE7B8", c: "#DDEFD7", floor: "#DDE9F0" },
};

function background(paletteName, w = 1600, h = 900) {
  const p = PALETTES[paletteName] || PALETTES.honey;
  return `<rect width="${w}" height="${h}" fill="${p.bg}"/>
  <circle class="blob b1" cx="${w * 0.12}" cy="${h * 0.18}" r="${h * 0.32}" fill="${p.a}"/>
  <circle class="blob b2" cx="${w * 0.9}" cy="${h * 0.86}" r="${h * 0.36}" fill="${p.b}"/>
  <circle class="blob b3" cx="${w * 0.82}" cy="${h * 0.12}" r="${h * 0.12}" fill="${p.c}"/>
  <path d="M0 ${h * 0.86} Q${w * 0.5} ${h * 0.8} ${w} ${h * 0.86} V${h} H0Z" fill="${p.floor}" opacity=".85"/>
  ${Array.from({ length: 14 }, (_, i) => `<circle class="dot" cx="${(97 * i * 7) % w}" cy="${(53 * i * 11) % (h * 0.7) + 40}" r="${3 + (i % 3) * 2}" fill="${["#F2B544", "#7DB46C", "#F4A6B8"][i % 3]}" opacity=".45"/>`).join("")}`;
}

function shadow(x, y, w) {
  return `<ellipse cx="${x}" cy="${y + 6}" rx="${w}" ry="${w * 0.14}" fill="#000" opacity=".08"/>`;
}

function character(spec) {
  const svg = spec.type === "dog" ? dog({ expr: spec.expr }) : spec.type === "puppy" ? dog({ puppy: true, expr: spec.expr }) : spec.type === "cat" ? cat({ expr: spec.expr, cone: spec.cone, paw: spec.paw }) : cat({ kitten: true, expr: spec.expr, cone: spec.cone, paw: spec.paw });
  const flip = spec.flip ? -1 : 1;
  return `<g class="actor" data-id="${spec.id || spec.type}" transform="translate(${spec.x} ${spec.y}) scale(${spec.s * flip} ${spec.s})">${svg}</g>`;
}

function prop(spec) {
  const fn = props[spec.name];
  if (!fn) throw new Error(`unknown prop ${spec.name}`);
  return `<g class="prop${spec.float ? " float" : ""}" data-id="${spec.id || spec.name}" transform="translate(${spec.x} ${spec.y}) rotate(${spec.r || 0}) scale(${spec.s || 1})">${fn(spec.opts)}</g>`;
}

/** Full scene SVG (inner markup) for a scene config; elements carry classes/data-ids for the animator. */
function scene(cfg, w = 1600, h = 900) {
  const back = (cfg.back || []).map(prop).join("");
  const shadows = cfg.chars.map((c) => shadow(c.x, c.y, 150 * c.s)).join("");
  const chars = cfg.chars.map(character).join("");
  const front = (cfg.props || []).map(prop).join("");
  return `${background(cfg.palette, w, h)}<g class="layer-back">${back}</g>${shadows}<g class="layer-chars">${chars}</g><g class="layer-front">${front}</g>`;
}

module.exports = { C, dog, cat, props, scene, background, PALETTES };
