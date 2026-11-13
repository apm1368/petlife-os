// One-minute reel "10 searches of dog and cat owners" (countdown 10 → 1), rendered frame by frame in Chromium and
// encoded to WebM (VP9 + Opus) without ffmpeg. Original vector art from art.js; copy from reel-copy.js.
// Usage: node reel.js <fa,en,de,es> <9x16,16x9,site> [--music <file.mp3>] [--start <sec>] [--preview <t1,t2,...>]
// Outputs out/reel/reel-<locale>-<format>.webm, a poster/thumbnail per version and reel-<locale>.srt.
const fs = require("fs");
const path = require("path");
const { chromium } = require("/opt/petlife-qa/node_modules/playwright-core");
const art = require("./art");
const SB = require("./scenes-b");
const COPY = require("./reel-copy");
const { recordFrames, encodeAudio, writeWebm, writeWebp } = require("./encoder");

const OUT = path.join(__dirname, "out", "reel");
const FONT_DIR = path.join(__dirname, "fonts");
const BRAND = "/root/opetlife-brand-kit/svg";
const CHROME = "/root/.cache/ms-playwright/chromium-1140/chrome-linux/chrome";
const FPS = 30;
const DURATION = 60;
const FORMATS = {
  "9x16": { W: 1080, H: 1920, layout: "p", zoom: 1, bitrate: 5_000_000 },
  "16x9": { W: 1920, H: 1080, layout: "l", zoom: 1, bitrate: 5_000_000, extra: [{ name: "site", width: 1280, height: 720, bitrate: 1_300_000 }] },
  site: { W: 1280, H: 720, layout: "l", zoom: 2 / 3, bitrate: 1_300_000 },
};
// Scene starts (s): hook, logo, 10 countdown scenes of 4 s, recap, call to action.
const STARTS = [0, 4, ...Array.from({ length: 10 }, (_, i) => 6 + i * 4), 46, 52];
const DIG = (locale, n) => (locale === "fa" ? new Intl.NumberFormat("fa-IR").format(n) : String(n));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function svgFile(name) {
  return fs.readFileSync(path.join(BRAND, name), "utf8").replace(/<\?xml[^>]*>/, "").replace(/<!--[\s\S]*?-->/g, "");
}
function lockup(locale, white) {
  const file = `lockup-${locale === "fa" ? "fa" : "en"}${white ? "-white" : ""}.svg`;
  return svgFile(file).replace(/<path\b[^>]*\/>/g, (p) => `<g class="lp">${p}</g>`);
}

// Art region of a scene (source crop in 1600×900 scene space → destination box in output pixels).
function placeArt(cfg, crop, dest) {
  const k = dest.w / crop.w;
  const inner = art.scene(cfg).replace(/^[\s\S]*?(<g class="layer-back">)/, "$1");
  return `<g transform="translate(${(dest.x - crop.x * k).toFixed(1)} ${(dest.y - crop.y * k).toFixed(1)}) scale(${k.toFixed(4)})">${inner}</g>`;
}

// Horizontal crop that keeps every character and prop of a scene in frame, centred on the composition.
function autoCrop(cfg, minW, y) {
  const xs = [];
  for (const c of cfg.chars || []) xs.push(c.x - 175 * c.s, c.x + 175 * c.s);
  for (const p of [...(cfg.props || []), ...(cfg.back || [])]) { const r = (p.name === "car" ? 190 : p.name === "clinic" ? 175 : p.name === "house" || p.name === "litterBox" ? 150 : 110) * (p.s || 1); xs.push(p.x - r, p.x + r); }
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const w = Math.max(minW, hi - lo + 90);
  return { x: (lo + hi) / 2 - w / 2, y, w };
}

const LAYOUT = {
  p: {
    count: { minW: 1266, y: 150, dest: { x: 0, y: 470, w: 1080 } },
    hook: { crop: { x: 260, y: 200, w: 1080 }, dest: { x: 0, y: 760, w: 1080 } },
    cta: { crop: { x: 400, y: 380, w: 800 }, dest: { x: 140, y: 900, w: 800 } },
    wipe: (rtl) => ({ x: rtl ? 925 : 155, y: 371 }),
  },
  l: {
    count: { minW: 1380, y: 150, dest: { x: 250, y: 185, w: 1420 } },
    hook: { crop: { x: 160, y: 300, w: 1300 }, dest: { x: 310, y: 440, w: 1300 } },
    cta: { crop: { x: 420, y: 380, w: 760 }, dest: { x: 686, y: 620, w: 547 } },
    wipe: (rtl) => ({ x: rtl ? 1725 : 195, y: 135 }),
  },
};

