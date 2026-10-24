// Final hardening: axe WCAG 2.1 A/AA + overflow on the pages this pass touched (fa + en, 1440 + 390).
// ISOLATED preview only. Ids are resolved from the QA database at run time.
const { chromium } = require("playwright");
const fs = require("fs");
const { createHmac, randomUUID } = require("crypto");
const { PrismaClient } = require(process.env.PRISMA_CLIENT);
const AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const db = new PrismaClient();
if (!new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) throw new Error("preview only");
const one = async (sql) => (await db.$queryRawUnsafe(sql))[0];

(async () => {
  const uid = async (e) => (await one(`select id::text id from users where email='${e}'`)).id;
  const owner = await uid("batch2-review@example.test");
  const pet = (await one(`select g."petId"::text id from pet_access_grants g where g."userId"='${owner}'::uuid and g."canManageAccess" and g."revokedAt" is null and exists (select 1 from medical_documents d where d."petId"=g."petId") limit 1`))?.id
    ?? (await one(`select g."petId"::text id from pet_access_grants g where g."userId"='${owner}'::uuid and g."canManageAccess" limit 1`)).id;
  const doc = await one(`select id::text id from medical_documents where "petId"='${pet}'::uuid limit 1`);
  const med = await one(`select id::text id from medications where "petId"='${pet}'::uuid limit 1`);
  const lab = await one(`select id::text id from lab_results where "petId"='${pet}'::uuid limit 1`);
  const traveler = await uid("batch5-traveler@example.test");
  const trip = await one(`select t.id::text id, t."petId"::text pet from trips t where t."createdByUserId"='${traveler}'::uuid limit 1`);
  const travelOrg = await one(`select id::text id from provider_organizations where type::text='TRAVEL_ACCOMMODATION' limit 1`);
  const product = await one(`select id::text id from insurance_products limit 1`);
  const PAGES = [
    [null, `/animal-support/needs/${randomUUID()}`], [null, "/animal-support/needs"], [null, "/community"], [null, "/lost-pets"],
    [null, `/providers/${travelOrg?.id}`], [null, `/insurance/${product?.id}`],
    [owner, `/pets/${pet}/health/documents`], [owner, doc && `/pets/${pet}/health/documents/${doc.id}`], [owner, med && `/pets/${pet}/health/medications/${med.id}`],
    [owner, lab && `/pets/${pet}/health/labs/${lab.id}`], [owner, `/pets/${pet}/memories`], [owner, `/pets/${pet}/health/timeline`], [owner, `/pets/${pet}/health/observations`],
    [await uid("batch8-owner@example.test"), "/subscription/plans"], [traveler, `/pets/${trip.pet}/travel`], [traveler, `/pets/${trip.pet}/travel/${trip.id}`],
    [await uid("batch4-customer@example.test"), "/orders"], [owner, `/pets/${randomUUID()}/memories/${randomUUID()}`],
  ].filter(([, p]) => p && !p.includes("undefined"));
  const csrf = ((await fetch("http://localhost:4100/health/live")).headers.get("set-cookie") ?? "").match(/petlife_csrf=([^;]+)/)[1];
  const cookies = {};
  const cookieFor = async (u) => {
    if (!u) return [];
    if (!cookies[u]) { const s = await db.session.create({ data: { userId: u, expiresAt: new Date(Date.now() + 3600e3) } }); cookies[u] = `${s.id}.${createHmac("sha256", process.env.SESSION_SECRET).update(s.id).digest("hex")}`; }
    return [{ name: "petlife_session", value: cookies[u], domain: "localhost", path: "/" }, { name: "petlife_csrf", value: csrf, domain: "localhost", path: "/" }];
  };
  const browser = await chromium.launch();
  const out = [];
  for (const locale of ["fa", "en"]) for (const width of [1440, 390]) for (const [who, path] of PAGES) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    await ctx.addCookies(await cookieFor(who));
    const page = await ctx.newPage();
    await page.goto(`http://localhost:3100/${locale}${path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await page.addScriptTag({ content: AXE });
    const r = await page.evaluate(async () => await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    out.push({ locale, width, path: path.replace(/[0-9a-f-]{36}/g, ":id"), overflow, violations: r.violations.map((v) => `${v.id}(${v.impact}) x${v.nodes.length}: ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`) });
    await ctx.close();
  }
  await browser.close();
  process.stdout.write(JSON.stringify(out, null, 1));
  await db.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
