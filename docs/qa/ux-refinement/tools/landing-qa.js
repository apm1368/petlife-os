// Landing QA on the SERVER preview: axe × locale × theme × width, perf (LCP/CLS/bytes), keyboard order, reduced motion.
const { chromium } = require("playwright");
const fs = require("fs");
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const BASE = "http://185.231.112.154:8088";
const auth = { username: "petlife", password: process.env.BASIC_AUTH_PASSWORD };
(async () => {
  const b = await chromium.launch();
  const axe = [];
  for (const locale of ["fa", "en"]) for (const scheme of ["light", "dark"]) for (const width of [1600, 1440, 1024, 768, 430, 390, 360]) {
    const ctx = await b.newContext({ viewport: { width, height: 900 }, colorScheme: scheme, httpCredentials: auth });
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message.slice(0, 80)));
    p.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 80)); });
    await p.goto(`${BASE}/${locale}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(1200);
    await p.addScriptTag({ content: AXE });
    const r = await p.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] })).violations.map((v) => `${v.id}(${v.impact}) x${v.nodes.length}: ${v.nodes[0]?.target}`));
    const font = await p.evaluate(() => getComputedStyle(document.querySelector("h1")).fontFamily.split(",")[0]);
    axe.push({ locale, scheme, width, violations: r, errors, font, overflow: await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) });
    await ctx.close();
  }
  // Performance: cold load at 1440 and 390.
  const perf = [];
  for (const width of [1440, 390]) {
    const ctx = await b.newContext({ viewport: { width, height: 900 }, httpCredentials: auth });
    const p = await ctx.newPage();
    let bytes = 0;
    p.on("response", async (res) => { try { const h = await res.headerValue("content-length"); bytes += h ? Number(h) : (await res.body()).length; } catch {} });
    await p.addInitScript(() => {
      window.__lcp = 0; window.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true });
    });
    await p.goto(`${BASE}/fa`, { waitUntil: "networkidle" });
    await p.waitForTimeout(1500);
    const m = await p.evaluate(() => ({ lcp: Math.round(window.__lcp), cls: Number(window.__cls.toFixed(4)), svgBytes: document.querySelector(".tehran-scene__art").outerHTML.length, lcpEl: performance.getEntriesByType("largest-contentful-paint").pop()?.element?.tagName }));
    perf.push({ width, ...m, transferKB: Math.round(bytes / 1024) });
    await ctx.close();
  }
  // Keyboard: tab order through the six buildings, focus visibly drawn; reduced motion respected.
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", httpCredentials: auth });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/fa`, { waitUntil: "networkidle" });
  const order = [];
  for (let i = 0; i < 14; i++) {
    await p.keyboard.press("Tab");
    order.push(await p.evaluate(() => { const a = document.activeElement; return a?.classList.contains("tehran-dest__link") ? `${a.textContent.trim().split(/\s{2,}|\n/)[0]}|outline:${getComputedStyle(a).outlineStyle}|active:${document.querySelector(".tehran-scene").dataset.active}` : null; }));
  }
  const motion = await p.evaluate(() => getComputedStyle(document.querySelector(".t-bld")).animationDuration);
  await b.close();
  console.log(JSON.stringify({ axe, perf, keyboard: order.filter(Boolean), reducedMotionAnimation: motion }, null, 1));
})().catch((e) => { console.error(e.message); process.exit(1); });
