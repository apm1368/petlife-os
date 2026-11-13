// 90 s reel "Set Pet": matching custom-printed outfits for a person and their pet (owner request 2026-11-13).
// Same pipeline as reel.js: original vector art (art.js characters + new person/shirt art here), frames rendered in
// Chromium, VP9 + Opus WebM through WebCodecs (encoder.js/webm.js), no ffmpeg. Copy in setpet-copy.js.
// Usage:
//   node setpet-reel.js <locales> <9x16,16x9> --preview 1,2.9,…      PNG stills
//   node setpet-reel.js <locale> <fmt> --from 0 --to 10                 one 10 s segment (starts on a keyframe)
//   node setpet-reel.js <locales> <fmts> --assemble --music <mp3> --start 10
// Outputs out/setpet/setpet-<locale>-<format>.webm (+ "site" 1280×720 from the 16x9 capture), posters, .srt.
const fs = require("fs");
const path = require("path");
const { chromium } = require("/opt/petlife-qa/node_modules/playwright-core");
const art = require("./art");
const COPY = require("./setpet-copy");
const { recordFrames, encodeAudio, writeWebm, writeWebp } = require("./encoder");

const OUT = path.join(__dirname, "out", "setpet");
const FONT_DIR = path.join(__dirname, "fonts");
const BRAND = "/root/opetlife-brand-kit/svg";
const CHROME = "/root/.cache/ms-playwright/chromium-1140/chrome-linux/chrome";
const FPS = 30;
const DURATION = 90;
const FORMATS = {
  "9x16": { W: 1080, H: 1920, layout: "p", zoom: 1, bitrate: 5_000_000 },
  "16x9": { W: 1920, H: 1080, layout: "l", zoom: 1, bitrate: 5_000_000, extra: [{ name: "site", width: 1280, height: 720, bitrate: 1_300_000 }] },
  site: { W: 1280, H: 720, layout: "l", zoom: 2 / 3, bitrate: 1_300_000 },
};
// Scenes (s): hook, title, steps 1–5, reveal, call to action. Every cut is on a bar line (120 BPM = 2 s a bar).
const STARTS = [0, 4, 8, 18, 30, 46, 60, 70, 80];
const C = art.C;
const DIG = (l, n) => (l === "fa" ? new Intl.NumberFormat("fa-IR").format(n) : String(n));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const words = (s) => s.split(/\s+/).map((w) => `<span class="w">${esc(w)}</span>`).join(" ");

const SKIN = "#E7B08A", SKIN_D = "#CC9068", HAIR = "#3A2A22", DENIM = "#46648C";
const HONEY = C.honey;
// Garments use the site's six base colours (owner #368 P12, apps/web/features/set-pet/set-pet-catalog.ts): white, black,
// heather grey, navy, cream, sage. The set in the reel is sage; honey stays the UI accent.
const GARMENT = "#A9B9A0";
const SWATCHES = ["#FFFFFF", "#1E1F1D", "#B9BDBA", "#22304A", "#F3E9D2", GARMENT];
const TAPS = [[1.4, 1], [2.6, 2], [3.8, 3], [5.0, 5]]; // step 1: [time, swatch index]
const SIZES = ["S", "M", "L", "XL", "2XL", "3XL"]; // human and pet (decided before #368)
const SIZE_TAPS = [[6.3, 1], [7.3, 2]]; // M, then L (the order card says L)

function lockup(locale, white) {
  const f = `lockup-${locale === "fa" ? "fa" : "en"}${white ? "-white" : ""}.svg`;
  return fs.readFileSync(path.join(BRAND, f), "utf8").replace(/<\?xml[^>]*>/, "").replace(/<!--[\s\S]*?-->/g, "");
}

// ---------- art: prints, shirts, person, dressed pets ----------
const SHIRT = "M-60 -305 Q0 -268 60 -305 L128 -292 L212 -206 L160 -168 L132 -198 L138 0 L-138 0 L-132 -198 L-160 -168 L-212 -206 L-128 -292 Z";
const SHIRT_BACK = "M-60 -305 Q0 -294 60 -305 L128 -292 L212 -206 L160 -168 L132 -198 L138 0 L-138 0 L-132 -198 L-160 -168 L-212 -206 L-128 -292 Z";
const OUTLINE = 'stroke="rgba(30,36,31,.28)" stroke-width="4" stroke-linejoin="round"';
const petFace = () => `<path d="M-28 -24 C-44 -30 -60 -14 -60 8 C-60 22 -53 32 -45 30 C-38 28 -36 12 -30 -4Z" fill="#C47F33"/><path d="M28 -24 C44 -30 60 -14 60 8 C60 22 53 32 45 30 C38 28 36 12 30 -4Z" fill="#C47F33"/><ellipse rx="36" ry="33" fill="#E9B661"/><ellipse cy="13" rx="21" ry="15" fill="#F8DFA6"/><circle cx="-13" cy="-7" r="5" fill="${C.ink}"/><circle cx="13" cy="-7" r="5" fill="${C.ink}"/><circle cx="-11.5" cy="-9" r="1.7" fill="#fff"/><circle cx="14.5" cy="-9" r="1.7" fill="#fff"/><path d="M-6 6 Q0 2 6 6 Q5 12 0 13 Q-5 12 -6 6Z" fill="${C.ink}"/><path d="M-7 18 q7 6 14 0" stroke="${C.ink}" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M-3 20 q3 9 6 0z" fill="${C.pinkDeep}"/>`;
const personFace = () => `<circle cy="4" r="30" fill="${SKIN}"/><path d="M-31 4 C-35 -26 -14 -38 2 -37 C22 -36 35 -22 31 4 C28 -9 18 -17 6 -17 C-6 -11 -20 -11 -31 4Z" fill="${HAIR}"/><circle cx="-10" cy="5" r="3.6" fill="${C.ink}"/><circle cx="10" cy="5" r="3.6" fill="${C.ink}"/><path d="M-8 17 q8 7 16 0" stroke="${C.ink}" stroke-width="2.6" fill="none" stroke-linecap="round"/><ellipse cx="-19" cy="14" rx="5" ry="3" fill="${C.blush}" opacity=".7"/><ellipse cx="19" cy="14" rx="5" ry="3" fill="${C.blush}" opacity=".7"/>`;
const heartPaw = () => `<path d="M0 30 C-46 0 -52 -36 -26 -46 C-12 -51 -2 -42 0 -32 C2 -42 12 -51 26 -46 C52 -36 46 0 0 30Z" fill="${C.pink}" transform="translate(0 4) scale(.82)"/><g transform="translate(0 -6) scale(.32)" fill="#fff"><ellipse cy="14" rx="30" ry="24"/><ellipse cx="-30" cy="-18" rx="11" ry="14"/><ellipse cx="-10" cy="-32" rx="11" ry="14"/><ellipse cx="12" cy="-32" rx="11" ry="14"/><ellipse cx="32" cy="-18" rx="11" ry="14"/></g>`;
const PRINTS = {
  pet: { bg: "#FFF7EA", photo: "#BFE3F5", draw: () => `<g transform="scale(1.08)">${petFace()}</g>` },
  duo: { bg: "#F4FBF4", photo: "#DDEFD7", draw: () => `<g transform="translate(-21 2) scale(.82)">${personFace()}</g><g transform="translate(23 8) scale(.6)">${petFace()}</g><path d="M0 30 C-46 0 -52 -36 -26 -46 C-12 -51 -2 -42 0 -32 C2 -42 12 -51 26 -46 C52 -36 46 0 0 30Z" fill="${C.pinkDeep}" transform="translate(1 -36) scale(.2)"/>` },
  design: { bg: "#FFF5EF", photo: "#FAD6C4", draw: heartPaw },
};
// Round print badge, r = 50 at scale 1.
const badge = (kind, s = 1, extra = "") => `<g transform="scale(${s})" ${extra}><circle r="50" fill="${PRINTS[kind].bg}" stroke="${C.charcoal}" stroke-width="4"/>${PRINTS[kind].draw()}</g>`;
// Square photo (100×100, centred) for the upload cards.
const photo = (kind) => `<svg viewBox="-50 -50 100 100" class="ph"><rect x="-50" y="-50" width="100" height="100" fill="${PRINTS[kind].photo}"/><path d="M-50 30 Q0 22 50 30 V50 H-50Z" fill="#fff" opacity=".45"/><g transform="translate(0 2) scale(1.1)">${PRINTS[kind].draw()}</g></svg>`;

