// Theme × locale independence on the SERVER preview: anonymous, consumer, admin × desktop/mobile.
const { chromium } = require("playwright");
const { createHmac } = require("crypto");
const { PrismaClient } = require(process.env.PRISMA_CLIENT);
const BASE = "http://185.231.112.154:8088";
const ACTORS = [["anonymous", "-", "/"], ["consumer", "batch8-owner@example.test", "/home"], ["admin", "b6-qa-admin@example.test", "/admin"]];
(async () => {
  if (!new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) throw new Error("preview only");
  const db = new PrismaClient();
  const b = await chromium.launch();
  const out = [];
  for (const [actor, email, path] of ACTORS) for (const width of [1440, 390]) {
    const ctx = await b.newContext({ viewport: { width, height: 900 }, httpCredentials: { username: "petlife", password: process.env.BASIC_AUTH_PASSWORD } });
    if (email !== "-") {
      const u = (await db.$queryRawUnsafe(`select id::text id from users where email='${email}'`))[0];
      const s = await db.session.create({ data: { userId: u.id, expiresAt: new Date(Date.now() + 3600e3) } });
      await ctx.addCookies([{ name: "petlife_session", value: `${s.id}.${createHmac("sha256", process.env.SESSION_SECRET).update(s.id).digest("hex")}`, domain: "185.231.112.154", path: "/" }]);
    }
    const p = await ctx.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message.slice(0, 100)));
    const state = async () => p.evaluate(() => ({ url: location.pathname, lang: document.documentElement.lang, theme: document.documentElement.getAttribute("data-theme") ?? "system", stored: localStorage.getItem("petlife-theme") }));
    const menu = async () => { const m = p.locator('.account-menu__trigger:visible').first(); if (!(await m.count())) return false; if ((await m.getAttribute("aria-expanded")) !== "true") await m.click(); return true; };
    const toggle = async (want) => {
      const btn = p.locator('button[aria-label*="→"]:visible').first();
      if (await btn.count()) { await btn.click(); await p.waitForTimeout(400); return true; }
      if (!(await menu())) return false;
      await p.locator(`.account-menu__prefs button:has-text("${want}")`).first().click(); await p.waitForTimeout(400); return true;
    };
    const steps = [];
    await p.goto(`${BASE}/fa${path === "/" ? "" : path}`, { waitUntil: "networkidle" });
    steps.push(["FA start", await state()]);
    let ok = true;
    for (let i = 0; i < 3 && (await state()).theme !== "dark"; i++) if (!(await toggle("تیره"))) { ok = false; break; }
    steps.push(["FA → DARK", await state(), ok ? "" : "no visible theme control"]);
    const sel = p.locator('select[aria-label="زبان"]:visible').first();
    const link = p.locator('a[href="/en"]:visible').first();
    let via = "";
    const langToggle = p.locator('button.language-toggle:visible').first();
    if (await langToggle.count()) { await langToggle.click(); via = "header toggle"; }
    else if (await sel.count()) { await sel.selectOption("en"); via = "header select"; }
    else if (await link.count()) { await link.click(); via = "landing link"; }
    else if (await menu()) { await p.locator('.account-menu__prefs button:has-text("انگلیسی")').first().click(); via = "account menu"; }
    if (via) { await p.waitForURL(/\/en(\/|$)/, { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(1000); }
    steps.push(["switch to EN", await state(), via || "no visible language control"]);
    await p.reload({ waitUntil: "networkidle" });
    steps.push(["EN reload", await state()]);
    for (let i = 0; i < 3 && (await state()).theme !== "light"; i++) if (!(await toggle("Light"))) break;
    steps.push(["EN → LIGHT", await state()]);
    await p.reload({ waitUntil: "networkidle" });
    steps.push(["EN reload", await state()]);
    out.push({ actor, width, steps, errors });
    await ctx.close();
  }
  await b.close(); await db.$disconnect();
  console.log(JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e.message); process.exit(1); });
