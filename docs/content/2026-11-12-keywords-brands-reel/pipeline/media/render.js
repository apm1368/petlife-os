// Renders covers (1600×900 webp), per-language infographics (1080×1350 webp), per-language motion-graphic
// videos (1280×720 H.264, 24 fps) and their posters, from art.js + scenes.js + the articles' @@scenes text.
// Usage: node render.js covers|infographics|videos|all [ids=1,2] [locales=fa,en]
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("/opt/petlife-qa/node_modules/playwright-core");
const art = require("./art");
const SCENES = Object.assign({}, require("./scenes"), require("./scenes-b"));
const { writeWebp, recordFrames, writeWebm } = require("./encoder");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(__dirname, "out");
const CHROME = "/root/.cache/ms-playwright/chromium-1140/chrome-linux/chrome";
const FONT_DIR = path.join(__dirname, "fonts");
const BRAND = "/root/opetlife-brand-kit/svg";
const FPS = 24;
const RTL = new Set(["fa"]);
const DIGITS = { fa: (n) => new Intl.NumberFormat("fa-IR").format(n), en: String, de: String, es: String };
const DOMAIN = "opetlife.ir";

function loadArticle(id, locale) {
  const file = path.join(ROOT, "articles", String(id), `${locale}.md`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(execFileSync("python3", ["-I", path.join(ROOT, "tools/md2rich.py"), file, "--json"], { encoding: "utf8" }));
}

function logo(locale) {
  const file = path.join(BRAND, locale === "fa" ? "lockup-fa.svg" : "lockup-en.svg");
  return fs.readFileSync(file, "utf8").replace(/<\?xml[^>]*>/, "").replace(/<!--[\s\S]*?-->/g, "");
}

const FONT_CSS = `
@font-face{font-family:Vazirmatn;src:url(file://${FONT_DIR}/vazirmatn-arabic-wght-normal.woff2) format("woff2");font-weight:100 900;unicode-range:U+0600-06FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FEFF}
@font-face{font-family:Vazirmatn;src:url(file://${FONT_DIR}/vazirmatn-latin-wght-normal.woff2) format("woff2");font-weight:100 900}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Vazirmatn,sans-serif;background:#FFFBF5;color:#1E241F;overflow:hidden}`;

function page(body, w, h, extraCss = "", script = "") {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONT_CSS}
html,body{width:${w}px;height:${h}px}${extraCss}</style></head><body>${body}<script>${script}</script></body></html>`;
}

// ---------------- cover ----------------
function coverHtml(id) {
  const cfg = SCENES[id];
  return page(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">${art.scene(cfg)}</svg>`, 1600, 900);
}

// ---------------- infographic ----------------
function infographicHtml(id, locale, a) {
  const cfg = SCENES[id];
  const rtl = RTL.has(locale);
  const steps = a.scenes.slice(1);
  const n = DIGITS[locale];
  const body = `<div class="ig" dir="${rtl ? "rtl" : "ltr"}" lang="${locale}">
    <div class="art"><svg xmlns="http://www.w3.org/2000/svg" viewBox="160 110 1280 760" preserveAspectRatio="xMidYMid slice">${art.scene(cfg)}</svg></div>
    <div class="sheet">
      <h1>${esc(a.meta.title)}</h1>
      <p class="hook">${esc(a.scenes[0].heading)} — ${esc(a.scenes[0].line)}</p>
      <ol>${steps.map((s, i) => `<li><span class="num">${n(i + 1)}</span><div><b>${esc(s.heading)}</b><span>${esc(s.line)}</span></div></li>`).join("")}</ol>
      <footer><div class="logo">${logo(locale)}</div><span>${DOMAIN}</span></footer>
    </div></div>`;
  const css = `
  .ig{width:1080px;height:1350px;display:flex;flex-direction:column;background:#FFFBF5}
  .art{height:500px;overflow:hidden;border-radius:0 0 48px 48px}
  .art svg{width:1080px;height:500px;display:block}
  .sheet{flex:1;display:flex;flex-direction:column;padding:34px 60px 30px;gap:18px}
  h1{font-size:${a.meta.title.length > 70 ? 38 : 44}px;line-height:1.45;font-weight:850;color:#1F5A3D}
  .hook{font-size:25px;line-height:1.6;color:#5B6159;font-weight:500}
  ol{list-style:none;display:flex;flex-direction:column;gap:14px;flex:1}
  li{display:flex;gap:18px;align-items:flex-start;background:#fff;border:2px solid #EFE6D6;border-radius:26px;padding:16px 22px}
  .num{flex:none;width:52px;height:52px;border-radius:50%;background:#F2B544;color:#1E241F;font-weight:900;font-size:28px;display:flex;align-items:center;justify-content:center}
  li b{display:block;font-size:28px;line-height:1.5;color:#1F5A3D;font-weight:800}
  li span{display:block;font-size:22px;line-height:1.6;color:#3B4239}
  footer{display:flex;align-items:center;justify-content:space-between;gap:20px;border-top:2px solid #EFE6D6;padding-top:18px}
  .logo svg{height:54px;width:auto;display:block}
  footer span{font-size:24px;font-weight:700;color:#1F5A3D;direction:ltr}`;
  return page(body, 1080, 1350, css);
}

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------------- video ----------------
function videoTimeline(a) {
  const tips = a.scenes.slice(1);
  const intro = 4.2;
  const tip = 3.8;
  const outro = 3.6;
  return { intro, tip, outro, tips, duration: intro + tips.length * tip + outro };
}