/** Standing person, feet at y=0, ~760 tall. T-shirt fill carries class `shirt-fill` so a scene can recolour it. */
function person({ shirt = "#FFFFFF", print = null } = {}) {
  const arm = (d) => `<path d="M${175 * d} -196 C${188 * d} -140 ${194 * d} -80 ${190 * d} -26" stroke="${SKIN}" stroke-width="44" fill="none" stroke-linecap="round"/><circle cx="${190 * d}" cy="-8" r="26" fill="${SKIN}"/>`;
  const head = `<g id="head" style="transform-box:fill-box;transform-origin:50% 95%">
    <path d="M-96 -420 C-104 -500 -46 -532 4 -526 C60 -522 104 -486 96 -412 C92 -380 86 -360 80 -350 L74 -420 C50 -452 6 -470 -30 -456 C-58 -446 -76 -430 -84 -404 L-88 -350 C-94 -370 -98 -396 -96 -420Z" fill="${HAIR}"/>
    <circle cx="-88" cy="-404" r="17" fill="${SKIN_D}"/><circle cx="88" cy="-404" r="17" fill="${SKIN_D}"/>
    <ellipse cx="0" cy="-410" rx="86" ry="90" fill="${SKIN}"/>
    <path d="M-88 -418 C-92 -488 -40 -520 6 -514 C56 -510 92 -478 88 -418 C76 -446 52 -462 22 -462 C0 -448 -40 -444 -62 -452 C-74 -444 -84 -432 -88 -418Z" fill="${HAIR}"/>
    ${eyesP()}
    <path d="M0 -398 q7 14 -3 19" stroke="${SKIN_D}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <path d="M-24 -362 q24 22 48 0" stroke="${C.ink}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <ellipse cx="-54" cy="-376" rx="15" ry="9" fill="${C.blush}" opacity=".6"/><ellipse cx="54" cy="-376" rx="15" ry="9" fill="${C.blush}" opacity=".6"/>
  </g>`;
  return `<g class="char person">
    <ellipse cx="-48" cy="-12" rx="50" ry="19" fill="${C.charcoal}"/><ellipse cx="48" cy="-12" rx="50" ry="19" fill="${C.charcoal}"/>
    <path d="M-104 -262 H104 L94 -26 H12 L4 -196 H-4 L-12 -26 H-94 Z" fill="${DENIM}"/>
    <path d="M-40 -230 v190 M40 -230 v190" stroke="#3A5478" stroke-width="4" opacity=".5"/>
    <g transform="translate(0 -232)">
      ${arm(-1)}${arm(1)}
      <rect x="-25" y="-336" width="50" height="46" rx="14" fill="${SKIN_D}"/>
      <path d="${SHIRT}" class="shirt-fill" fill="${shirt}" ${OUTLINE}/>
      <path d="M-60 -305 Q0 -268 60 -305" stroke="rgba(30,36,31,.18)" stroke-width="9" fill="none" stroke-linecap="round"/>
      <path d="M-132 -198 Q-120 -120 -128 -40 M132 -198 Q120 -120 128 -40" stroke="rgba(30,36,31,.10)" stroke-width="6" fill="none" stroke-linecap="round"/>
      ${print ? `<g class="pprint" transform="translate(0 -196)">${badge(print, 0.92)}</g>` : ""}
      ${head}
    </g>
  </g>`;
}
function eyesP() {
  const e = (x) => `<ellipse cx="${x}" cy="-412" rx="10" ry="12.5" fill="${C.ink}"/><circle cx="${x + 3.5}" cy="-416" r="3.4" fill="#fff"/>`;
  return `<g id="eyes">${e(-31)}${e(31)}</g><path d="M-46 -440 q14 -9 28 0 M18 -440 q14 -9 28 0" stroke="${HAIR}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
}

// Garment for the sitting dog (art.dog coordinates); drawn under the collar.
// The front stays plain: the pet print zone is the back only (decided before #368), shown with petBack()/backCard.
const dogGarment = (color, print = null) => `<g class="garment"><path d="M-86 -250 Q0 -212 86 -250 C110 -214 122 -176 120 -126 Q60 -108 0 -106 Q-60 -108 -120 -126 C-122 -176 -110 -214 -86 -250Z" fill="${color}" ${OUTLINE}/><path d="M-118 -128 Q-60 -110 0 -108 Q60 -110 118 -128" stroke="rgba(30,36,31,.2)" stroke-width="8" fill="none" stroke-linecap="round"/>${print ? `<g transform="translate(0 -170)">${badge(print, 0.6)}</g>` : ""}</g>`;
const collar = () => `<path d="M-80 -264 Q0 -228 80 -264 L76 -242 Q0 -206 -76 -242 Z" fill="${C.pink}"/>${Array.from({ length: 9 }, (_, i) => { const t = i / 8; return `<circle cx="${(-70 + 140 * t).toFixed(1)}" cy="${(-230 + 22 * Math.sin(Math.PI * t)).toFixed(1)}" r="7" fill="#fff" opacity=".9"/>`; }).join("")}<circle cx="0" cy="-214" r="14" fill="${C.honey}" stroke="#D99A22" stroke-width="3"/>`;
// The pet garment seen from behind, with the design on its back.
const petBack = (color) => `<g class="pet-back"><path d="M-72 -78 Q0 -58 72 -78 C92 -40 96 30 70 84 Q0 100 -70 84 C-96 30 -92 -40 -72 -78Z" fill="${color}" ${OUTLINE}/><path d="M-40 -74 Q0 -46 40 -74" stroke="rgba(30,36,31,.25)" stroke-width="7" fill="none" stroke-linecap="round"/><g transform="translate(0 12)">${badge("pet", 0.92)}</g></g>`;
function dressedDog(color, opts = {}) {
  const svg = art.dog({ expr: opts.expr });
  if (!color) return svg;
  const i = svg.indexOf('<path d="M-80 -264 Q0 -228 80 -264');
  return svg.slice(0, i) + dogGarment(color, opts.print === undefined ? null : opts.print) + svg.slice(i);
}
function dressedCat(color) {
  const svg = art.cat({});
  const i = svg.lastIndexOf('<g transform="translate(0 ');
  const scarf = `<g class="garment"><path d="M-70 -238 Q0 -212 70 -238 L4 -150 Q0 -146 -4 -150 Z" fill="${color}" ${OUTLINE}/></g>`;
  return svg.slice(0, i) + scarf + svg.slice(i);
}
const actor = (inner, x, y, s, extra = "") => `<g class="actor" ${extra} transform="translate(${x} ${y}) scale(${s})">${inner}</g>`;
const floorShadow = (x, y, w) => `<ellipse cx="${x}" cy="${y + 6}" rx="${w}" ry="${w * 0.14}" fill="#000" opacity=".08"/>`;
const prop = (name, x, y, s, cls = "pop", t = 0, opts) => `<g transform="translate(${x} ${y})"><g class="an" data-a="${cls}" data-t="${t}"><g transform="scale(${s})">${art.props[name](opts)}</g></g></g>`;

/** Big flat shirt mockup for step 3, shirt-space coordinates (hem at y=0). view: "front" | "back". v1 of the site previews
 * on 2D front/back mockups (no 3D viewer yet, issue #374), so the reel shows the same: a front/back toggle and a flat flip. */
function bigShirt(view, color) {
  const front = view === "front";
  const zones = front
    ? `<circle id="zone-chest" class="zone" cx="0" cy="-190" r="62"/><circle id="zone-sleeve" class="zone" cx="160" cy="-224" r="27"/>`
    : `<circle id="zone-back" class="zone" cx="0" cy="-178" r="76"/>`;
  const prints = front
    ? `<g transform="translate(0 -190)"><g class="pr" data-p="chest">${badge("pet", 1.24)}</g></g><g transform="translate(160 -224) rotate(43)"><g class="pr" data-p="sleeve">${badge("design", 0.5)}</g></g>`
    : `<g transform="translate(0 -178)"><g class="pr" data-p="back">${badge("duo", 1.5)}</g></g>`;
  return `<g class="face-${view}">
    <path d="${front ? SHIRT : SHIRT_BACK}" class="shirt-fill" fill="${color}" ${OUTLINE}/>
    <path d="${front ? "M-60 -305 Q0 -268 60 -305" : "M-60 -305 Q0 -294 60 -305"}" stroke="rgba(30,36,31,.18)" stroke-width="9" fill="none" stroke-linecap="round"/>
    ${front ? "" : `<rect x="-16" y="-300" width="32" height="18" rx="4" fill="#fff" opacity=".8"/>`}
    <path d="M-132 -198 Q-120 -120 -128 -30 M132 -198 Q120 -120 128 -30 M-150 -180 l-34 -32 M150 -180 l34 -32" stroke="rgba(30,36,31,.10)" stroke-width="6" fill="none" stroke-linecap="round"/>
    ${zones}${prints}
    <path d="${front ? SHIRT : SHIRT_BACK}" class="shade" fill="url(#shade)" opacity="0"/>
  </g>`;
}

// ---------- layout ----------
const CANVAS = { l: { dx: 420, dy: 175, k: 0.9 }, p: { dx: 0, dy: 450, k: 0.9 } };
const CANVAS_HOOK = { l: { dx: 468, dy: 300, k: 0.82 }, p: { dx: 0, dy: 640, k: 0.9 } };
const CANVAS_CTA = { l: { dx: 660, dy: 600, k: 0.5 }, p: { dx: 135, dy: 1060, k: 0.675 } };
const WIPE = { p: (rtl) => ({ x: rtl ? 925 : 155, y: 371 }), l: (rtl) => ({ x: rtl ? 1725 : 195, y: 135 }) };

function reelHtml(locale, fmt) {
  const F = FORMATS[fmt];
  const P = F.layout === "p";
  const rtl = locale === "fa" || locale === "ar";
  const W = P ? 1080 : 1920, H = P ? 1920 : 1080;
  const cv = CANVAS[F.layout];
  const wipe = WIPE[F.layout](rtl);
  const S = COPY.steps;
  const D = (n) => DIG(locale, n);
  const backCard = (x, y, t, o) => `<div class="pbackw" style="left:${x}px;top:${y}px"><div class="pback an" data-a="pop" data-t="${t}"${o ? ` data-o="${o}"` : ""}><svg viewBox="-110 -100 220 200" width="200" height="182">${petBack(GARMENT)}</svg><span>${esc(S[3].ui.backLabel[locale])}</span></div></div>`;
  const bg = (pal) => `<svg class="bgsvg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${art.background(pal, W, H)}</svg>`;
  const canvas = (svg, html = "", c = cv) => `<div class="canvas" style="left:${c.dx}px;top:${c.dy}px;transform:scale(${c.k})"><svg class="csvg" width="1200" height="900" viewBox="0 0 1200 900"><defs><linearGradient id="shade" x1="0" x2="1"><stop offset="0" stop-color="#1E241F" stop-opacity=".55"/><stop offset=".6" stop-color="#1E241F" stop-opacity="0"/></linearGradient></defs>${svg}</svg>${html}</div>`;
  const sub = (text, t, o, low) => `<div class="sub${low ? " low" : ""}" data-t="${t}"${o ? ` data-o="${o}"` : ""}><p>${words(text)}</p></div>`;
  const head = (n) => `<div class="stephead an" data-a="down" data-t="0.25"><div class="pill"><span>${esc(COPY.stepOf[locale](D(n)))}</span><i>${[1, 2, 3, 4, 5].map((i) => `<b class="${i <= n ? "on" : ""}"></b>`).join("")}</i></div><h2>${esc(S[n - 1].title[locale])}</h2></div>`;
  const scenes = [];

  // 0 · hook: the result first — person and dog already matching.
  scenes.push(`<div class="scene" data-k="0">${bg("honey")}${canvas(
    `${floorShadow(430, 850, 170)}${floorShadow(780, 850, 130)}${actor(person({ shirt: GARMENT, print: "pet" }), 430, 850, 1, 'data-in="0.05"')}${actor(dressedDog(GARMENT), 780, 850, 0.86, 'data-in="0.2"')}${prop("sparkles", 190, 260, 1.1, "pop", 0.5)}${prop("heart", 640, 300, 0.75, "pop", 0.8)}${prop("sparkles", 1010, 230, 0.8, "pop", 1.0)}`, backCard(1060, 420, 1.3), CANVAS_HOOK[F.layout])}
    <div class="ovl hook"><h1 class="q1">${words(COPY.hook[locale].q)}</h1><div class="q2 an" data-a="pop" data-t="1.55"><span>${esc(COPY.hook[locale].sub)}</span></div></div></div>`);

  // 1 · title card
  scenes.push(`<div class="scene" data-k="1"><svg class="bgsvg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#FFFBF5"/><circle class="blob" cx="${W * 0.18}" cy="${H * 0.22}" r="${H * 0.22}" fill="#FCE3B0"/><circle class="blob" cx="${W * 0.86}" cy="${H * 0.8}" r="${H * 0.26}" fill="#DDEFD7"/></svg>${canvas(
    `<g transform="translate(370 640)"><g class="an" data-a="pop" data-t="0.9"><g transform="scale(.85)"><path d="${SHIRT}" fill="${GARMENT}" ${OUTLINE} transform="translate(0 150)"/><g transform="translate(0 -40)">${badge("pet", 0.92)}</g></g></g></g>
     <g transform="translate(600 630)"><g class="an" data-a="pop" data-t="1.25"><g transform="scale(1)">${art.props.heart()}</g></g></g>
     <g transform="translate(840 650)"><g class="an" data-a="pop" data-t="1.5"><g transform="scale(1.45)">${petBack(GARMENT)}</g></g></g>`)}
    <div class="ovl title"><div class="logo an" data-a="down" data-t="0.15">${lockup(locale, false)}</div><h1 class="name an" data-a="pop" data-t="0.4">${esc(COPY.name[locale])}</h1><p class="tag an" data-a="up" data-t="1.1">${esc(COPY.tagline[locale])}</p></div></div>`);

  // 2 · step 1: garment type (P6), colour and size
  const gt = S[0].ui.types[locale].map((g, i) => `<b class="gt${i === 0 ? " sel" : ""}">${esc(g)}</b>`).join("");
  const sw = SWATCHES.map((c, i) => `<b class="sw" data-i="${i}" style="background:${c}"></b>`).join("");
  const sz = SIZES.map((s, i) => `<b class="sz" data-i="${i}">${s}</b>`).join("");
  scenes.push(`<div class="scene" data-k="2" data-kind="step1">${bg("mint")}${canvas(
    `${floorShadow(430, 850, 170)}${floorShadow(790, 850, 120)}${actor(person({ shirt: "#FFFFFF" }), 430, 850, 1)}${actor(art.dog({}), 790, 850, 0.8)}`)}
    <div class="ovl">${head(1)}<div class="panel an" data-a="side" data-t="0.5"><h3>${esc(S[0].ui.garment[locale])}</h3><div class="gts">${gt}</div><h3>${esc(S[0].ui.colour[locale])}</h3><div class="sws">${sw}</div><h3>${esc(S[0].ui.size[locale])}</h3><div class="szs">${sz}</div><div class="ok an" data-a="pop" data-t="8.0">✓</div></div><i class="tap"></i>${sub(S[0].subs[0][locale], 1.2, 0, P)}</div></div>`);

  // 3 · step 2: upload photos or designs (no fixed number, P21)
  const cards = ["pet", "duo", "design"];
  const cardLabels = S[1].ui.cards[locale];
  const slots = cards.map((k, i) => `<div class="slot" data-i="${i}"><b class="plus">＋</b><div class="fill">${photo(k)}<span>${esc(cardLabels[i])}</span><i><b></b></i></div><em class="chk">✓</em></div>`).join("");
  const anchors = [[40, 820], [1160, 120], [1160, 820]].map(([x, y], i) => `<i class="anchor" data-i="${i}" style="left:${x}px;top:${y}px"></i>`).join("");
  const fly2 = cards.map((k, i) => `<div class="fly3 f2" data-i="${i}"><div class="pol">${photo(k)}<span>${esc(cardLabels[i])}</span></div></div>`).join("");
  scenes.push(`<div class="scene" data-k="3" data-kind="step2">${bg("sky")}${canvas(
    `${floorShadow(1100, 860, 60)}${actor(art.dog({ expr: "alert" }), 1100, 860, 0.46, 'data-in="1.0"')}`,
    `<div class="upl an" data-a="up" data-t="0.4"><div class="uhead"><b>${esc(S[1].ui.head[locale])}</b><span class="count">${[1, 2, 3].map((n) => `<em data-n="${n}">${esc(S[1].ui.count[locale](D(n)))}</em>`).join("")}</span></div><div class="slots">${slots}</div></div>${anchors}`)}
    <div class="ovl">${head(2)}${fly2}${sub(S[1].subs[0][locale], 1.0)}</div></div>`);

  // 4 · step 3: place on the T-shirt mockup (chest, back, sleeve), switching front/back with a toggle
  const tray = cards.map((k, i) => `<div class="tcard" data-i="${i}"><div class="pol">${photo(k)}<span>${esc(cardLabels[i])}</span></div></div>`).join("");
  const flies3 = cards.map((k, i) => `<div class="fly3" data-i="${i}"><div class="pol">${photo(k)}<span>${esc(cardLabels[i])}</span></div></div>`).join("");
  const u3 = S[2].ui;
  scenes.push(`<div class="scene" data-k="4" data-kind="step3">${bg("peach")}${canvas(
    `<ellipse cx="600" cy="842" rx="280" ry="30" fill="#000" opacity=".07"/>`,
    `<div class="shirtmock an" data-a="pop" data-t="0.35"><svg viewBox="-260 -360 520 400" width="832" height="640">${bigShirt("front", GARMENT)}${bigShirt("back", GARMENT)}</svg></div>
     <div class="ztag" data-p="chest" style="left:250px;top:430px">${esc(u3.chest[locale])}</div><div class="ztag" data-p="back" style="left:250px;top:430px">${esc(u3.back[locale])}</div><div class="ztag" data-p="sleeve" style="left:950px;top:290px">${esc(u3.sleeve[locale])}</div>
     <div class="vtogw" style="left:1010px;top:700px"><div class="vtog an" data-a="pop" data-t="0.9"><span data-v="front">${esc(u3.viewFront[locale])}</span><span data-v="back">${esc(u3.viewBack[locale])}</span></div></div>`)}
    <div class="ovl">${head(3)}<i class="tap"></i><div class="tray an" data-a="side" data-t="0.6">${tray}</div>${flies3}${sub(S[2].subs[0][locale], 1.2, 7.6, P)}${sub(S[2].subs[1][locale], 8.0, 0, P)}</div></div>`);

  // 5 · step 4: measure with the size guide, pick the pet size letter (P17), garment drops on
  const u4 = S[3].ui;
  const tape = (d, t) => `<path d="${d}" pathLength="1" class="an tape" data-a="draw" data-t="${t}" data-d="0.9" data-o="8.9" stroke="${C.honey}" stroke-width="13" fill="none" stroke-linecap="round"/><path d="${d}" class="an" data-a="fade" data-t="${t + 0.7}" data-o="8.9" stroke="${C.charcoal}" stroke-width="13" stroke-dasharray="2 12" fill="none" opacity=".55"/>`;
  const lead = (x1, y1, x2, y2, t) => `<path d="M${x1} ${y1} L${x2} ${y2}" pathLength="1" class="an" data-a="draw" data-t="${t}" data-d="0.4" data-o="8.9" stroke="${C.charcoal}" stroke-width="4" stroke-dasharray="1" fill="none"/><circle cx="${x1}" cy="${y1}" r="8" fill="${C.charcoal}" class="an" data-a="pop" data-t="${t}" data-o="8.9"/>`;
  scenes.push(`<div class="scene" data-k="5" data-kind="step4">${bg("honey")}${canvas(
    `${floorShadow(560, 860, 200)}${actor(`${art.dog({})}<g class="tapes">${tape("M-94 -240 A94 20 0 0 0 94 -240", 0.9)}${tape("M-126 -152 A126 24 0 0 0 126 -152", 3.6)}${tape("M-168 -250 L-168 -30", 6.2)}<g class="an" data-a="fade" data-t="6.2" data-o="8.9"><path d="M-186 -250 h36 M-186 -30 h36" stroke="${C.charcoal}" stroke-width="7" stroke-linecap="round"/></g></g><g class="an" data-a="drop" data-t="9.0" data-d="0.85">${dogGarment(GARMENT)}${collar()}</g>`, 560, 860, 1.3)}
     ${lead(683, 548, 812, 520, 1.6)}${lead(724, 664, 820, 664, 4.3)}${lead(342, 640, 300, 640, 6.9)}
     ${prop("sparkles", 330, 300, 0.9, "pop", 10.0)}${prop("sparkles", 860, 360, 0.7, "pop", 10.3)}${prop("heart", 900, 560, 0.6, "pop", 10.6)}`,
    `<div class="pszw" style="left:1000px;top:270px"><div class="psz an" data-a="pop" data-t="7.6" data-o="9.3"><h4>${esc(u4.size[locale])}</h4><div class="pszs">${SIZES.map((z) => `<b>${z}</b>`).join("")}</div></div></div>${backCard(1000, 300, 9.6)}<div class="mtag an" data-a="pop" data-o="8.9" style="left:820px;top:490px" data-t="1.8">${esc(u4.neck[locale])}</div><div class="mtag an" data-a="pop" data-o="8.9" style="left:828px;top:634px" data-t="4.5">${esc(u4.chest[locale])}</div><div class="mtag an" data-a="pop" data-o="8.9" style="right:910px;top:610px" data-t="7.1">${esc(u4.back[locale])}</div>`)}
    <div class="ovl">${head(4)}<i class="tap"></i>${sub(S[3].subs[0][locale], 1.2, 8.4)}${sub(S[3].subs[1][locale], 9.2)}</div></div>`);

  // 6 · step 5: order request, team confirms the price
  const u5 = S[4].ui;
  const icons = [`<b class="swatch" style="background:${GARMENT}"></b>`, `<span class="stack">${cards.map((k) => `<i>${photo(k)}</i>`).join("")}</span>`, `<svg viewBox="-130 -260 260 160" class="gi">${dogGarment(GARMENT, null)}</svg>`];
  scenes.push(`<div class="scene" data-k="6" data-kind="step5">${bg("mint")}${canvas(
    "",
    `<div class="order an" data-a="up" data-t="0.35"><div class="ohead"><b>${esc(u5.card[locale])}</b></div>${u5.rows[locale].map((r, i) => `<div class="orow an" data-a="side" data-t="${0.8 + i * 0.25}">${icons[i]}<span>${esc(r)}</span></div>`).join("")}<div class="obtn"><span class="send">${esc(u5.send[locale])}</span><span class="sent">✓ ${esc(u5.sent[locale])}</span></div><div class="stat an" data-a="side" data-t="4.0"><em>✓</em><span>${esc(u5.design[locale])}</span></div><div class="stat an" data-a="side" data-t="5.4"><em>✓</em><span>${esc(u5.price[locale])}</span></div><div class="agent an" data-a="pop" data-t="3.5"><svg viewBox="-50 -50 100 100">${`<circle r="48" fill="#FCE3B0" stroke="${C.charcoal}" stroke-width="4"/><g transform="translate(0 6) scale(1.15)">${personFace()}</g><path d="M-34 -2 A34 34 0 0 1 34 -2" stroke="${C.charcoal}" stroke-width="6" fill="none"/><rect x="-42" y="-8" width="12" height="22" rx="5" fill="${C.forest}"/><rect x="30" y="-8" width="12" height="22" rx="5" fill="${C.forest}"/><path d="M36 14 q0 20 -22 22" stroke="${C.charcoal}" stroke-width="4" fill="none"/>`}</svg></div><div class="note an" data-a="up" data-t="6.6">${esc(u5.note[locale])}</div></div>`)}
    <div class="ovl">${head(5)}<i class="tap"></i>${sub(S[4].subs[0][locale], 1.0, 0, P)}</div></div>`);

  // 7 · reveal: matching, photo flash, confetti
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const confetti = Array.from({ length: 46 }, () => `<rect class="cf" x="${(rnd() * 1200).toFixed(0)}" y="-30" width="${(10 + rnd() * 10).toFixed(0)}" height="${(18 + rnd() * 12).toFixed(0)}" rx="3" fill="${[C.honey, C.pink, C.leaf, C.skyDeep, C.red][Math.floor(rnd() * 5)]}" data-v="${(380 + rnd() * 320).toFixed(0)}" data-r="${(rnd() * 720 - 360).toFixed(0)}" data-d="${(rnd() * 1.6).toFixed(2)}" data-w="${(rnd() * 60 - 30).toFixed(0)}"/>`).join("");
  scenes.push(`<div class="scene" data-k="7" data-kind="reveal">${bg("peach")}${canvas(
    `<g class="an" data-a="pop" data-t="1.15"><rect x="120" y="150" width="960" height="730" rx="18" fill="none" stroke="#fff" stroke-width="22" transform="rotate(-1.5 600 515)"/></g>
     ${floorShadow(420, 850, 170)}${floorShadow(770, 850, 120)}${floorShadow(1010, 850, 80)}${actor(person({ shirt: GARMENT, print: "pet" }), 420, 850, 1, 'data-in="0.1"')}${actor(dressedDog(GARMENT), 770, 850, 0.82, 'data-in="0.25"')}${actor(dressedCat(GARMENT), 1010, 850, 0.55, 'data-in="0.4"')}
     ${prop("heart", 590, 270, 0.6, "pop", 1.6)}<g class="confetti">${confetti}</g>`, backCard(1060, 300, 2.0))}
    <div class="flash"></div><div class="ovl reveal"><h1 class="big an" data-a="pop" data-t="1.4">${esc(COPY.reveal[locale].big)}</h1>${sub(COPY.reveal[locale].sub, 2.2)}</div></div>`);

  // 8 · call to action
  const c = COPY.cta[locale];
  scenes.push(`<div class="scene" data-k="8" data-kind="cta"><svg class="bgsvg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#1F5A3D"/><circle class="blob" cx="${W * 0.15}" cy="${H * 0.15}" r="${H * 0.25}" fill="#2E7A54"/><circle class="blob" cx="${W * 0.9}" cy="${H * 0.9}" r="${H * 0.3}" fill="#2B6E4C"/></svg>${canvas(
    `${actor(person({ shirt: GARMENT, print: "pet" }), 470, 880, 0.95, 'data-in="0.6"')}${actor(dressedDog(GARMENT), 760, 880, 0.8, 'data-in="0.8"')}`, "", CANVAS_CTA[F.layout])}
    <div class="ovl cta"><div class="logo an" data-a="pop" data-t="0.25">${lockup(locale, true)}</div><p class="line an" data-a="up" data-t="1.0">${esc(c.line)}</p><div class="btn an" data-a="pop" data-t="1.6"><span>${esc(c.button)}</span></div><p class="share an" data-a="fade" data-t="2.6">${esc(c.share)}</p></div></div>`);

  const side = rtl ? "left" : "right";
  const css = `
@font-face{font-family:Vazirmatn;src:url(file://${FONT_DIR}/vazirmatn-arabic-wght-normal.woff2) format("woff2");font-weight:100 900;unicode-range:U+0600-06FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FEFF}
@font-face{font-family:Vazirmatn;src:url(file://${FONT_DIR}/vazirmatn-latin-wght-normal.woff2) format("woff2");font-weight:100 900}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${F.W}px;height:${F.H}px;overflow:hidden;background:#FFFBF5}
body{font-family:Vazirmatn,sans-serif;color:#1E241F}
.stage{position:absolute;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;transform:scale(${F.zoom});transform-origin:0 0}
.scene{position:absolute;inset:0;display:none}
.bgsvg{position:absolute;left:0;top:0}
.canvas{position:absolute;width:1200px;height:900px;transform-origin:0 0}
.csvg{position:absolute;left:0;top:0;overflow:visible}
svg .an,svg .actor *{transform-box:fill-box;transform-origin:center}
.ovl{position:absolute;inset:0}
.an{will-change:transform}
.w{display:inline-block;opacity:0}
.sub{position:absolute;left:0;right:0;display:flex;justify-content:center;opacity:0}
.sub p{background:rgba(30,36,31,.84);color:#fff;border-radius:28px;font-weight:800;text-align:center;text-wrap:balance}
.stephead{position:absolute;left:0;right:0;display:flex;flex-direction:column;align-items:center}
.pill{display:flex;align-items:center;gap:18px;background:#1F5A3D;color:#fff;border-radius:999px;font-weight:800}
.pill i{display:flex;gap:8px;direction:ltr}.pill i b{border-radius:50%;background:rgba(255,255,255,.35)}.pill i b.on{background:${HONEY}}
.stephead h2{font-weight:900;color:#1F5A3D;text-align:center;text-wrap:balance}
.hook .q1{position:absolute;left:0;right:0;text-align:center;font-weight:900;color:#1F5A3D;text-wrap:balance}
.hook .q2{position:absolute;left:0;right:0;display:flex;justify-content:center}
.q2 span{background:${HONEY};border:5px solid #1E241F;border-radius:22px;font-weight:900;box-shadow:0 10px 0 rgba(30,36,31,.15)}
.title .logo,.cta .logo{position:absolute;left:0;right:0;display:flex;justify-content:center}
.title .logo svg,.cta .logo svg{display:block;width:auto}
.title .name{position:absolute;left:0;right:0;text-align:center;font-weight:900;color:#1F5A3D;letter-spacing:${rtl ? 0 : -2}px}
.title .tag{position:absolute;text-align:center;font-weight:800;color:#3B4239;text-wrap:balance}
.panel{position:absolute;background:#fff;border:5px solid #1E241F;border-radius:32px;box-shadow:0 12px 0 rgba(30,36,31,.12)}
.panel h3{font-weight:900;color:#1F5A3D}
.sws,.szs{display:grid}
.gts{display:flex;flex-wrap:wrap;gap:10px}.gt{display:flex;align-items:center;border-radius:999px;border:4px solid rgba(30,36,31,.25);font-weight:900;color:#3B4239;white-space:nowrap}.gt.sel{background:#1F5A3D;color:#fff;border-color:#1E241F}
.pbackw{position:absolute;transform:translate(-50%,-50%)}.pback{background:#fff;border:4px solid #1E241F;border-radius:26px;padding:10px 16px 12px;box-shadow:0 8px 0 rgba(30,36,31,.12);display:flex;flex-direction:column;align-items:center;gap:2px}.pback span{font-size:28px;font-weight:900;color:#1F5A3D;white-space:nowrap}
.pszw{position:absolute;transform:translate(-50%,-50%)}.psz{background:#fff;border:4px solid #1E241F;border-radius:26px;padding:12px 18px 18px;box-shadow:0 8px 0 rgba(30,36,31,.12)}.psz h4{font-size:30px;font-weight:900;color:#1F5A3D;text-align:center;margin-bottom:10px}.pszs{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.psz b{display:flex;align-items:center;justify-content:center;height:54px;min-width:78px;border-radius:14px;border:4px solid rgba(30,36,31,.25);font-size:26px;font-weight:900;color:#3B4239;direction:ltr}.psz b.sel{background:#1F5A3D;color:#fff;border-color:#1E241F}
.sw{display:block;border-radius:50%;border:4px solid rgba(30,36,31,.35);transition:none}
.sw.sel{border:7px solid #1E241F;transform:scale(1.12)}
.sz{display:flex;align-items:center;justify-content:center;border-radius:16px;border:4px solid rgba(30,36,31,.25);font-weight:900;color:#3B4239;direction:ltr}
.sz.sel{background:#1F5A3D;color:#fff;border-color:#1E241F}
.ok{position:absolute;${rtl ? "left" : "right"}:-26px;top:-26px;width:64px;height:64px;border-radius:50%;background:${C.green};color:#fff;font-weight:900;font-size:38px;display:flex;align-items:center;justify-content:center;border:4px solid #1E241F}
.tap{position:absolute;width:110px;height:110px;margin:-55px 0 0 -55px;border-radius:50%;border:8px solid #1F5A3D;opacity:0;pointer-events:none}
.upl{position:absolute;left:150px;top:120px;width:900px;background:#fff;border:5px solid #1E241F;border-radius:36px;padding:26px 34px 34px;box-shadow:0 14px 0 rgba(30,36,31,.12)}
.anchor{position:absolute;width:200px;height:240px;margin:-120px 0 0 -100px}
.slots{display:grid;grid-template-columns:repeat(3,1fr);gap:30px;margin-top:22px}
.slot{position:relative;height:380px;border:5px dashed rgba(30,36,31,.3);border-radius:26px;display:flex;align-items:center;justify-content:center}
.slot .plus{font-size:90px;font-weight:300;color:#1F5A3D;opacity:.6}
.slot .fill{position:absolute;inset:14px;display:flex;flex-direction:column;align-items:center;gap:14px;opacity:0;background:#fff}
.slot .fill .ph{width:100%;aspect-ratio:1;height:auto;border-radius:16px;border:4px solid #1E241F}
.slot .fill span{font-size:27px;font-weight:900;color:#1F5A3D;text-align:center;line-height:1.15}
.slot .fill i{display:block;width:100%;height:14px;border-radius:7px;background:#DDD6C8;overflow:hidden}.slot .fill i b{display:block;height:100%;width:100%;background:${C.green};transform-origin:${rtl ? "right" : "left"};transform:scaleX(0)}
.slot .chk{position:absolute;top:-24px;${rtl ? "left" : "right"}:-24px;width:64px;height:64px;font-size:36px;border:4px solid #1E241F}
.uhead{display:flex;justify-content:space-between;align-items:center;font-size:42px;font-weight:900;color:#1F5A3D}
.count{position:relative;width:250px;height:56px;font-size:32px}.count em{position:absolute;inset:0;font-style:normal;background:${HONEY};border:4px solid #1E241F;border-radius:28px;text-align:center;line-height:48px;opacity:0}
.add{height:84px;border:4px dashed rgba(30,36,31,.35);border-radius:22px;display:flex;align-items:center;justify-content:center;font-size:52px;color:#1F5A3D;font-weight:300}
.row{display:flex;align-items:center;gap:14px;height:118px;background:#F4F1EA;border-radius:22px;padding:0 14px;opacity:0;position:relative}
.thumb{flex:none;width:86px;height:86px;border-radius:16px;overflow:hidden;border:3px solid #1E241F}
.ph{display:block;width:100%;height:100%}
.meta{flex:1;min-width:0;display:flex;flex-direction:column;gap:10px}.meta span{font-size:22px;font-weight:800;color:#1E241F;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.meta i{display:block;height:10px;border-radius:5px;background:#DDD6C8;overflow:hidden}.meta i b{display:block;height:100%;width:100%;background:${C.green};transform-origin:${rtl ? "right" : "left"};transform:scaleX(0)}
.chk{flex:none;width:40px;height:40px;border-radius:50%;background:${C.green};color:#fff;font-style:normal;font-weight:900;font-size:24px;display:flex;align-items:center;justify-content:center;opacity:0}
.fly,.fly3,.tcard{position:absolute}
.fly{width:170px}
.pol{background:#fff;border:4px solid #1E241F;border-radius:18px;padding:12px 12px 8px;box-shadow:0 10px 0 rgba(30,36,31,.14);display:flex;flex-direction:column;align-items:center;gap:6px}
.pol .ph{width:100%;height:auto;aspect-ratio:1;border-radius:10px}
.pol span{font-weight:800;color:#1F5A3D;text-align:center;line-height:1.12}
.fly .pol span{font-size:20px}
.shirtmock{position:absolute;left:184px;top:224px;width:832px;height:640px}
.shirtmock svg{display:block;overflow:visible}
.zone{fill:rgba(255,255,255,.35);stroke:#1E241F;stroke-width:4;stroke-dasharray:12 9}
.ztag{position:absolute;transform:translate(-50%,-50%);background:#1F5A3D;color:#fff;border:4px solid #1E241F;border-radius:999px;padding:6px 28px;font-size:40px;font-weight:900;opacity:0;white-space:nowrap}
.vtogw{position:absolute;transform:translate(-50%,-50%)}.vtog{display:flex;gap:6px;padding:8px;background:#fff;border:4px solid #1E241F;border-radius:999px;box-shadow:0 8px 0 rgba(30,36,31,.12);white-space:nowrap}
.vtog span{padding:8px 26px;border-radius:999px;font-size:34px;font-weight:900;color:#1F5A3D}
.tray{position:absolute;display:flex;gap:22px}
.tcard{position:relative}
.mtag{position:absolute;background:#fff;border:4px solid #1E241F;border-radius:999px;padding:6px 24px;font-size:36px;font-weight:900;color:#1F5A3D;white-space:nowrap;opacity:0;box-shadow:0 8px 0 rgba(30,36,31,.12)}
.order{position:absolute;left:250px;top:40px;width:700px;background:#fff;border:5px solid #1E241F;border-radius:36px;padding:26px 32px 30px;box-shadow:0 14px 0 rgba(30,36,31,.12);display:flex;flex-direction:column;gap:16px}
.ohead b{display:block;font-size:38px;font-weight:900;color:#1F5A3D;padding-${rtl ? "left" : "right"}:120px}
.orow{display:flex;align-items:center;gap:20px;height:80px;background:#F4F1EA;border-radius:20px;padding:0 18px;font-size:32px;font-weight:800}
.orow .swatch{flex:none;width:52px;height:52px;border-radius:50%;border:4px solid #1E241F}
.stack{flex:none;display:flex;direction:ltr}.stack i{display:block;width:46px;height:46px;border:3px solid #1E241F;border-radius:10px;overflow:hidden;margin-left:-14px;background:#fff}.stack i:first-child{margin-left:0}
.gi{flex:none;width:70px;height:44px}
.obtn{position:relative;height:88px;border-radius:999px;background:${HONEY};border:5px solid #1E241F;font-size:36px;font-weight:900;display:flex;align-items:center;justify-content:center}
.obtn span{position:absolute}.obtn .sent{opacity:0;color:#fff}
.stat{display:flex;align-items:center;gap:16px;font-size:32px;font-weight:900;color:#1F5A3D}.stat em{flex:none;width:48px;height:48px;border-radius:50%;background:${C.green};color:#fff;font-style:normal;display:flex;align-items:center;justify-content:center;font-size:28px}
.agent{position:absolute;${rtl ? "left" : "right"}:24px;top:-34px;width:124px;height:124px}.agent svg{width:100%;height:100%}
.note{margin-top:4px;padding-top:16px;border-top:3px dashed rgba(30,36,31,.2);text-align:center;font-size:30px;font-weight:800;color:#3B4239}
.flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}
.reveal .big{position:absolute;left:0;right:0;text-align:center;font-weight:900;color:#1F5A3D;text-wrap:balance}
.cta .line{position:absolute;left:0;right:0;text-align:center;color:#fff;font-weight:850;text-wrap:balance}
.cta .btn{position:absolute;left:0;right:0;display:flex;justify-content:center}
.cta .btn span{background:${HONEY};color:#1E241F;border:5px solid #1E241F;border-radius:999px;font-weight:900;direction:ltr;box-shadow:0 10px 0 rgba(0,0,0,.18)}
.cta .share{position:absolute;left:0;right:0;text-align:center;color:#FCE3B0;font-weight:700}
.brand{position:absolute;font-weight:800;color:#1F5A3D;opacity:.75;direction:ltr}
${P ? `
.sub{top:1290px;padding:0 60px}.sub.low{top:1490px}.sub p{font-size:52px;line-height:1.5;padding:20px 38px;max-width:960px}
.stephead{top:230px}.pill{font-size:30px;padding:10px 26px}.pill i b{width:14px;height:14px}.stephead h2{font-size:70px;line-height:1.3;margin-top:18px;padding:0 60px}
.hook .q1{top:270px;padding:0 70px;font-size:96px;line-height:1.35}.hook .q2{top:${rtl ? 470 : 560}px}.q2 span{font-size:56px;padding:14px 40px}
.title .logo{top:300px}.title .logo svg{height:150px}.title .name{top:500px;font-size:${rtl ? 190 : 170}px;line-height:1.2}.title .tag{top:760px;left:80px;right:80px;font-size:52px;line-height:1.5}
.panel{left:60px;right:60px;top:1230px;height:256px;padding:12px 28px;display:grid;grid-template-columns:auto 1fr;grid-template-rows:repeat(3,1fr);align-items:center;gap:0 22px}
.panel h3{font-size:34px}.gt{height:56px;padding:0 24px;font-size:28px}.sws{grid-template-columns:repeat(6,1fr);gap:16px;justify-items:center}.sw{width:60px;height:60px}.szs{grid-template-columns:repeat(6,1fr);gap:12px}.sz{height:56px;font-size:28px}
.tray{left:90px;right:90px;top:1262px;justify-content:center}.tcard{width:200px}.tcard .pol span{font-size:22px}.fly3{width:200px}.fly3 .pol span{font-size:22px}
.reveal .big{top:250px;font-size:104px;line-height:1.3;padding:0 60px}
.cta .logo{top:300px}.cta .logo svg{height:180px}.cta .line{top:540px;padding:0 80px;font-size:66px;line-height:1.45}.cta .btn{top:800px}.cta .btn span{font-size:64px;padding:18px 64px}.cta .share{top:960px;padding:0 70px;font-size:40px}
.brand{top:170px;left:0;right:0;text-align:center;font-size:32px}
.order{left:80px;top:80px;width:1040px;gap:20px;padding:30px 38px 36px}.ohead b{font-size:48px}.orow{height:104px;font-size:42px}.orow .swatch{width:64px;height:64px}.stack i{width:60px;height:60px}.gi{width:92px;height:58px}.obtn{height:110px;font-size:46px}.stat{font-size:44px}.stat em{width:60px;height:60px;font-size:34px}.agent{width:150px;height:150px;top:-50px}
.note{font-size:38px}` : `
.sub{top:958px;padding:0 120px}.sub p{font-size:44px;line-height:1.5;padding:10px 40px;max-width:1500px}
.stephead{top:26px}.pill{font-size:24px;padding:6px 22px}.pill i b{width:12px;height:12px}.stephead h2{font-size:60px;line-height:1.25;margin-top:8px}
.hook .q1{top:70px;padding:0 140px;font-size:92px;line-height:1.3}.hook .q2{top:${rtl ? 205 : 210}px}.q2 span{font-size:46px;padding:10px 34px}
.title .logo{top:70px}.title .logo svg{height:110px}.title .name{top:200px;font-size:${rtl ? 170 : 150}px;line-height:1.2}.title .tag{top:440px;left:300px;right:300px;font-size:44px;line-height:1.45}
.panel{${side}:60px;top:220px;width:380px;padding:24px 28px 30px;display:flex;flex-direction:column;gap:16px}
.panel h3{font-size:32px}.gt{height:50px;padding:0 16px;font-size:24px}.sws{grid-template-columns:repeat(3,1fr);gap:18px;justify-items:center}.sw{width:76px;height:76px}.szs{grid-template-columns:repeat(3,1fr);gap:12px}.sz{height:66px;font-size:30px}
.tray{${side}:70px;top:230px;flex-direction:column;gap:20px}.tcard{width:190px}.tcard .pol span{font-size:22px}.fly3{width:190px}.fly3 .pol span{font-size:22px}
.reveal .big{top:30px;font-size:96px;line-height:1.3}
.cta .logo{top:60px}.cta .logo svg{height:130px}.cta .line{top:236px;padding:0 160px;font-size:58px;line-height:1.4}.cta .btn{top:390px}.cta .btn span{font-size:54px;padding:12px 56px}.cta .share{top:520px;font-size:32px}
.brand{top:1030px;${rtl ? "left" : "right"}:40px;font-size:26px}`}
`;

  const clipR = Math.hypot(W, H).toFixed(0);
  const script = `
const STARTS=${JSON.stringify(STARTS)},END=${DURATION},R=${clipR},WX=${wipe.x},WY=${wipe.y},RTL=${rtl},ZOOM=${F.zoom},P=${P};
const TAPS=${JSON.stringify(TAPS)},SIZE_TAPS=${JSON.stringify(SIZE_TAPS)},SW=${JSON.stringify(SWATCHES)};
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const ease=t=>1-Math.pow(1-clamp(t),3);
const inOut=t=>{t=clamp(t);return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2};
const back=t=>{t=clamp(t);const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2)};
const lerp=(a,b,p)=>a+(b-a)*p;
const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const mix=(a,b,p)=>{const x=hex(a),y=hex(b);return 'rgb('+x.map((v,i)=>Math.round(lerp(v,y[i],p))).join(',')+')'};
const sceneOf=t=>{let k=0;for(let i=0;i<STARTS.length;i++)if(t>=STARTS[i])k=i;return k};
const stage=document.querySelector('.stage');
const rect=el=>{const r=el.getBoundingClientRect();return{x:(r.left+r.width/2)/ZOOM,y:(r.top+r.height/2)/ZOOM,w:r.width/ZOOM,h:r.height/ZOOM}};
const scenes=[...document.querySelectorAll('.scene')].map((el,k)=>({el,k,kind:el.dataset.kind||'',start:STARTS[k],end:k+1<STARTS.length?STARTS[k+1]:END,
  ans:[...el.querySelectorAll('.an')].map(a=>({el:a,a:a.dataset.a,t:+a.dataset.t||0,d:+(a.dataset.d||(a.dataset.a==='draw'?0.9:0.5)),o:a.dataset.o?+a.dataset.o:null,svg:a instanceof SVGElement})),
  subs:[...el.querySelectorAll('.sub')].map(s=>({el:s,t:+s.dataset.t,o:s.dataset.o?+s.dataset.o:null,w:[...s.querySelectorAll('.w')]})),
  q1:[...el.querySelectorAll('.q1 .w')],
  actors:[...el.querySelectorAll('.actor')].map((a,i)=>({el:a,base:a.getAttribute('transform'),i,tin:a.dataset.in?+a.dataset.in:0.25+i*0.16,head:a.querySelector('#head'),tail:a.querySelector('#tail'),eyes:[...a.querySelectorAll('#eyes')]})),
  blobs:[...el.querySelectorAll('.bgsvg .blob, .bgsvg circle')]}));
function anim(s,u,t){
  for(const a of s.ans){
    const p=clamp((u-a.t)/a.d), q=a.o!=null?ease((u-a.o)/0.35):0;
    let op=1,tr='';
    if(a.a==='pop'){const b=back(p);op=p>0?1:0;tr='scale('+Math.max(0.001,b)+')'}
    else if(a.a==='fade'){op=ease(p)}
    else if(a.a==='up'){const e=ease(p);op=e;tr='translateY('+((1-e)*40)+'px)'}
    else if(a.a==='down'){const e=ease(p);op=e;tr='translateY('+((e-1)*40)+'px)'}
    else if(a.a==='side'){const e=ease(p);op=e;tr='translateX('+((1-e)*(RTL?-70:70))+'px)'}
    else if(a.a==='drop'){const b=back(p);op=p>0?1:0;tr='translateY('+((1-b)*-300)+'px)'}
    else if(a.a==='draw'){a.el.style.strokeDasharray='1';a.el.style.strokeDashoffset=String(1-inOut(p));op=p>0?1:0}
    a.el.style.opacity=op*(1-q);
    if(tr||a.a!=='draw')a.el.style.transform=tr;
  }
  for(const sb of s.subs){
    const on=u>=sb.t&&(sb.o==null||u<sb.o+0.3);
    const e=ease((u-sb.t)/0.3), q=sb.o!=null?ease((u-sb.o)/0.3):0;
    sb.el.style.opacity=on?e*(1-q):0;sb.el.style.transform='translateY('+((1-e)*24)+'px)';
    sb.w.forEach((w,i)=>{const f=ease((u-sb.t-0.1-i*0.11)/0.25);w.style.opacity=f;w.style.transform='translateY('+((1-f)*16)+'px)'});
  }
  s.q1.forEach((w,i)=>{const f=back((u-0.12-i*0.2)/0.4);w.style.opacity=f>0.01?1:0;w.style.transform='scale('+Math.max(0.001,f)+')'});
  for(const a of s.actors){
    const ap=back((u-a.tin)/0.6),k1=Math.max(0.001,ap);
    const hop=Math.max(0,Math.sin(((t*2)%1)*Math.PI))*3;
    const br=1+0.012*Math.sin(t*2.4+a.i);
    a.el.style.opacity=ap<0.01?0:1;
    a.el.setAttribute('transform',a.base+' translate(0 '+(-hop)+') scale('+k1+' '+(k1*br)+')');
    if(a.head)a.head.style.transform='rotate('+(Math.sin(t*1.6+a.i)*3.5)+'deg)';
    if(a.tail)a.tail.style.transform='rotate('+(Math.sin(t*12+a.i)*9)+'deg)';
    a.eyes.forEach(e=>{const bl=((t+a.i*0.7)%3.1);e.style.transformBox='fill-box';e.style.transformOrigin='center';e.style.transform='scaleY('+(bl<0.1?0.15:1)+')'});
  }
  s.blobs.forEach((b,i)=>{if(b.getAttribute('r')>60){b.style.transformBox='fill-box';b.style.transformOrigin='center';b.style.transform='scale('+(1+0.035*Math.sin(t*1.1+i))+')'}});
  (K[s.kind]||(()=>{}))(s,u,t);
  const dur=s.end-s.start;
  if(s.k<8){const out=ease((u-(dur-0.35))/0.35);s.el.querySelector('.ovl').style.opacity=1-out}
}
function tapAt(tap,el,u,t0){const r=rect(el);const p=clamp((u-t0)/0.5);tap.style.left=r.x+'px';tap.style.top=r.y+'px';tap.style.opacity=u>=t0&&p<1?(1-p):0;tap.style.transform='scale('+(0.4+p)+')'}
function flight(f,from,to,a,b,u,arc){
  if(u<a||u>b+0.05){f.style.opacity=0;return}
  const p=inOut((u-a)/(b-a));
  const x=lerp(from.x,to.x,p),y=lerp(from.y,to.y,p)-Math.sin(Math.PI*p)*arc;
  const k=lerp(1,to.w/from.w,p);
  f.style.width=from.w+'px';f.style.left=(x-from.w/2)+'px';f.style.top=(y-from.h/2)+'px';
  f.style.transform='scale('+k+') rotate('+lerp(-6,0,p)+'deg)';f.style.opacity=p<0.9?1:1-(p-0.9)/0.1;
}
const K={
  step1(s,u){
    const fills=s.el.querySelectorAll('.shirt-fill');let col=SW[0],prev=SW[0],tt=-9;
    for(const [tm,i] of TAPS)if(u>=tm){prev=col;col=SW[i];tt=tm}
    const c=mix(prev,col,ease((u-tt)/0.3));fills.forEach(f=>f.setAttribute('fill',c));
    const sws=s.el.querySelectorAll('.sw');let sel=-1;for(const [tm,i] of TAPS)if(u>=tm)sel=i;sws.forEach((w,i)=>w.classList.toggle('sel',i===sel));
    const szs=s.el.querySelectorAll('.sz');let ss=-1;for(const [tm,i] of SIZE_TAPS)if(u>=tm)ss=i;szs.forEach((w,i)=>w.classList.toggle('sel',i===ss));
    const tap=s.el.querySelector('.tap');let last=null;
    for(const [tm,i] of TAPS)if(u>=tm-0.05)last=[tm,sws[i]];for(const [tm,i] of SIZE_TAPS)if(u>=tm-0.05)last=[tm,szs[i]];
    if(last)tapAt(tap,last[1],u,last[0]);else tap.style.opacity=0;
  },
  step2(s,u){
    const slots=[...s.el.querySelectorAll('.slot')],fl=[...s.el.querySelectorAll('.f2')],an=[...s.el.querySelectorAll('.anchor')],cnt=[...s.el.querySelectorAll('.count em')];
    const T=[1.5,4.5,7.5];
    slots.forEach((sl,i)=>{
      const t0=T[i];
      const fr=rect(an[i]),to=rect(sl.querySelector('.ph'));fr.h=fr.w*1.2;
      flight(fl[i],{x:fr.x,y:fr.y,w:fr.w,h:fr.h},to,t0,t0+0.95,u,60);
      const e=ease((u-t0-0.85)/0.2);sl.querySelector('.fill').style.opacity=e;sl.querySelector('.plus').style.opacity=0.6*(1-e);
      sl.style.borderStyle=u>=t0+0.85?'solid':'dashed';
      sl.querySelector('.fill i b').style.transform='scaleX('+ease((u-t0-1.0)/1.0)+')';
      const c=back((u-t0-2.0)/0.4);const ck=sl.querySelector('.chk');ck.style.opacity=c>0.01?1:0;ck.style.transform='scale('+Math.max(0.001,c)+')';
    });
    let n=0;T.forEach((t0,i)=>{if(u>=t0+2.0)n=i+1});cnt.forEach((c,i)=>c.style.opacity=i+1===n?1:0);
  },
  step3(s,u){
    // Switches between the flat front and back mockups (crossfade with a small dip), each started by a tap on the toggle.
    const FL=[[3.9,'back'],[8.6,'front'],[12.7,'back'],[14.3,'front']],D=0.5;
    const box=s.el.querySelector('.shirtmock');
    const pop=box.style.transform||'';
    const sc=(pop.match(/scale\\(([^)]+)\\)/)||[0,1])[1];
    let face='front',prev=null,p=1;
    FL.forEach(([a,v])=>{if(u>=a){prev=face;face=v;p=clamp((u-a)/D)}});
    const e=inOut(p);
    box.style.transform='scale('+sc+') scale('+(1-0.06*Math.sin(Math.PI*e))+')';
    ['front','back'].forEach(v=>{const g=s.el.querySelector('.face-'+v);const o=v===face?(prev&&prev!==v?e:1):(v===prev?1-e:0);g.style.display=o>0.001?'':'none';g.setAttribute('opacity',o.toFixed(3))});
    s.el.querySelectorAll('.shade').forEach(sh=>sh.setAttribute('opacity','0'));
    s.el.querySelectorAll('.vtog span').forEach(sp=>{const on=sp.dataset.v===face;sp.style.background=on?'#1F5A3D':'transparent';sp.style.color=on?'#fff':'#1F5A3D'});
    let last=null;FL.forEach(([a,v])=>{if(u>=a-0.3)last=[a-0.3,s.el.querySelector('.vtog span[data-v="'+v+'"]')]});
    const tap=s.el.querySelector('.tap');if(last)tapAt(tap,last[1],u,last[0]);else tap.style.opacity=0;
    const PR={chest:2.8,back:7.4,sleeve:11.9};
    s.el.querySelectorAll('.pr').forEach(pr=>{const b=back((u-PR[pr.dataset.p])/0.45);pr.style.opacity=b>0.01?1:0;pr.style.transform='scale('+Math.max(0.001,b)+')'});
    s.el.querySelectorAll('.zone').forEach(z=>{const id=z.id.slice(5);const show=u>0.8&&u<PR[id]+0.1;z.style.opacity=show?0.6+0.4*Math.sin(u*6):0});
    const TAG={chest:[2.9,3.6],back:[7.5,8.3],sleeve:[12.0,12.6]};
    s.el.querySelectorAll('.ztag').forEach(g=>{const [a,b]=TAG[g.dataset.p];const p=back((u-a)/0.4),q=ease((u-b)/0.3);g.style.opacity=u>=a?(1-q):0;g.style.transform='translate(-50%,-50%) scale('+Math.max(0.001,p)+')'});
    const F=[[1.6,2.8,'chest'],[6.2,7.4,'back'],[10.8,11.9,'sleeve']];
    const tcs=[...s.el.querySelectorAll('.tcard')],fl=[...s.el.querySelectorAll('.fly3')];
    F.forEach(([a,b,z],i)=>{const tc=tcs[i];tc.style.opacity=u>=a?0.3:1;if(u>=a-0.05&&u<=b+0.05)flight(fl[i],rect(tc),rect(s.el.querySelector('#zone-'+z)),a,b,u,120);else fl[i].style.opacity=0});
  },
  step4(s,u){
    const bs=[...s.el.querySelectorAll('.psz b')],t0=8.2;
    bs.forEach((b,i)=>b.classList.toggle('sel',u>=t0+0.1&&i===1));
    const tap=s.el.querySelector('.tap');if(u>=t0-0.05)tapAt(tap,bs[1],u,t0);else tap.style.opacity=0;
  },
  step5(s,u){
    const btn=s.el.querySelector('.obtn'),send=btn.querySelector('.send'),sent=btn.querySelector('.sent');
    const t0=2.4;const press=u>=t0&&u<t0+0.25?0.94:1;btn.style.transform='scale('+press+')';
    const e=ease((u-t0-0.15)/0.3);btn.style.background=u>=t0+0.15?mix('${HONEY}','${C.green}',e):'';send.style.opacity=1-e;sent.style.opacity=e;
    const tap=s.el.querySelector('.tap');tapAt(tap,btn,u,t0);
  },
  reveal(s,u){
    const fl=s.el.querySelector('.flash');fl.style.opacity=u>=1.0?0.9*(1-ease((u-1.0)/0.6)):0;
    s.el.querySelectorAll('.cf').forEach(c=>{const d=+c.dataset.d,tt=u-1.2-d;if(tt<0){c.style.opacity=0;return}
      const y=tt*+c.dataset.v,x=Math.sin(tt*3+d*5)*+c.dataset.w;c.style.opacity=y>980?0:1;c.style.transformBox='fill-box';c.style.transformOrigin='center';c.style.transform='translate('+x+'px,'+y+'px) rotate('+(tt*+c.dataset.r)+'deg)'});
  },
  cta(s,u,t){const b=s.el.querySelector('.btn span');const pulse=1+0.035*Math.max(0,Math.sin(((t*2)%1)*Math.PI));if(u>2.2)b.style.transform='scale('+pulse+')'},
};
window.frame=function(t){
  const k=sceneOf(t);
  scenes.forEach((s,i)=>{
    const vis=i===k||(i===k-1&&t-STARTS[k]<0.6);
    s.el.style.display=vis?'block':'none';
    s.el.style.zIndex=i;
    if(i>0)s.el.style.clipPath=i===k?'circle('+(R*inOut((t-s.start)/0.55)).toFixed(1)+'px at '+WX+'px '+WY+'px)':'none';
    if(vis)anim(s,t-s.start,t);
  });
  document.querySelector('.brand').style.opacity=(k>=2&&k<=6)?0.75:0;
};
window.frame(0);`;

  const body = `<div class="stage" dir="${rtl ? "rtl" : "ltr"}" lang="${locale}">${scenes.join("")}<div class="brand">opetlife.ir</div></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}<script>${script}</script></body></html>`;
}

