// Final hardening route crawl — ISOLATED preview only (web :3100 → API :4100 on a *_test DB).
// Every web page route, with dynamic segments filled from real QA rows and opened as a persona
// that should be able to see it (the row's owner, the provider/seller/partner/NGO/insurer member,
// or a QA admin). Records status, final URL, page errors, console errors, failed API calls, stuck
// skeletons, system-state kind, horizontal overflow, dir, raw enum text and Latin digits in fa.
//   ROUTES=/tmp/web-routes.txt LOCALE=fa WIDTHS=1440,390 node crawl-final.js > crawl.json
const { chromium } = require("playwright");
const fs = require("fs");
const { createHmac } = require("crypto");
const { PrismaClient } = require(process.env.PRISMA_CLIENT);
const db = new PrismaClient();
if (!new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) throw new Error("preview (*_test) only");
const WEB = "http://localhost:3100", API = "http://localhost:4100";
const q = (sql) => db.$queryRawUnsafe(sql);

const PARAM_TABLE = {
  careItemId: "care_reminders", recordId: "dental_records", documentId: "medical_documents", imagingStudyId: "imaging_studies", labResultId: "lab_results",
  referralId: "referrals", visitId: "clinical_visits", allergyId: "allergies", conditionId: "conditions", medicationId: "medications", observationId: "pet_observations",
  incidentId: "lost_pet_incidents", memoryId: "pet_memories", tripId: "trips", hospitalizationId: "hospitalizations", campaignId: "support_campaigns",
  listingId: "support_need_listings", organizationId: "animal_support_organizations", postId: "community_posts", placeId: "pet_friendly_places",
  productId: "insurance_products", providerId: "provider_organizations", serviceId: "provider_services", bookingId: "travel_bookings", shareId: "pet_access_grants", petId: "pets",
};
// [id] depends on the route.
const ID_TABLE = [
  [/^\/pets\/\[id\]/, "pets"], [/^\/bookings\/\[id\]/, "bookings"], [/^\/orders\/\[id\]/, "orders"], [/^\/checkout\/\[id\]/, "checkouts"],
  [/^\/donations\/\[id\]/, "donations"], [/^\/insurer\/applications\/\[id\]/, "insurance_applications"], [/^\/provider\/bookings\/\[id\]/, "bookings"],
  [/^\/provider\/travel\/bookings\/\[id\]/, "travel_bookings"], [/^\/provider\/travel\/listings\/\[id\]/, "travel_listings"], [/^\/provider\/visits\/\[id\]/, "clinical_visits"],
  [/^\/repeat-delivery\/\[id\]/, "repeat_delivery_subscriptions"], [/^\/seller\/finance\/settlements\/\[id\]/, "seller_settlements"], [/^\/seller\/orders\/\[id\]/, "orders"],
  [/^\/shop\/products\/\[id\]/, "products"], [/^\/support\/tickets\/\[id\]/, "support_cases"], [/^\/travel\/bookings\/\[id\]/, "travel_bookings"], [/^\/travel\/stays\/\[id\]/, "travel_listings"],
];
const PLAN_TABLE = (route) => (route.includes("/rehab/") ? "rehab_plans" : "clinical_nutrition_plans");