function reelHtml(locale, fmt) {
  const F = FORMATS[fmt];
  const L = LAYOUT[F.layout];
  const rtl = locale === "fa" || locale === "ar";
  const W = F.layout === "p" ? 1080 : 1920;
  const H = F.layout === "p" ? 1920 : 1080;
  const items = COPY.items;
  const maxR = Math.hypot(W, H);
  const wipe = L.wipe(rtl);

  const hookCfg = { palette: "honey", chars: [{ type: "dog", x: 560, y: 790, s: 1.15, expr: "alert" }, { type: "cat", x: 900, y: 790, s: 1.0, flip: true }], props: [{ name: "question", x: 730, y: 330, s: 1.15, float: true }, { name: "magnifier", x: 1130, y: 360, s: 0.9, float: true }, { name: "sparkles", x: 360, y: 330, s: 0.9, float: true }] };
  const ctaCfg = { palette: "honey", chars: [{ type: "dog", x: 640, y: 790, s: 1.0 }, { type: "cat", x: 940, y: 790, s: 0.9, flip: true }], props: [{ name: "heart", x: 790, y: 420, s: 0.9, float: true }] };
  const recapCfg = { palette: "mint", chars: [], props: [] };

  const scenesSvg = [];
  const bg = (palette) => art.background(palette, W, H);
  scenesSvg.push(`<g id="sc0">${bg("honey")}${placeArt(hookCfg, L.hook.crop, L.hook.dest)}</g>`);
  scenesSvg.push(`<g id="sc1" clip-path="url(#c1)"><rect width="${W}" height="${H}" fill="#FFFBF5"/><circle class="blob" cx="${W * 0.2}" cy="${H * 0.25}" r="${H * 0.22}" fill="#FCE3B0"/><circle class="blob" cx="${W * 0.85}" cy="${H * 0.8}" r="${H * 0.26}" fill="#DDEFD7"/></g>`);
  items.forEach((it, i) => {
    const cfg = SB[it.article];
    scenesSvg.push(`<g id="sc${i + 2}" clip-path="url(#c${i + 2})">${bg(cfg.palette)}${placeArt(cfg, autoCrop(cfg, L.count.minW, L.count.y), L.count.dest)}</g>`);
  });
  scenesSvg.push(`<g id="sc12" clip-path="url(#c12)">${bg(recapCfg.palette)}</g>`);
  scenesSvg.push(`<g id="sc13" clip-path="url(#c13)"><rect width="${W}" height="${H}" fill="#1F5A3D"/><circle class="blob" cx="${W * 0.15}" cy="${H * 0.15}" r="${H * 0.25}" fill="#2E7A54"/><circle class="blob" cx="${W * 0.9}" cy="${H * 0.9}" r="${H * 0.3}" fill="#2B6E4C"/>${placeArt(ctaCfg, L.cta.crop, L.cta.dest)}</g>`);
  const clips = STARTS.map((_, k) => (k === 0 ? "" : `<clipPath id="c${k}"><circle id="cc${k}" cx="${wipe.x}" cy="${wipe.y}" r="0"/></clipPath>`)).join("");

  const h = COPY.hook[locale];
  const tipSpans = (s) => s.split(/\s+/).map((w) => `<span class="w">${esc(w)}</span>`).join(" ");
  const countHtml = items.map((it, i) => `
    <div class="ov count" data-k="${i + 2}">
      <div class="badge"><small>${esc(COPY.rankLabel[locale])}</small><b>${DIG(locale, it.rank)}</b></div>
      <div class="search"><span class="mag"></span><span class="q" data-full="${esc(it.kw[locale])}"></span><i class="caret"></i></div>
      <div class="sub"><p>${tipSpans(it.tip[locale])}</p></div>
    </div>`).join("");
  const recapChips = items.map((it) => `<div class="chip"><b>${DIG(locale, it.rank)}</b><span>${esc(it.kw[locale])}</span></div>`).join("");
  const c = COPY.cta[locale];

  const css = `
@font-face{font-family:Vazirmatn;src:url(file://${FONT_DIR}/vazirmatn-arabic-wght-normal.woff2) format("woff2");font-weight:100 900;unicode-range:U+0600-06FF,U+200C-200E,U+2010-2011,U+204F,U+2E41,U+FB50-FDFF,U+FE70-FEFF}
@font-face{font-family:Vazirmatn;src:url(file://${FONT_DIR}/vazirmatn-latin-wght-normal.woff2) format("woff2");font-weight:100 900}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${F.W}px;height:${F.H}px;overflow:hidden;background:#FFFBF5}
body{font-family:Vazirmatn,sans-serif;color:#1E241F}
.stage{position:absolute;left:0;top:0;width:${W}px;height:${H}px;overflow:hidden;transform:scale(${F.zoom});transform-origin:0 0}
svg.art{position:absolute;inset:0}
.ov{position:absolute;inset:0;opacity:0}
.progress{position:absolute;display:flex;gap:8px;direction:ltr}
.progress i{flex:1;border-radius:6px;background:rgba(31,90,61,.18);overflow:hidden;position:relative}
.progress i b{position:absolute;inset:0;background:#1F5A3D;transform-origin:${rtl ? "right" : "left"};transform:scaleX(0)}
.badge{position:absolute;border-radius:50%;background:#F2B544;border:6px solid #1E241F;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 14px 0 rgba(30,36,31,.16)}
.badge small{font-weight:800;color:#1E241F;opacity:.75;line-height:1}
.badge b{font-weight:900;color:#1E241F;line-height:1.05}
.search{position:absolute;display:flex;align-items:center;gap:22px;background:#fff;border:5px solid #1E241F;border-radius:999px;box-shadow:0 12px 0 rgba(30,36,31,.14)}
.search .mag{flex:none;border:7px solid #1F5A3D;border-radius:50%;position:relative}
.search .mag:after{content:"";position:absolute;width:7px;border-radius:4px;background:#1F5A3D;transform:rotate(-45deg)}
.search .q{font-weight:800;color:#1F5A3D;white-space:nowrap;overflow:hidden}
.search .caret{flex:none;width:6px;border-radius:3px;background:#1F5A3D}
.sub{position:absolute;left:0;right:0;display:flex;justify-content:center}
.sub p{background:rgba(30,36,31,.82);color:#fff;border-radius:28px;font-weight:800;text-align:center;text-wrap:balance}
.sub .w{display:inline-block;opacity:0}
.hook .q1{position:absolute;left:0;right:0;text-align:center;font-weight:900;color:#1F5A3D;text-wrap:balance}
.hook .q1 .w{display:inline-block;opacity:0}
.hook .q2{position:absolute;left:0;right:0;display:flex;justify-content:center}
.hook .q2 span{background:#F2B544;border:5px solid #1E241F;border-radius:22px;font-weight:900;color:#1E241F;box-shadow:0 10px 0 rgba(30,36,31,.15)}
.note{position:absolute;left:0;right:0;text-align:center;font-weight:600;color:#3B4239;opacity:.8}
.logo{position:absolute;left:0;right:0;display:flex;flex-direction:column;align-items:center}
.logo svg{display:block;width:auto}
.logo .lp{transform-box:fill-box;transform-origin:center}
.logo p{font-weight:800;color:#C98B3A;direction:ltr}
.recap h2{position:absolute;left:0;right:0;text-align:center;font-weight:900;color:#1F5A3D}
.recap .grid{position:absolute;display:grid;direction:${rtl ? "rtl" : "ltr"}}
.chip{display:flex;align-items:center;gap:18px;background:#fff;border:4px solid #1E241F;border-radius:999px;opacity:0;box-shadow:0 8px 0 rgba(30,36,31,.12)}
.chip b{flex:none;border-radius:50%;background:#F2B544;display:flex;align-items:center;justify-content:center;font-weight:900}
.chip{min-width:0}.chip span{min-width:0;font-weight:800;color:#1F5A3D;line-height:1.15;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.cta .logo svg{filter:drop-shadow(0 6px 0 rgba(0,0,0,.12))}
.cta .line{position:absolute;left:0;right:0;text-align:center;color:#fff;font-weight:850;text-wrap:balance}
.cta .btn{position:absolute;left:0;right:0;display:flex;justify-content:center}
.cta .btn span{background:#F2B544;color:#1E241F;border:5px solid #1E241F;border-radius:999px;font-weight:900;direction:ltr;box-shadow:0 10px 0 rgba(0,0,0,.18)}
.cta .share{position:absolute;left:0;right:0;text-align:center;color:#FCE3B0;font-weight:700}
.brand{position:absolute;font-weight:800;color:#1F5A3D;opacity:.8;direction:ltr}
${F.layout === "p" ? `
.progress{top:236px;left:60px;right:60px;height:12px}
.badge{top:282px;${rtl ? "right" : "left"}:66px;width:178px;height:178px}.badge small{font-size:26px}.badge b{font-size:78px}
.search{top:310px;${rtl ? "right:262px;left:60px" : "left:262px;right:60px"};height:122px;padding:0 36px}
.search .mag{width:46px;height:46px}.search .mag:after{height:22px;bottom:-20px;${rtl ? "left:-9px" : "right:-9px"}}
.search .q{font-size:54px;line-height:1.4}.search .caret{height:58px}
.sub{top:1150px;padding:0 60px}.sub p{font-size:56px;line-height:1.55;padding:22px 40px;max-width:960px}
.hook .q1{top:300px;padding:0 70px;font-size:84px;line-height:1.45}
.hook .q2{top:640px}.hook .q2 span{font-size:58px;padding:16px 40px}
.note{top:1440px;font-size:30px}
.logo{top:760px}.logo svg{height:200px}.logo p{font-size:54px;margin-top:34px}
.recap h2{top:300px;font-size:76px}
.recap .grid{top:470px;left:70px;right:70px;grid-template-columns:repeat(2,minmax(0,1fr));gap:26px 28px}
.chip{height:128px;padding:0 24px}.chip b{width:74px;height:74px;font-size:40px}.chip span{font-size:35px}
.cta .logo{top:300px}.cta .logo svg{height:190px}
.cta .line{top:520px;padding:0 80px;font-size:62px;line-height:1.5}
.cta .btn{top:740px}.cta .btn span{font-size:64px;padding:18px 64px}
.cta .share{top:1420px;padding:0 60px;font-size:40px}
.brand{top:1420px;left:0;right:0;text-align:center;font-size:36px}` : `
.progress{top:30px;left:120px;right:120px;height:9px}
.badge{top:62px;${rtl ? "right" : "left"}:112px;width:150px;height:150px}.badge small{font-size:22px}.badge b{font-size:66px}
.search{top:78px;${rtl ? "right:300px" : "left:300px"};width:1000px;height:110px;padding:0 34px}
.search .mag{width:40px;height:40px}.search .mag:after{height:20px;bottom:-18px;${rtl ? "left:-8px" : "right:-8px"}}
.search .q{font-size:50px;line-height:1.4}.search .caret{height:52px}
.sub{top:958px;padding:0 120px}.sub p{font-size:46px;line-height:1.5;padding:12px 40px;max-width:1600px}
.hook .q1{top:80px;padding:0 140px;font-size:78px;line-height:1.4}
.hook .q2{top:236px}.hook .q2 span{font-size:50px;padding:12px 36px}
.note{top:1012px;font-size:26px}
.logo{top:380px}.logo svg{height:220px}.logo p{font-size:54px;margin-top:30px}
.recap h2{top:110px;font-size:70px}
.recap .grid{top:380px;left:110px;right:110px;grid-template-columns:repeat(5,minmax(0,1fr));gap:40px 22px}
.chip{height:116px;padding:0 18px;gap:12px}.chip b{width:62px;height:62px;font-size:34px;flex:none}.chip span{font-size:26px}
.cta .logo{top:90px}.cta .logo svg{height:150px}
.cta .line{top:300px;padding:0 160px;font-size:56px;line-height:1.45}
.cta .btn{top:460px}.cta .btn span{font-size:56px;padding:14px 60px}
.cta .share{top:1012px;font-size:32px}
.brand{top:1030px;${rtl ? "left" : "right"}:40px;font-size:26px}`}
`;

  const body = `<div class="stage" dir="${rtl ? "rtl" : "ltr"}" lang="${locale}">
  <svg class="art" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${clips}</defs>${scenesSvg.join("")}</svg>
  <div class="ov hook" data-k="0"><div class="q1">${tipSpans(h.q)}</div><div class="q2"><span>${esc(h.count)}</span></div><div class="note">${esc(h.note)}</div></div>
  <div class="ov logoov" data-k="1"><div class="logo">${lockup(locale, false)}<p>opetlife.ir</p></div></div>
  ${countHtml}
  <div class="ov recap" data-k="12"><h2>${esc(COPY.recap[locale])}</h2><div class="grid">${recapChips}</div></div>
  <div class="ov cta" data-k="13"><div class="logo">${lockup(locale, true)}</div><p class="line">${esc(c.line)}</p><div class="btn"><span>${esc(c.button)}</span></div><p class="share">${esc(c.share)}</p></div>
  <div class="progress">${items.map(() => "<i><b></b></i>").join("")}</div>
  <div class="brand">opetlife.ir</div>
</div>`;

  const script = `
const STARTS=${JSON.stringify(STARTS)}, END=${DURATION}, MAXR=${maxR.toFixed(0)}, RTL=${rtl};
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const ease=t=>1-Math.pow(1-clamp(t),3);
const inOut=t=>{t=clamp(t);return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2};
const back=t=>{t=clamp(t);const c1=1.70158,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2)};
const sceneOf=t=>{let k=0;for(let i=0;i<STARTS.length;i++)if(t>=STARTS[i])k=i;return k};
const scenes=STARTS.map((s,k)=>{const g=document.getElementById('sc'+k);return{g,start:s,end:k+1<STARTS.length?STARTS[k+1]:END,
  actors:[...g.querySelectorAll('.actor')].map(el=>({el,base:el.getAttribute('transform'),head:el.querySelector('#head'),tail:el.querySelector('#tail'),eyes:el.querySelector('#eyes'),paw:el.querySelector('#paw')})),
  props:[...g.querySelectorAll('.prop')].map((el,i)=>({el,base:el.getAttribute('transform'),float:el.classList.contains('float'),i})),
  blobs:[...g.querySelectorAll('.blob')],clip:document.getElementById('cc'+k)}});
const ovs=[...document.querySelectorAll('.ov')].map(el=>({el,k:+el.dataset.k,words:[...el.querySelectorAll('.sub .w, .q1 .w')],q:el.querySelector('.q'),badge:el.querySelector('.badge'),search:el.querySelector('.search'),caret:el.querySelector('.caret'),sub:el.querySelector('.sub p'),q2:el.querySelector('.q2 span'),note:el.querySelector('.note'),lps:[...el.querySelectorAll('.lp')],logoP:el.querySelector('.logo p'),chips:[...el.querySelectorAll('.chip')],h2:el.querySelector('h2'),line:el.querySelector('.line'),btn:el.querySelector('.btn span'),share:el.querySelector('.share')}));
const prog=[...document.querySelectorAll('.progress b')];
const progBox=document.querySelector('.progress'), brand=document.querySelector('.brand');
function animScene(s,u,t){
  s.blobs.forEach((b,i)=>{b.style.transformBox='fill-box';b.style.transformOrigin='center';b.style.transform='scale('+(0.6+0.4*ease(u/0.9))*(1+0.035*Math.sin(t*1.1+i))+')'});
  s.actors.forEach((a,i)=>{
    const ap=back((u-0.25-i*0.16)/0.6);const k1=Math.max(0.001,ap);
    const hop=Math.max(0,Math.sin(clamp((u-1.0)/0.42)*Math.PI))*16+Math.max(0,Math.sin(((t*2)%1)*Math.PI))*3;
    const breathe=1+0.012*Math.sin(t*2.4+i);
    a.el.style.opacity=ap<0.01?0:1;a.el.setAttribute('transform',a.base+' translate(0 '+(-hop)+') scale('+k1+' '+(k1*breathe)+')');
    if(a.head)a.head.style.transform='rotate('+(Math.sin(t*1.6+i)*4+Math.sin(clamp((u-1.1)/0.8)*Math.PI)*8*(i%2?1:-1))+'deg)';
    if(a.tail)a.tail.style.transform='rotate('+(Math.sin(t*12+i)*9)+'deg)';
    if(a.eyes){const bl=((t+i*0.7)%2.9);a.eyes.style.transformBox='fill-box';a.eyes.style.transformOrigin='center';a.eyes.style.transform='scaleY('+(bl<0.1?0.15:1)+')'}
    if(a.paw)a.paw.style.transform='rotate('+(Math.sin(t*4)*8)+'deg)';
  });
  s.props.forEach(p=>{const ap=back((u-0.45-p.i*0.12)/0.55);const bob=p.float?Math.sin(t*2.2+p.i)*12:0;const pulse=1+0.05*Math.max(0,Math.sin(((t*2)%1)*Math.PI));
    p.el.style.opacity=ap<0.01?0:1;p.el.setAttribute('transform','translate(0 '+bob+') '+p.base+' scale('+Math.max(0.001,ap*(p.float?pulse:1))+')')});
}
const typed=(el,full,u0,u1,u)=>{const ch=Array.from(full);const n=Math.round(ch.length*clamp((u-u0)/(u1-u0)));el.textContent=ch.slice(0,n).join('')};
window.frame=function(t){
  const k=sceneOf(t);
  scenes.forEach((s,i)=>{
    const vis=i===k||(i===k-1&&t-STARTS[k]<0.6);
    s.g.style.display=vis?'':'none';
    if(s.clip)s.clip.setAttribute('r',i===k?(MAXR*inOut((t-s.start)/0.55)).toFixed(1):(i<k?MAXR:0));
    if(vis)animScene(s,t-s.start,t);
  });
  ovs.forEach(o=>{
    const s=scenes[o.k];const u=t-s.start;const dur=s.end-s.start;
    const on=o.k===k;
    if(!on){o.el.style.opacity=0;return}
    const out=o.k===13?0:ease((u-(dur-0.38))/0.38);
    o.el.style.opacity=1-out;o.el.style.transform='translateY('+(-out*40)+'px)';
    if(o.badge){const b=back((u-0.12)/0.5);o.badge.style.transform='scale('+Math.max(0.001,b)+') rotate('+((1-ease((u-0.12)/0.6))*-16)+'deg)'}
    if(o.search){const e=ease((u-0.22)/0.45);o.search.style.opacity=e;o.search.style.transform='translateY('+((1-e)*-50)+'px)';typed(o.q,o.q.dataset.full,0.55,1.35,u);o.caret.style.opacity=(u<1.35||Math.floor(u*2.4)%2===0)?1:0}
    if(o.sub){const e=ease((u-1.15)/0.3);o.sub.style.opacity=e;o.sub.style.transform='translateY('+((1-e)*24)+'px) scale('+(0.96+0.04*e)+')'}
    o.words.forEach((w,i)=>{const t0=(o.k===0?0.15:1.3)+i*(o.k===0?0.17:0.16);const e=ease((u-t0)/0.25);w.style.opacity=e;w.style.transform='translateY('+((1-e)*18)+'px)'});
    if(o.q2){const b=back((u-1.65)/0.5);o.q2.style.transform='scale('+Math.max(0.001,b)+') rotate('+(Math.sin(t*3)*1.2)+'deg)';o.q2.style.opacity=b>0.01?1:0}
    if(o.note)o.note.style.opacity=0.85*ease((u-2.3)/0.5);
    o.lps.forEach((p,i)=>{const b=back((u-(o.k===13?0.3:0.15)-i*0.05)/0.45);p.style.transform='scale('+Math.max(0.001,b)+')';p.style.opacity=b>0.01?1:0});
    if(o.logoP){const e=ease((u-0.9)/0.4);o.logoP.style.opacity=e;o.logoP.style.transform='translateY('+((1-e)*20)+'px)'}
    if(o.h2){const e=ease((u-0.3)/0.4);o.h2.style.opacity=e;o.h2.style.transform='translateY('+((1-e)*-30)+'px)'}
    o.chips.forEach((c,i)=>{const b=back((u-0.55-i*0.2)/0.45);c.style.opacity=b>0.01?1:0;c.style.transform='scale('+Math.max(0.001,b)+')'});
    if(o.line){const e=ease((u-1.0)/0.5);o.line.style.opacity=e;o.line.style.transform='translateY('+((1-e)*30)+'px)'}
    if(o.btn){const b=back((u-1.6)/0.5);const pulse=1+0.035*Math.max(0,Math.sin(((t*2)%1)*Math.PI));o.btn.style.transform='scale('+Math.max(0.001,b*pulse)+')';o.btn.style.opacity=b>0.01?1:0}
    if(o.share)o.share.style.opacity=ease((u-2.6)/0.5);
  });
  const ci=k-2;
  progBox.style.opacity=(k>=2&&k<=11)?1:0;
  prog.forEach((b,i)=>{const s=scenes[i+2];b.style.transform='scaleX('+(i<ci?1:i===ci?clamp((t-s.start)/(s.end-s.start)):0)+')'});
  brand.style.opacity=(k>=2&&k<=12)?0.8:0;
};
window.frame(0);`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}<script>${script}</script></body></html>`;
}

function srt(locale) {
  const ts = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60, r = ms % 1000; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(r).padStart(3, "0")}`; };
  const cues = [];
  const h = COPY.hook[locale];
  cues.push([0.2, 2.0, h.q], [2.0, 4.0, `${h.count}\n${h.note}`], [4.1, 6.0, "opetlife.ir"]);
  COPY.items.forEach((it, i) => { const s = STARTS[i + 2]; cues.push([s + 0.5, s + 1.3, `${DIG(locale, it.rank)} · ${it.kw[locale]}`], [s + 1.3, s + 3.9, it.tip[locale]]); });
  cues.push([46.3, 51.9, `${COPY.recap[locale]}: ${COPY.items.map((it) => it.kw[locale]).join(" · ")}`]);
  const c = COPY.cta[locale];
  cues.push([53.0, 56.5, `${c.line}\n${c.button}`], [56.5, 59.8, c.share]);
  return cues.map(([a, b, text], i) => `${i + 1}\n${ts(a)} --> ${ts(b)}\n${text}\n`).join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
  const locales = (args[0] || "fa").split(",");
  const formats = (args[1] || "9x16").split(",");
  const music = opt("--music", null);
  const musicStart = Number(opt("--start", "0"));
  const preview = opt("--preview", null);
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, args: ["--disable-gpu", "--font-render-hinting=none", "--disable-dev-shm-usage", "--allow-file-access-from-files"] });
  try {
    let audio = null;
    for (const locale of locales) {
      fs.writeFileSync(path.join(OUT, `reel-${locale}.srt`), srt(locale));
      for (const fmt of formats) {
        const F = FORMATS[fmt];
        const tmp = path.join(OUT, `.reel-${locale}-${fmt}-${process.pid}.html`);
        fs.writeFileSync(tmp, reelHtml(locale, fmt));
        const pg = await browser.newPage({ viewport: { width: F.W, height: F.H }, deviceScaleFactor: 1 });
        await pg.goto(`file://${tmp}`);
        await pg.evaluate(() => document.fonts.ready);
        if (preview) {
          for (const t of preview.split(",").map(Number)) {
            await pg.evaluate((tt) => window.frame(tt), t);
            await pg.screenshot({ path: path.join(OUT, `prev-${locale}-${fmt}-${t}.png`) });
          }
          await pg.close();
          fs.unlinkSync(tmp);
          continue;
        }
        const names = [fmt, ...(F.extra || []).map((e) => e.name)];
        const sizes = [[F.W, F.H], ...(F.extra || []).map((e) => [e.width, e.height])];
        const partFile = (name, from) => path.join(OUT, "parts", `${locale}-${name}-${String(from).padStart(2, "0")}.bin`);
        // --assemble: join the 10 s segments written by --from/--to runs into one WebM per output, with the music.
        if (args.includes("--assemble")) {
          audio = music ? await encodeAudio(pg, music, { start: musicStart, length: DURATION, fadeIn: 0.12, fadeOut: 2.8, targetRms: 0.12, bitrate: 128000 }) : null;
          names.forEach((name, i) => {
            const chunks = [];
            for (let from = 0; from < DURATION; from += 10) {
              const buf = fs.readFileSync(partFile(name, from));
              for (let o = 0; o < buf.length;) { const ts = Number(buf.readBigInt64LE(o)); const key = buf[o + 8] === 1; const len = buf.readUInt32LE(o + 9); chunks.push({ ts, key, data: buf.subarray(o + 13, o + 13 + len) }); o += 13 + len; }
            }
            chunks.sort((a, b) => a.ts - b.ts);
            const r = writeWebm(path.join(OUT, `reel-${locale}-${name}.webm`), { width: sizes[i][0], height: sizes[i][1], fps: FPS, chunks }, audio || undefined);
            console.log("reel", locale, name, `${(r.bytes / 1048576).toFixed(1)} MB`, `${(r.durationMs / 1000).toFixed(1)}s`, `${chunks.length} frames`);
          });
          await pg.close();
          fs.unlinkSync(tmp);
          continue;
        }
        // --from/--to: render one segment (starts on a keyframe) and store its encoded frames for --assemble.
        if (args.includes("--from")) {
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
          fs.mkdirSync(path.join(OUT, "parts"), { recursive: true });
          (extra.length ? res : [res]).forEach((chunks, i) => {
            const bufs = chunks.map((c) => { const h = Buffer.alloc(13); h.writeBigInt64LE(BigInt(c.ts + Math.round(from * 1e6))); h[8] = c.key ? 1 : 0; h.writeUInt32LE(c.data.length, 9); return Buffer.concat([h, c.data]); });
            fs.writeFileSync(partFile(names[i], from), Buffer.concat(bufs));
          });
          console.log("part", locale, fmt, `${from}-${to}s`, `${((Date.now() - t0) / 1000).toFixed(0)}s`);
          await pg.close();
          fs.unlinkSync(tmp);
          continue;
        }
        if (music && !audio) {
          audio = await encodeAudio(pg, music, { start: musicStart, length: DURATION, fadeIn: 0.12, fadeOut: 2.8, targetRms: 0.12, bitrate: 128000 });
          console.log("audio", audio.chunks.length, "packets", JSON.stringify(audio.level), audio.codecPrivate ? "OpusHead from encoder" : "OpusHead built");
        }
        const t0 = Date.now();
        const seconds = Number(opt("--seconds", String(DURATION)));
        const frames = Math.round(seconds * FPS);
        const extra = (F.extra || []).map((e) => ({ width: e.width, height: e.height, bitrate: e.bitrate }));
        const res = await recordFrames(pg, {
          width: F.W, height: F.H, fps: FPS, frames, bitrate: F.bitrate, extra,
          drawFrame: (f) => pg.evaluate((t) => window.frame(t), f / FPS),
          onFrame: async (f) => {
            if (f === Math.round(2.9 * FPS)) {
              const png = await pg.screenshot({ type: "png" });
              fs.writeFileSync(path.join(OUT, `thumb-${locale}-${fmt}.png`), png);
              await writeWebp(pg, png, path.join(OUT, `poster-${locale}-${fmt}.webp`), 0.85);
            }
            if (f % 300 === 299) console.log(`  ${locale} ${fmt} ${f + 1}/${frames} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
          },
        });
        const lists = extra.length ? res : [res];
        const aud = audio ? { ...audio, chunks: audio.chunks.filter((c) => c.ts < seconds * 1e6) } : undefined;
        lists.forEach((chunks, i) => {
          const file = path.join(OUT, `reel-${locale}-${names[i]}.webm`);
          const r = writeWebm(file, { width: sizes[i][0], height: sizes[i][1], fps: FPS, chunks }, aud);
          console.log("reel", locale, names[i], `${(r.bytes / 1048576).toFixed(1)} MB`, `${(r.durationMs / 1000).toFixed(1)}s`, `${((Date.now() - t0) / 1000).toFixed(0)}s render`);
        });
        await pg.close();
        fs.unlinkSync(tmp);
      }
    }
  } finally {
    await browser.close();
  }
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { reelHtml, srt, STARTS };
