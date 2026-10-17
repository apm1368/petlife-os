// EMAIL=... PATHNAME=/home SELECTORS=".a,.b" node zoom.js  → 3x element screenshots from the server preview
const { chromium } = require("playwright");
const { createHmac } = require("crypto");
const { PrismaClient } = require(process.env.PRISMA_CLIENT);
const BASE = process.env.BASE || "http://185.231.112.154:8088";
(async () => {
  const db = new PrismaClient();
  const u = (await db.$queryRawUnsafe(`select id::text id from users where email='${process.env.EMAIL}'`))[0];
  const s = await db.session.create({ data: { userId: u.id, expiresAt: new Date(Date.now() + 3600e3) } });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: Number(process.env.WIDTH || 1440), height: 900 }, deviceScaleFactor: 3, httpCredentials: { username: "petlife", password: process.env.BASIC_AUTH_PASSWORD } });
  await ctx.addCookies([{ name: "petlife_session", value: `${s.id}.${createHmac("sha256", process.env.SESSION_SECRET).update(s.id).digest("hex")}`, domain: new URL(BASE).hostname, path: "/" }]);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${process.env.LOCALE || "fa"}${process.env.PATHNAME}`, { waitUntil: "networkidle" });
  await p.waitForTimeout(600);
  let i = 0;
  for (const sel of process.env.SELECTORS.split(",")) { const el = p.locator(sel).first(); if (await el.count()) { await el.screenshot({ path: `/tmp/claude-0/zoom-${i}.png` }); console.log(i, sel); } i++; }
  await b.close(); await db.$disconnect();
})();
