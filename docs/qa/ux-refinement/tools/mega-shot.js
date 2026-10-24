// Opens the consumer mega menu on the preview and screenshots it (and the mobile Explore sheet).
const { chromium } = require("playwright");
const { createHmac } = require("crypto");
const { PrismaClient } = require(process.env.PRISMA_CLIENT);
(async () => {
  if (!new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) throw new Error("preview only");
  const db = new PrismaClient();
  const u = (await db.$queryRawUnsafe(`select id::text id from users where email='batch8-owner@example.test'`))[0];
  const s = await db.session.create({ data: { userId: u.id, expiresAt: new Date(Date.now() + 3600e3) } });
  const cookie = [{ name: "petlife_session", value: `${s.id}.${createHmac("sha256", process.env.SESSION_SECRET).update(s.id).digest("hex")}`, domain: "185.231.112.154", path: "/" }];
  const b = await chromium.launch();
  const out = process.env.OUT; require("fs").mkdirSync(out, { recursive: true });
  for (const locale of ["fa", "en"]) for (const scheme of ["light", "dark"]) {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, httpCredentials: { username: "petlife", password: process.env.BASIC_AUTH_PASSWORD } });
    await ctx.addCookies(cookie);
    const p = await ctx.newPage();
    await p.goto(`http://185.231.112.154:8088/${locale}/home`, { waitUntil: "networkidle" });
    await p.locator(".member-nav [aria-controls]").first().click();
    await p.waitForTimeout(500);
    await p.screenshot({ path: `${out}/${locale}-${scheme}-mega-1440.png`, clip: { x: 0, y: 0, width: 1440, height: 620 } });
    await ctx.close();
  }
  for (const locale of ["fa", "en"]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, httpCredentials: { username: "petlife", password: process.env.BASIC_AUTH_PASSWORD } });
    await ctx.addCookies(cookie);
    const p = await ctx.newPage();
    await p.goto(`http://185.231.112.154:8088/${locale}/home`, { waitUntil: "networkidle" });
    await p.locator(".member-tabbar button").first().click();
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${out}/${locale}-sheet-390.png` });
    await ctx.close();
  }
  await b.close(); await db.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
