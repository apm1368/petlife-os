// Stills for the Set Pet guide article (id 33): a text-free cover from the reel's hook scene and a
// "find your pet's size" infographic (pet garments go by size letter with the guide, owner #368 P17) (1080×1350) per language. Usage: node setpet-stills.js [locales]
const fs = require("fs");
const path = require("path");
const { chromium } = require("/opt/petlife-qa/node_modules/playwright-core");
const art = require("./art");
const { reelHtml } = require("./setpet-reel");
const { writeWebp } = require("./encoder");

const OUT = path.join(__dirname, "out", "setpet");
const FONT_DIR = path.join(__dirname, "fonts");
const CHROME = "/root/.cache/ms-playwright/chromium-1140/chrome-linux/chrome";
const C = art.C;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const T = {
  fa: { title: "سایز پتت را برای ست پت پیدا کن", items: [["دور گردن", "دور پایهٔ گردن، جای قلاده؛ به اندازهٔ دو انگشت جا بگذار."], ["دور سینه", "دور پهن‌ترین قسمت سینه، درست پشت دست‌ها."], ["طول پشت", "از پایهٔ گردن تا ابتدای دم."]], tip: "متر نرم · پت آرام · سایز را از جدول انتخاب کن" },
  en: { title: "Find your pet's Set Pet size", items: [["Neck", "Around the base of the neck, where the collar sits. Leave room for two fingers."], ["Chest", "Around the widest part, just behind the front legs."], ["Back length", "From the base of the neck to the base of the tail."]], tip: "Soft tape · calm pet · pick the size in the guide" },
  de: { title: "So findest du die Set-Pet-Größe deines Tiers", items: [["Hals", "Rund um den Halsansatz, wo das Halsband sitzt. Zwei Finger Platz lassen."], ["Brust", "Rund um die breiteste Stelle, direkt hinter den Vorderbeinen."], ["Rückenlänge", "Vom Halsansatz bis zum Schwanzansatz."]], tip: "Weiches Maßband · ruhiges Tier · Größe aus der Tabelle" },
  es: { title: "Encuentra la talla Set Pet de tu mascota", items: [["Cuello", "Alrededor de la base del cuello, donde va el collar. Deja espacio para dos dedos."], ["Pecho", "Alrededor de la parte más ancha, justo detrás de las patas delanteras."], ["Largo del lomo", "Desde la base del cuello hasta el nacimiento de la cola."]], tip: "Cinta flexible · mascota tranquila · talla según la guía" },
  ar: { title: "اعرف مقاس حيوانك في Set Pet", items: [["الرقبة", "حول قاعدة الرقبة حيث يوضع الطوق، مع ترك مسافة إصبعين."], ["الصدر", "حول أعرض جزء، خلف الساقين الأماميتين مباشرة."], ["طول الظهر", "من قاعدة الرقبة حتى بداية الذيل."]], tip: "شريط مرن · حيوان هادئ · اختر المقاس من الجدول" },
  nl: { title: "Vind de Set Pet-maat van je huisdier", items: [["Nek", "Rond de basis van de nek, waar de halsband zit. Laat ruimte voor twee vingers."], ["Borst", "Rond het breedste deel, net achter de voorpoten."], ["Ruglengte", "Van de basis van de nek tot het begin van de staart."]], tip: "Zacht meetlint · rustig huisdier · maat uit de tabel" },
};
const DIG = (l, n) => (l === "fa" ? new Intl.NumberFormat("fa-IR").format(n) : String(n));