function srt(locale) {
  const ts = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60, r = ms % 1000; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(r).padStart(3, "0")}`; };
  const S = COPY.steps, D = (n) => DIG(locale, n);
  const cues = [[0.2, 2.0, COPY.hook[locale].q], [2.0, 4.0, COPY.hook[locale].sub], [4.2, 8.0, `${COPY.name[locale]}\n${COPY.tagline[locale]}`]];
  const step = (n, start, subs) => { cues.push([start + 0.3, start + 1.2, `${COPY.stepOf[locale](D(n))} · ${S[n - 1].title[locale]}`]); subs.forEach(([a, b, text]) => cues.push([start + a, start + b, text])); };
  step(1, 8, [[1.2, 9.8, S[0].subs[0][locale]]]);
  step(2, 18, [[1.2, 11.8, S[1].subs[0][locale]]]);
  step(3, 30, [[1.2, 7.8, S[2].subs[0][locale]], [8.0, 15.8, S[2].subs[1][locale]]]);
  step(4, 46, [[1.2, 8.6, S[3].subs[0][locale]], [9.2, 13.8, S[3].subs[1][locale]]]);
  step(5, 60, [[1.2, 6.5, S[4].subs[0][locale]], [6.6, 9.8, S[4].ui.note[locale]]]);
  cues.push([71.4, 72.2, COPY.reveal[locale].big], [72.2, 79.8, COPY.reveal[locale].sub]);
  const c = COPY.cta[locale];
  cues.push([81.0, 85.5, `${c.line}\n${c.button}`], [85.5, 89.8, c.share]);
  return cues.map(([a, b, text], i) => `${i + 1}\n${ts(a)} --> ${ts(b)}\n${text}\n`).join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
  const locales = (args[0] || "fa").split(",");
  const formats = (args[1] || "16x9").split(",");
  const music = opt("--music", null);
  const musicStart = Number(opt("--start", "10"));
  const preview = opt("--preview", null);
  fs.mkdirSync(path.join(OUT, "parts"), { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--disable-gpu", "--font-render-hinting=none", "--disable-dev-shm-usage", "--allow-file-access-from-files"] });
  try {
    for (const locale of locales) {
      fs.writeFileSync(path.join(OUT, `setpet-${locale}.srt`), srt(locale));
      for (const fmt of formats) {
        const F = FORMATS[fmt];
        const tmp = path.join(OUT, `.setpet-${locale}-${fmt}-${process.pid}.html`);
        fs.writeFileSync(tmp, reelHtml(locale, fmt));
        const pg = await browser.newPage({ viewport: { width: F.W, height: F.H }, deviceScaleFactor: 1 });
        const errors = [];
        pg.on("pageerror", (e) => errors.push(String(e)));
        await pg.goto(`file://${tmp}`);
        await pg.evaluate(() => document.fonts.ready);
        if (errors.length) throw new Error(errors.join("\n"));
        const names = [fmt, ...(F.extra || []).map((e) => e.name)];
        const sizes = [[F.W, F.H], ...(F.extra || []).map((e) => [e.width, e.height])];
        const partFile = (name, from) => path.join(OUT, "parts", `${locale}-${name}-${String(from).padStart(2, "0")}.bin`);
        if (preview) {
          for (const t of preview.split(",").map(Number)) {
            await pg.evaluate((tt) => window.frame(tt), t);
            await pg.screenshot({ path: path.join(OUT, `prev-${locale}-${fmt}-${t}.png`) });
          }
          if (errors.length) throw new Error(errors.join("\n"));
        } else if (args.includes("--assemble")) {
          const audio = music ? await encodeAudio(pg, music, { start: musicStart, length: DURATION, fadeIn: 0.12, fadeOut: 2.8, targetRms: 0.12, bitrate: 128000 }) : null;
          names.forEach((name, i) => {
            const chunks = [];
            for (let from = 0; from < DURATION; from += 10) {
              const buf = fs.readFileSync(partFile(name, from));
              for (let o = 0; o < buf.length;) { const ts = Number(buf.readBigInt64LE(o)); const key = buf[o + 8] === 1; const len = buf.readUInt32LE(o + 9); chunks.push({ ts, key, data: buf.subarray(o + 13, o + 13 + len) }); o += 13 + len; }
            }
            chunks.sort((a, b) => a.ts - b.ts);
            const r = writeWebm(path.join(OUT, `setpet-${locale}-${name}.webm`), { width: sizes[i][0], height: sizes[i][1], fps: FPS, chunks }, audio || undefined);
            console.log("setpet", locale, name, `${(r.bytes / 1048576).toFixed(1)} MB`, `${(r.durationMs / 1000).toFixed(1)}s`, `${chunks.length} frames`);
          });
        } else {
          const from = Number(opt("--from", "0")), to = Number(opt("--to", String(from + 10)));
          const t0 = Date.now();
          const extra = (F.extra || []).map((e) => ({ width: e.width, height: e.height, bitrate: e.bitrate }));
          const res = await recordFrames(pg, {
            width: F.W, height: F.H, fps: FPS, frames: Math.round((to - from) * FPS), bitrate: F.bitrate, extra,
            drawFrame: (f) => pg.evaluate((t) => window.frame(t), from + f / FPS),
            onFrame: async (f) => {
              if (from === 0 && f === Math.round(2.9 * FPS)) {
                const png = await pg.screenshot({ type: "png" });
                fs.writeFileSync(path.join(OUT, `thumb-${locale}-${fmt}.png`), png);
                await writeWebp(pg, png, path.join(OUT, `poster-${locale}-${fmt}.webp`), 0.85);
              }
            },
          });
          (extra.length ? res : [res]).forEach((chunks, i) => {
            const bufs = chunks.map((c) => { const h = Buffer.alloc(13); h.writeBigInt64LE(BigInt(c.ts + Math.round(from * 1e6))); h[8] = c.key ? 1 : 0; h.writeUInt32LE(c.data.length, 9); return Buffer.concat([h, c.data]); });
            fs.writeFileSync(partFile(names[i], from), Buffer.concat(bufs));
          });
          if (errors.length) throw new Error(errors.join("\n"));
          console.log("part", locale, fmt, `${from}-${to}s`, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
        }
        await pg.close();
        fs.unlinkSync(tmp);
      }
    }
  } finally {
    await browser.close();
  }
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { reelHtml, srt, STARTS, DURATION };