function videoHtml(id, locale, a) {
  const cfg = SCENES[id];
  const rtl = RTL.has(locale);
  const tl = videoTimeline(a);
  const n = DIGITS[locale];
  // Full-width art above a lower-third text card (subtitle style), mirrored only in text direction.
  const artTransform = "translate(222 58) scale(0.68)";
  const sceneInner = art.scene(cfg).replace(/^[\s\S]*?(<g class="layer-back">)/, "$1");
  const bg = art.background(cfg.palette);
  const cards = [
    `<div class="card hook" data-i="0"><div><h2>${esc(a.scenes[0].heading)}</h2><p>${esc(a.scenes[0].line)}</p></div></div>`,
    ...tl.tips.map((s, i) => `<div class="card tip${/!|⚠|warn|هشدار|Achtung|Atención|Warn|nunca|never|nie|هرگز/i.test(s.heading) && i === tl.tips.length - 1 ? " warn" : ""}" data-i="${i + 1}"><span class="num">${n(i + 1)}</span><div><h3>${esc(s.heading)}</h3><p>${esc(s.line)}</p></div></div>`),
    `<div class="card outro" data-i="${tl.tips.length + 1}"><div class="logo">${logo(locale)}</div><div><p class="t">${esc(a.meta.videoTitle)}</p><p class="d">${DOMAIN}</p></div></div>`,
  ].join("");
  const dots = tl.tips.map((_, i) => `<i data-d="${i + 1}"></i>`).join("");
  const body = `<div class="stage" dir="${rtl ? "rtl" : "ltr"}" lang="${locale}">
    <svg class="bg" xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1600 900">${bg}<g id="art" transform="${artTransform}">${sceneInner}</g></svg>
    <div class="panel">${cards}</div>
    <div class="dots">${dots}</div>
    <div class="brand">${DOMAIN}</div>
  </div>`;
  const css = `
  .stage{position:relative;width:1280px;height:720px;overflow:hidden}
  .bg{position:absolute;inset:0}
  .panel{position:absolute;left:80px;right:80px;bottom:54px;height:162px}
  .card{position:absolute;inset:0;display:flex;align-items:center;gap:26px;opacity:0;background:rgba(255,255,255,.95);border-radius:34px;padding:20px 36px;box-shadow:0 16px 46px rgba(31,90,61,.16);border:2px solid #F0E6D4}
  .card h2{font-size:${a.scenes[0].heading.length > 30 ? 40 : 46}px;line-height:1.35;font-weight:900;color:#1F5A3D}
  .card h3{font-size:${Math.max(...tl.tips.map((t) => t.heading.length)) > 28 ? 34 : 38}px;line-height:1.35;font-weight:850;color:#1F5A3D}
  .card p{font-size:${Math.max(...a.scenes.map((t) => t.line.length)) > 66 ? 23 : 26}px;line-height:1.55;color:#3B4239;margin-top:6px;font-weight:500}
  .card .num{flex:none;display:inline-flex;width:74px;height:74px;border-radius:50%;background:#F2B544;color:#1E241F;font-size:38px;font-weight:900;align-items:center;justify-content:center}
  .card.warn{border-color:#E5675A}.card.warn .num{background:#E5675A;color:#fff}
  .card.outro{justify-content:center;gap:34px}
  .card.outro .logo svg{height:84px;width:auto;display:block}
  .card.outro .t{font-size:28px;font-weight:800;color:#1F5A3D;margin:0}
  .card.outro .d{font-size:28px;font-weight:800;color:#C98B3A;margin-top:4px;direction:ltr;text-align:start}
  .dots{position:absolute;bottom:26px;left:0;right:0;display:flex;justify-content:center;gap:10px}
  .dots i{width:14px;height:14px;border-radius:7px;background:#1F5A3D;opacity:.18;display:block}
  .brand{position:absolute;top:24px;${rtl ? "left" : "right"}:34px;font-size:22px;font-weight:800;color:#1F5A3D;opacity:.75;direction:ltr}
`;
  const script = `
  const TL=${JSON.stringify({ intro: tl.intro, tip: tl.tip, outro: tl.outro, count: tl.tips.length, duration: tl.duration })};
  const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
  const easeOut=t=>1-Math.pow(1-clamp(t),3);
  const back=t=>{t=clamp(t);const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2)};
  const actors=[...document.querySelectorAll('#art .actor')].map(el=>({el,base:el.getAttribute('transform'),head:el.querySelector('#head'),tail:el.querySelector('#tail'),eyes:el.querySelector('#eyes'),paw:el.querySelector('#paw')}));
  const propsEls=[...document.querySelectorAll('#art .prop')].map((el,i)=>({el,base:el.getAttribute('transform'),float:el.classList.contains('float'),i}));
  const blobs=[...document.querySelectorAll('.blob')];
  const cards=[...document.querySelectorAll('.card')];
  const dots=[...document.querySelectorAll('.dots i')];
  const dirX=${rtl ? 1 : -1};
  function activeIndex(t){if(t<TL.intro)return 0;const k=Math.floor((t-TL.intro)/TL.tip);return k<TL.count?k+1:TL.count+1}
  function startOf(i){return i===0?0:i<=TL.count?TL.intro+(i-1)*TL.tip:TL.intro+TL.count*TL.tip}
  function endOf(i){return i===0?TL.intro:i<=TL.count?startOf(i)+TL.tip:TL.duration+1}
  window.frame=function(t){
    blobs.forEach((b,i)=>{b.style.transformBox='fill-box';b.style.transformOrigin='center';b.style.transform='scale('+(easeOut(t/0.9)*(1+0.03*Math.sin(t*0.9+i)))+')'});
    actors.forEach((a,i)=>{
      const ap=back((t-0.25-i*0.15)/0.7);
      const tipIdx=activeIndex(t);const local=t-startOf(tipIdx);
      const hop=tipIdx>0&&tipIdx<=TL.count?Math.max(0,Math.sin(clamp(local/0.45)*Math.PI))*14:0;
      const breathe=1+0.012*Math.sin(t*2.4+i);
      const k1=Math.max(0.001,ap);a.el.style.opacity=ap<0.01?0:1;
      a.el.setAttribute('transform',a.base+' translate(0 '+(-hop)+') scale('+k1+' '+(k1*breathe)+')');
      if(a.head){const tilt=Math.sin(t*1.3+i)*3+(tipIdx>0&&tipIdx<=TL.count?Math.sin(clamp(local/0.8)*Math.PI)*7*(tipIdx%2?1:-1):0);a.head.style.transform='rotate('+tilt+'deg)'}
      if(a.tail){a.tail.style.transform='rotate('+(Math.sin(t*9+i)*7)+'deg)'}
      if(a.eyes){const b=((t+i*0.7)%3.1);a.eyes.style.transformBox='fill-box';a.eyes.style.transformOrigin='center';a.eyes.style.transform='scaleY('+(b<0.12?0.15:1)+')'}
      if(a.paw){a.paw.style.transform='rotate('+(Math.sin(t*3)*6)+'deg)'}
    });
    propsEls.forEach(p=>{
      const ap=back((t-0.55-p.i*0.12)/0.6);
      const bob=p.float?Math.sin(t*2+p.i)*10:0;
      const tipIdx=activeIndex(t);const local=t-startOf(tipIdx);
      const pulse=(tipIdx>0&&tipIdx<=TL.count&&((tipIdx-1)%Math.max(1,propsEls.length))===p.i)?1+0.12*Math.sin(clamp(local/0.6)*Math.PI):1;
      p.el.style.opacity=ap<0.01?0:1;
      p.el.setAttribute('transform','translate(0 '+bob+') '+p.base+' scale('+Math.max(0.001,ap*pulse)+')');
    });
    cards.forEach((c,i)=>{
      const s=startOf(i),e=endOf(i);
      const inP=easeOut((t-s-(i===0?0.6:0))/0.5);const outP=easeOut((t-(e-0.4))/0.4);
      const vis=clamp(inP-outP);
      const y=(1-inP)*36-outP*18;
      c.style.opacity=vis;c.style.transform='translateY('+y+'px) scale('+(0.97+0.03*inP)+')';
      const num=c.querySelector('.num');if(num){num.style.transform='scale('+Math.max(0.001,back((t-s-0.15)/0.45))+')'}
    });
    const k=activeIndex(t);dots.forEach((d,i)=>{d.style.opacity=(i+1===k?1:(i+1<k?0.45:0.18));d.style.width=(i+1===k?34:14)+'px'});
  };
  window.frame(0);`;
  return page(body, 1280, 720, css, script);
}