function infographicHtml(l) {
  const rtl = l === "fa" || l === "ar";
  const t = T[l];
  const num = (n, x, y) => `<g transform="translate(${x} ${y})"><circle r="30" fill="${C.forest}" stroke="#fff" stroke-width="5"/><text y="12" text-anchor="middle" font-size="34" font-weight="900" fill="#fff" font-family="Vazirmatn">${DIG(l, n)}</text></g>`;
  const tape = (d) => `<path d="${d}" stroke="${C.honey}" stroke-width="13" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${C.charcoal}" stroke-width="13" stroke-dasharray="2 12" fill="none" opacity=".55"/>`;
  const dog = `<g transform="translate(540 630) scale(0.95)">${art.dog({})}${tape("M-94 -240 A94 20 0 0 0 94 -240")}${tape("M-126 -152 A126 24 0 0 0 126 -152")}${tape("M-168 -250 L-168 -30")}<path d="M-186 -250 h36 M-186 -30 h36" stroke="${C.charcoal}" stroke-width="7" stroke-linecap="round"/>${num(1, 122, -250)}${num(2, 156, -150)}${num(3, -168, -140)}</g>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Vazirmatn;src:url(file://${FONT_DIR}/vazirmatn-arabic-wght-normal.woff2) format("woff2");font-weight:100 900;unicode-range:U+0600-06FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FEFF}
@font-face{font-family:Vazirmatn;src:url(file://${FONT_DIR}/vazirmatn-latin-wght-normal.woff2) format("woff2");font-weight:100 900}
*{box-sizing:border-box;margin:0;padding:0}html,body{width:1080px;height:1350px;overflow:hidden}
body{font-family:Vazirmatn,sans-serif;color:#1E241F;position:relative}
svg{position:absolute;inset:0}
h1{position:absolute;top:44px;left:70px;right:70px;text-align:center;font-size:58px;line-height:1.2;font-weight:900;color:#1F5A3D;text-wrap:balance}h1 i{font-style:normal;white-space:nowrap}
.list{position:absolute;left:60px;right:60px;top:676px;display:flex;flex-direction:column;gap:16px}
.it{display:flex;align-items:center;gap:24px;background:#fff;border:4px solid #1E241F;border-radius:28px;padding:16px 26px;box-shadow:0 8px 0 rgba(30,36,31,.1)}
.it b{flex:none;width:64px;height:64px;border-radius:50%;background:#1F5A3D;color:#fff;font-size:36px;font-weight:900;display:flex;align-items:center;justify-content:center}
.it div{display:flex;flex-direction:column;gap:4px}.it strong{font-size:38px;font-weight:900;color:#1F5A3D}.it span{font-size:29px;font-weight:600;line-height:1.4;color:#3B4239}
.tip{margin-top:8px;text-align:center;font-size:30px;font-weight:800;color:#3B4239}
.brand{position:absolute;bottom:44px;${rtl ? "left" : "right"}:50px;font-size:24px;font-weight:800;color:#1F5A3D;opacity:.7;direction:ltr}
</style></head><body dir="${rtl ? "rtl" : "ltr"}" lang="${l}"><svg width="1080" height="1350" viewBox="0 0 1080 1350">${art.background("honey", 1080, 1350)}${dog}</svg>
<h1>${esc(t.title).replace(/Set Pet/g, "Set\u00a0Pet").replace(/(\S+-\S+)/g, "<i>$1</i>")}</h1><div class="list">${t.items.map(([a, b], i) => `<div class="it"><b>${DIG(l, i + 1)}</b><div><strong>${esc(a)}</strong><span>${esc(b)}</span></div></div>`).join("")}<p class="tip">${esc(t.tip)}</p></div></body></html>`;
}

async function main() {
  const locales = (process.argv[2] || "fa,en,de,es,ar,nl").split(",");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--disable-gpu", "--font-render-hinting=none", "--disable-dev-shm-usage", "--allow-file-access-from-files"] });
  try {
    // Cover: hook scene at 3.0 s without any text (the cover is shared by every language).
    const tmp = path.join(OUT, `.cover-${process.pid}.html`);
    fs.writeFileSync(tmp, reelHtml("en", "16x9").replace("</style>", ".ovl,.brand,.pbackw{display:none!important}</style>"));
    const pg = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await pg.goto(`file://${tmp}`);
    await pg.evaluate(() => document.fonts.ready);
    await pg.evaluate(() => window.frame(3.0));
    const png = await pg.screenshot({ type: "png" });
    await writeWebp(pg, png, path.join(OUT, "cover-33.webp"), 0.85);
    fs.unlinkSync(tmp);
    for (const l of locales) {
      const f = path.join(OUT, `.info-${l}-${process.pid}.html`);
      fs.writeFileSync(f, infographicHtml(l));
      await pg.setViewportSize({ width: 1080, height: 1350 });
      await pg.goto(`file://${f}`);
      await pg.evaluate(() => document.fonts.ready);
      const shot = await pg.screenshot({ type: "png" });
      await writeWebp(pg, shot, path.join(OUT, `info-33-${l}.webp`), 0.88);
      fs.writeFileSync(path.join(OUT, `info-33-${l}.png`), shot);
      fs.unlinkSync(f);
      console.log("infographic", l);
    }
    await pg.close();
  } finally {
    await browser.close();
  }
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { infographicHtml, T };