async function main() {
  const routes = fs.readFileSync(process.env.ROUTES, "utf8").split("\n").filter(Boolean).filter((r) => !r.includes("[...rest]"));
  const only = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
  const skip = process.env.SKIP ? new RegExp(process.env.SKIP) : null;
  const locale = process.env.LOCALE || "fa";
  const widths = (process.env.WIDTHS || "1440,390").split(",").map(Number);
  const tables = new Set((await q(`select table_name as t from information_schema.tables where table_schema='public'`)).map((r) => r.t));
  const email = async (e) => (await q(`select id::text as id from users where email='${e}'`))[0]?.id;
  const P = {
    owner: await email("batch2-review@example.test"), customer: await email("batch4-customer@example.test"), traveler: await email("batch5-traveler@example.test"),
    account: await email("batch8-owner@example.test"), admin: await email("batch8-qa-admin@example.test"), ngo: await email("b6-ngo-owner@example.test"),
    insurer: await email("batch5-insurer@example.test"), seller: await email("batch4-seller-a@example.test"), partner: await email("batch5-partner-a@example.test"),
    provider: await email("batch3-clinic-owner@example.test"), vet: await email("batch2-vet@example.test"),
  };
  const csrf = ((await fetch(`${API}/health/live`)).headers.get("set-cookie") ?? "").match(/petlife_csrf=([^;]+)/)?.[1] ?? "";
  const sessions = {};
  async function cookiesFor(userId) {
    if (!userId) return [];
    if (!sessions[userId]) {
      const s = await db.session.create({ data: { userId, expiresAt: new Date(Date.now() + 3 * 3600e3) } });
      sessions[userId] = `${s.id}.${createHmac("sha256", process.env.SESSION_SECRET).update(s.id).digest("hex")}`;
    }
    return [{ name: "petlife_session", value: sessions[userId], domain: "localhost", path: "/" }, { name: "petlife_csrf", value: csrf, domain: "localhost", path: "/" }];
  }
  async function rowFor(table, where = "") {
    if (!tables.has(table)) return null;
    const hasCreated = (await q(`select count(*)::int n from information_schema.columns where table_name='${table}' and column_name='createdAt'`))[0].n > 0;
    const r = await q(`select row_to_json(x)::text j from (select * from "${table}" ${where} ${hasCreated ? 'order by "createdAt" desc' : ""} limit 1) x`);
    return r[0] ? JSON.parse(r[0].j) : null;
  }
  async function petOwner(petId) {
    return (await q(`select "userId"::text u from pet_access_grants where "petId"='${petId}'::uuid and "canManageAccess" and "revokedAt" is null and reason is null limit 1`))[0]?.u;
  }
  async function member(table, col, orgId) {
    return (await q(`select "userId"::text u from ${table} where "${col}"='${orgId}'::uuid limit 1`).catch(() => []))[0]?.u;
  }

  // Resolve a concrete URL + persona for a route pattern.
  async function resolve(route) {
    const params = [...route.matchAll(/\[(\w+)\]/g)].map((m) => m[1]);
    let persona = route.startsWith("/admin") ? P.admin : route.startsWith("/provider") || route.startsWith("/vet-panel") ? P.provider : route.startsWith("/seller") ? P.seller
      : route.startsWith("/partner") || route.startsWith("/travel-partner") || route.startsWith("/provider/travel") ? P.partner : route.startsWith("/ngo") ? P.ngo
      : route.startsWith("/insurer") ? P.insurer : route.match(/^\/(cart|checkout|orders|repeat-delivery|shop)/) ? P.customer
      : route.match(/^\/(travel|trips)/) ? P.traveler : route.match(/^\/(profile|account|settings|subscription|notifications)/) ? P.account : P.owner;
    if (route.startsWith("/provider/travel")) persona = P.partner;
    if (!params.length) return { url: route, persona };
    const values = {};
    let row = null;
    const last = params[params.length - 1];
    let table = last === "id" ? (ID_TABLE.find(([re]) => re.test(route)) ?? [])[1] : last === "planId" ? PLAN_TABLE(route) : PARAM_TABLE[last];
    if (last === "planId" && route.startsWith("/admin")) table = "subscription_plans";
    if (["slug", "category", "token"].includes(last)) return null;
    if (!table) return { unresolved: `no table for ${last}` };
    const petScoped = route.startsWith("/pets/[id]/") && params.length > 1;
    row = await rowFor(table, petScoped ? `where "petId" is not null` : "");
    if (!row) return { unresolved: `no rows in ${table}` };
    for (const p of params) {
      if (p === last) values[p] = row.id;
      else if (p === "id" && route.startsWith("/pets/[id]")) values[p] = row.petId;
      else if (p === "petId" && row.petId) values[p] = row.petId;
      else if (row[p]) values[p] = row[p];
      else return { unresolved: `can't fill ${p} from ${table}` };
    }
    // Persona that should see this row.
    const petId = table === "pets" ? row.id : row.petId;
    if (route.startsWith("/provider")) {
      const org = row.providerOrganizationId ?? row.organizationId;
      persona = (org && (await member("provider_users", "providerOrganizationId", org))) || persona;
    } else if (route.startsWith("/seller")) {
      const org = row.sellerOrganizationId;
      persona = (org && (await member("seller_memberships", "sellerOrganizationId", org))) || persona;
    } else if (route.startsWith("/insurer")) {
      persona = (row.insuranceProviderId && (await member("insurer_memberships", "insuranceProviderId", row.insuranceProviderId))) || persona;
    } else if (route.startsWith("/admin")) {
      persona = P.admin;
    } else if (petId && !route.match(/^\/(lost-pets|community|animal-support|places|shop|travel\/stays|providers|vet|insurance)\b/)) {
      persona = (await petOwner(petId)) || persona;
    } else {
      persona = row.userId || row.customerUserId || row.donorUserId || row.creatorUserId || row.createdByUserId || row.travelerUserId || row.helperUserId || persona;
      if (row.householdId && !row.userId) persona = (await q(`select "userId"::text u from household_members where "householdId"='${row.householdId}'::uuid and role='OWNER' limit 1`))[0]?.u || persona;
    }
    return { url: route.replace(/\[(\w+)\]/g, (_, p) => values[p]), persona, table };
  }

  const browser = await chromium.launch();
  const out = [];
  for (const route of routes) {
    if (only && !only.test(route)) continue;
    if (skip && skip.test(route)) continue;
    const target = await resolve(route);
    if (!target || target.unresolved) { out.push({ route, skipped: target?.unresolved ?? "static param" }); continue; }
    for (const width of widths) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      await ctx.addCookies(await cookiesFor(target.persona));
      const page = await ctx.newPage();
      const errors = [], api = [];
      page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 160)));
      page.on("console", (m) => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) errors.push("console: " + m.text().slice(0, 160)); });
      page.on("response", (r) => { if (r.url().startsWith(API) && r.status() >= 400) api.push(`${r.status()} ${r.request().method()} ${r.url().slice(API.length, API.length + 90)}`); });
      let status = null;
      try {
        const res = await page.goto(`${WEB}/${locale}${target.url}`, { waitUntil: "networkidle", timeout: 30000 });
        status = res && res.status();
        await page.waitForTimeout(1200);
      } catch (e) { errors.push("goto: " + e.message.slice(0, 120)); }
      const info = await page.evaluate((fa) => {
        const main = document.querySelector("main") ?? document.body;
        const text = main.innerText || "";
        return {
          finalPath: location.pathname + location.search,
          dir: document.documentElement.dir,
          overflow: document.documentElement.scrollWidth - innerWidth,
          skeletons: [...document.querySelectorAll('[aria-label]')].filter((e) => /^(loading|بارگذاری)/i.test(e.getAttribute("aria-label") || "") && e.getBoundingClientRect().height > 0).length,
          systemState: document.querySelector("[data-kind]")?.getAttribute("data-kind") ?? null,
          h1: (document.querySelector("h1")?.innerText ?? "").slice(0, 80),
          rawEnums: [...new Set((text.match(/\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b/g) ?? []))].slice(0, 6),
          latinDigits: fa ? (text.match(/(?<![A-Za-z#@\/\-_.])\d{2,}(?![A-Za-z])/g) ?? []).slice(0, 6) : [],
          raw404: /This page could not be found|404/.test(document.title),
        };
      }, locale === "fa").catch(() => ({}));
      out.push({ route, url: target.url, table: target.table, width, status, ...info, errors: [...new Set(errors)].slice(0, 5), api: [...new Set(api)].slice(0, 6) });
      await ctx.close();
    }
  }
  await browser.close();
  process.stdout.write(JSON.stringify(out, null, 1));
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