// ---------------- runners ----------------
async function withBrowser(fn) {
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--disable-gpu", "--font-render-hinting=none", "--disable-dev-shm-usage", "--allow-file-access-from-files"] });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

async function shoot(browser, html, w, h, file) {
  const tmp = path.join(OUT, `.tmp-${process.pid}.html`);
  fs.writeFileSync(tmp, html);
  const pg = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await pg.goto(`file://${tmp}`);
  await pg.evaluate(() => document.fonts.ready);
  const png = await pg.screenshot({ type: "png" });
  await writeWebp(pg, png, file, 0.84);
  await pg.close();
}

async function renderVideo(browser, id, locale, a, file, posterFile) {
  const tl = videoTimeline(a);
  const tmp = path.join(OUT, `.tmp-video-${process.pid}.html`);
  fs.writeFileSync(tmp, videoHtml(id, locale, a));
  const pg = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await pg.goto(`file://${tmp}`);
  await pg.evaluate(() => document.fonts.ready);
  const frames = Math.round(tl.duration * FPS);
  const posterAt = Math.round((tl.intro + tl.tip * 0.6) * FPS);
  const chunks = await recordFrames(pg, {
    width: 1280, height: 720, fps: FPS, frames, bitrate: 500_000,
    drawFrame: (f) => pg.evaluate((t) => window.frame(t), f / FPS),
    onFrame: async (f) => { if (f === posterAt && posterFile) await writeWebp(pg, await pg.screenshot({ type: "png" }), posterFile, 0.82); },
  });
  writeWebm(file, { width: 1280, height: 720, fps: FPS, chunks });
  await pg.close();
  return tl.duration;
}

async function main() {
  const [what = "all", idsArg, localesArg] = process.argv.slice(2);
  const ids = idsArg && idsArg !== "all" ? idsArg.split(",").map(Number) : Object.keys(SCENES).map(Number);
  const locales = localesArg ? localesArg.split(",") : ["fa", "en", "de", "es"];
  for (const dir of ["covers", "infographics", "videos", "posters"]) fs.mkdirSync(path.join(OUT, dir), { recursive: true });
  fs.mkdirSync(path.join(OUT, "manifest"), { recursive: true });
  const manifestFor = (id) => path.join(OUT, "manifest", `${id}.json`);
  const manifest = {};
  for (const id of ids) manifest[id] = fs.existsSync(manifestFor(id)) ? JSON.parse(fs.readFileSync(manifestFor(id), "utf8")) : { locales: {} };
  await withBrowser(async (browser) => {
    for (const id of ids) {
      if (what === "covers" || what === "all") {
        const file = path.join(OUT, "covers", `${id}.webp`);
        await shoot(browser, coverHtml(id), 1600, 900, file);
        manifest[id].cover = { file, width: 1600, height: 900, alt: SCENES[id].alt };
        console.log("cover", id);
      }
      for (const locale of locales) {
        const a = loadArticle(id, locale);
        if (!a) { console.log("skip (no article)", id, locale); continue; }
        const entry = (manifest[id].locales[locale] = manifest[id].locales[locale] || {});
        const force = process.env.FORCE === "1";
        if ((what === "infographics" || what === "all") && (force || !entry.infographic || !fs.existsSync(entry.infographic.file))) {
          const file = path.join(OUT, "infographics", `${id}-${locale}.webp`);
          await shoot(browser, infographicHtml(id, locale, a), 1080, 1350, file);
          entry.infographic = { file, width: 1080, height: 1350, alt: a.meta.infographicAlt };
          console.log("infographic", id, locale);
        }
        if ((what === "videos" || what === "all") && (force || !entry.video || !fs.existsSync(entry.video.file))) {
          const file = path.join(OUT, "videos", `${id}-${locale}.webm`);
          const poster = path.join(OUT, "posters", `${id}-${locale}.webp`);
          const t0 = Date.now();
          const duration = await renderVideo(browser, id, locale, a, file, poster);
          entry.video = { file, poster, width: 1280, height: 720, durationSeconds: Math.round(duration), title: a.meta.videoTitle, description: a.meta.videoDescription };
          console.log("video", id, locale, `${Math.round(duration)}s`, `${((Date.now() - t0) / 1000).toFixed(0)}s render`, `${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
        }
        fs.writeFileSync(manifestFor(id), JSON.stringify(manifest[id], null, 1));
      }
      fs.writeFileSync(manifestFor(id), JSON.stringify(manifest[id], null, 1));
    }
  });
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { coverHtml, infographicHtml, videoHtml };
