// PREVIEW ONLY: puts one item in the QA customer's cart and screenshots the checkout steps (fa/en, 1440/390).
const { chromium } = require("playwright");
const fs = require("fs");
const { createHmac } = require("crypto");
const { PrismaClient } = require(process.env.PRISMA_CLIENT);
const BASE = "http://185.231.112.154:8088";
(async () => {
  if (!new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) throw new Error("preview only");
  const db = new PrismaClient();
  const u = (await db.$queryRawUnsafe(`select id::text id from users where email='batch4-customer@example.test'`))[0];
  const s = await db.session.create({ data: { userId: u.id, expiresAt: new Date(Date.now() + 3600e3) } });
  const cookie = [{ name: "petlife_session", value: `${s.id}.${createHmac("sha256", process.env.SESSION_SECRET).update(s.id).digest("hex")}`, domain: new URL(BASE).hostname, path: "/" }];
  const out = process.env.OUT; fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch();
  const auth = { username: "petlife", password: process.env.BASIC_AUTH_PASSWORD };
  let ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, httpCredentials: auth }); await ctx.addCookies(cookie);
  let p = await ctx.newPage();
  await p.goto(`${BASE}/en/shop/products/ac31aa55-29c3-405a-8dd0-0f9404a9fc34`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Add to cart" }).click(); await p.waitForTimeout(1500);
  await ctx.close();
  for (const locale of ["fa", "en"]) for (const width of [1440, 390]) {
    ctx = await b.newContext({ viewport: { width, height: 900 }, httpCredentials: auth }); await ctx.addCookies(cookie);
    p = await ctx.newPage();
    await p.goto(`${BASE}/${locale}/cart`, { waitUntil: "networkidle" }); await p.waitForTimeout(800);
    await p.screenshot({ path: `${out}/${locale}-cart-full-${width}.png`, fullPage: true });
    await p.goto(`${BASE}/${locale}/checkout`, { waitUntil: "networkidle" }); await p.waitForTimeout(1500);
    await p.screenshot({ path: `${out}/${locale}-checkout-${width}.png`, fullPage: true });
    console.log(locale, width, await p.evaluate(() => document.documentElement.scrollWidth - innerWidth));
    await ctx.close();
  }
  await b.close(); await db.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
