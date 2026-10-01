// Preview screenshots: EMAIL=<qa user or -> LOCALE=fa WIDTHS=1440,390 OUT=dir node shot.js /path ...
const { chromium } = require("playwright");
const BASE = process.env.BASE || "http://185.231.112.154:8088";
const HOST = new URL(BASE).hostname;
const fs = require("fs");
const { createHmac } = require("crypto");
const { PrismaClient } = require(process.env.PRISMA_CLIENT);
(async () => {
  const db = new PrismaClient();
  if (!new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) throw new Error("preview only");
  const out = process.env.OUT || "/opt/petlife-qa/shots-ux"; fs.mkdirSync(out, { recursive: true });
  let cookies = [];
  if (process.env.EMAIL && process.env.EMAIL !== "-") {
    const u = (await db.$queryRawUnsafe(`select id::text id from users where email='${process.env.EMAIL}'`))[0];
    const s = await db.session.create({ data: { userId: u.id, expiresAt: new Date(Date.now() + 3600e3) } });
    cookies = [{ name: "petlife_session", value: `${s.id}.${createHmac("sha256", process.env.SESSION_SECRET).update(s.id).digest("hex")}`, domain: HOST, path: "/" }];
  }
  const b = await chromium.launch();
  for (const width of (process.env.WIDTHS || "1440,390").split(",").map(Number)) for (const path of process.argv.slice(2)) {
    const ctx = await b.newContext({ viewport: { width, height: 900 }, colorScheme: process.env.DARK ? "dark" : "light", httpCredentials: { username: "petlife", password: process.env.BASIC_AUTH_PASSWORD } });
    await ctx.addCookies(cookies);
    const p = await ctx.newPage();
    await p.goto(`${BASE}/${process.env.LOCALE || "fa"}${path}`, { waitUntil: "networkidle" });
    await p.waitForTimeout(700);
    const name = `${process.env.LOCALE || "fa"}${path.replace(/[0-9a-f-]{36}/g, "id").replace(/[\/?=&]/g, "_")}-${width}${process.env.DARK ? "-dark" : ""}.png`;
    await p.screenshot({ path: `${out}/${name}`, fullPage: process.env.FULL !== "0" });
    console.log(name);
    await ctx.close();
  }
  await b.close(); await db.$disconnect();
})();
