#!/usr/bin/env node
/**
 * Full live route crawl (Phase A). Canonical site only. QA personas only; sessions are created for the run and
 * deleted afterwards; page loads are GET navigations (no clicks that write).
 *
 *   cd /var/www/petlife-os/apps/api && set -a && . ./.env && set +a && \
 *   NODE_PATH=/opt/petlife-qa/node_modules PRISMA_CLIENT=/var/www/petlife-os/node_modules/.pnpm/node_modules/@prisma/client \
 *   PAGES=pages.txt node live-crawl.cjs > crawl.json
 *
 * Per load: HTTP status, final URL, page errors, console errors, failed /api calls, visible error state,
 * fa: Latin chrome words / Latin digits / raw ENUM tokens, en: Arabic-script chrome, 390px horizontal overflow,
 * malformed internal links (/fa/fa, /en/en, /fa/en, links without locale).
 */
const { chromium } = require("playwright");
const fs = require("fs");
const { createHmac, randomUUID } = require("crypto");
const { PrismaClient } = require(process.env.PRISMA_CLIENT);
const db = new PrismaClient();
const BASE = process.env.BASE || "http://185.231.112.154";
const SECRET = process.env.SESSION_SECRET;
const ALLOW = /^(PET|LIFE|OS|IRR|PDF|SMS|OTP|QR|ID|CSV|Apoquel|CBC|kg|mg|ml|km|QA|VET|IRAN)$/i;
const sign = (id) => `${id}.${createHmac("sha256", SECRET).update(id).digest("hex")}`;

async function sessionFor(email) {
  const u = await db.user.findUnique({ where: { email } });
  if (!u) return null;
  const s = await db.session.create({ data: { userId: u.id, expiresAt: new Date(Date.now() + 3 * 3600e3), userAgent: "petlife-live-crawl" } });
  return { userId: u.id, sessionId: s.id, cookie: sign(s.id) };
}
const first = async (p) => { try { return (await p)?.id ?? null; } catch { return null; } };

(async () => {
  const pages = fs.readFileSync(process.env.PAGES, "utf8").split("\n").filter(Boolean);
  const personas = {
    app: await sessionFor("qa-erp-owner@example.test"),
    admin: await sessionFor("qa-admin-super@example.test"),
    provider: await sessionFor("qa-erp-owner@example.test"),
    seller: await sessionFor("qa-erp-owner@example.test"),
  };
  const P = personas.app.userId;
  const hh = await db.householdMember.findFirst({ where: { userId: P, role: "OWNER" } });
  const pet = await db.pet.findFirst({ where: { householdId: hh.householdId } });
  const qaClinic = await db.providerOrganization.findFirst({ where: { name: "کلینیک نمایشی ERP (QA)" } });
  await db.providerContextPreference.upsert({ where: { userId: P }, create: { userId: P, providerOrganizationId: qaClinic.id }, update: { providerOrganizationId: qaClinic.id } });
  const qaSeller = await db.sellerOrganization.findFirst({ where: { name: "فروشنده نمایشی A (QA)" } });
  const byPet = (model) => first(db[model].findFirst({ where: { petId: pet.id } }));
  const fa = async () => (await db.articleLocale.findFirst({ where: { locale: "fa", status: "VISIBLE" } }))?.slug ?? null;
  const params = {
    id: null, petId: pet.id, careItemId: await byPet("careReminder"), recordId: await byPet("dentalRecord"), documentId: await byPet("medicalDocument"),
    imagingStudyId: await byPet("imagingStudy"), labResultId: await byPet("labResult"), referralId: await byPet("referral"), visitId: await byPet("clinicalVisit"),
    allergyId: await byPet("allergy"), conditionId: await byPet("condition"), medicationId: await byPet("medication"), observationId: await byPet("petObservation"),
    incidentId: await byPet("lostPetIncident"), memoryId: await byPet("petMemory"), tripId: await byPet("trip"), planId: await byPet("rehabPlan"),
    caseId: await first(db.supportCase.findFirst({ where: { requesterUserId: P } })),
    campaignId: await first(db.supportCampaign.findFirst({ where: { status: "ACTIVE" } })),
    listingId: await first(db.supportNeedListing.findFirst({ where: { status: "PUBLISHED" } })),
    organizationId: await first(db.animalSupportOrganization.findFirst({ where: { isPubliclyListed: true, verificationStatus: "VERIFIED" } })),
    postId: await first(db.communityPost.findFirst({ where: { status: "PUBLISHED" } })),
    placeId: await first(db.petFriendlyPlace.findFirst({ where: { isPubliclyListed: true } })),
    productId: await first(db.insuranceProduct.findFirst({})),
    providerId: await first(db.providerOrganization.findFirst({ where: { verificationStatus: "VERIFIED", type: "VET_CLINIC" } })),
    serviceId: await first(db.providerService.findFirst({ where: { isActive: true, providerOrganization: { verificationStatus: "VERIFIED" } } })),
    slug: await fa(),
  };
  // Route-specific [id]s.
  const idFor = {
    "/admin/animal-support/needs/[id]": params.listingId, "/admin/animal-support/organizations/[id]": params.organizationId,
    "/admin/commerce/orders/[id]": await first(db.order.findFirst({})), "/admin/content/[id]": await first(db.article.findFirst({})), "/admin/content/[id]/versions": await first(db.article.findFirst({})),
    "/admin/customers/[id]": P, "/admin/disputes/[id]": await first(db.dispute.findFirst({})), "/admin/lost-pets/[id]": await first(db.lostPetIncident.findFirst({})),
    "/admin/seller-finance/[id]": qaSeller?.id, "/admin/services/bookings/[id]": await first(db.booking.findFirst({})), "/admin/settlements/[id]": await first(db.sellerSettlement.findFirst({})),
    "/admin/subscriptions/households/[id]": hh.householdId, "/admin/travel/bookings/[id]": await first(db.travelBooking.findFirst({})), "/admin/travel/listings/[id]": await first(db.travelListing.findFirst({})),
    "/admin/trust/[id]": await first(db.trustCase.findFirst({})),
    "/bookings/[id]": await first(db.booking.findFirst({ where: { userId: P } })), "/orders/[id]": await first(db.order.findFirst({ where: { userId: P } })),
    "/donations/[id]": await first(db.donationIntent.findFirst({ where: { donorUserId: P } })), "/community/messages/[id]": await first(db.chatConversation.findFirst({ where: { participants: { some: { userId: P } } } })),
    "/support/tickets/[id]": params.caseId, "/pets/[id]": pet.id,
    "/shop/products/[id]": await first(db.product.findFirst({ where: { status: "ACTIVE" } })), "/travel/stays/[id]": await first(db.travelListing.findFirst({ where: { status: "PUBLISHED", isPubliclyListed: true } })),
    "/seller/orders/[id]": await first(db.order.findFirst({ where: { sellerOrganizationId: qaSeller?.id } })), "/seller/finance/settlements/[id]": await first(db.sellerSettlement.findFirst({ where: { sellerOrganizationId: qaSeller?.id } })),
  };
  const results = [];
  const browser = await chromium.launch();
  const fill = (route) => {
    let missing = null;
    const path = route.replace(/\[([^\]]+)\]/g, (_m, k) => {
      if (k === "...rest") return "definitely-missing-page";
      const v = k === "id" ? idFor[route] ?? (route.includes("/pets/[id]") ? pet.id : null) : k === "category" ? "VET" : k === "token" ? null : params[k];
      if (!v) missing = missing ?? k;
      return v ?? `MISSING_${k}`;
    });
    return { path, missing };
  };
  for (const raw of pages) {
    const group = (raw.match(/^\/\(([a-z-]+)\)/) || [])[1] || "root";
    const route = raw.replace(/^\/\([a-z-]+\)/, "") || "/";
    const { path, missing } = fill(route);
    if (missing) { results.push({ route, group, skipped: `NO_QA_FIXTURE:${missing}` }); continue; }
    const persona = personas[group] || null;
    for (const [locale, width] of [["fa", 1440], ["fa", 390], ["en", 1440]]) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: locale === "fa" ? "fa-IR" : "en-US" });
      if (persona) await ctx.addCookies([{ name: "petlife_session", value: persona.cookie, url: BASE }]);
      const page = await ctx.newPage();
      const rec = { route, group, locale, width, url: `/${locale}${path === "/" ? "" : path}`, pageErrors: [], consoleErrors: 0, apiFailures: [] };
      page.on("pageerror", (e) => rec.pageErrors.push(String(e.message).slice(0, 160)));
      page.on("console", (m) => { if (m.type() === "error") rec.consoleErrors++; });
      page.on("response", (r) => { const u = r.url(); if (u.includes("/api/") && r.status() >= 400) rec.apiFailures.push(`${r.status()} ${r.request().method()} ${u.replace(BASE, "").replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ":id").slice(0, 120)}`); });
      try {
        const resp = await page.goto(BASE + rec.url, { waitUntil: "networkidle", timeout: 30000 });
        rec.status = resp?.status();
        rec.finalPath = new URL(page.url()).pathname;
        await page.waitForTimeout(400);
        const scan = await page.evaluate((loc) => {
          const chrome = [...document.querySelectorAll("nav a, nav button, button, h1, h2, h3, label, th, [role=tab], [role=status], option, input[placeholder], legend")];
          const txt = chrome.map((e) => (e.getAttribute("placeholder") || e.textContent || "").trim()).filter(Boolean);
          const words = txt.join(" ");
          const links = [...document.querySelectorAll("a[href^='/']")].map((a) => a.getAttribute("href"));
          return {
            latin: loc === "fa" ? [...new Set((words.match(/[A-Za-z][A-Za-z]{2,}/g) || []))] : [],
            latinDigits: loc === "fa" ? /[0-9]/.test(words) : false,
            enums: [...new Set((document.body.innerText.match(/\b[A-Z]{2,}(?:_[A-Z]+)+\b/g) || []))].slice(0, 8),
            arabic: loc === "en" ? [...new Set((words.match(/[؀-ۿ]{2,}/g) || []))].slice(0, 8) : [],
            overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
            badLinks: [...new Set(links.filter((h) => /^\/(fa|en)\/(fa|en)(\/|$)/.test(h) || !/^\/(fa|en)(\/|$|\?)/.test(h) && !/^\/(api|_next|uploads)\//.test(h)))].slice(0, 6),
            errorState: /(خطایی رخ داد|مشکلی پیش آمد|Something went wrong|Application error|صفحه پیدا نشد|Page not found|could not be found|^404$)/im.test(document.body.innerText),
            loginWall: /\/(fa|en)\/(login|account|auth)/.test(location.pathname) && !/account\/?$/.test(location.pathname) ? true : false,
          };
        }, locale);
        Object.assign(rec, scan);
        rec.latin = (rec.latin || []).filter((w) => !ALLOW.test(w)).slice(0, 10);
      } catch (e) { rec.error = String(e.message).slice(0, 160); }
      results.push(rec);
      await ctx.close();
    }
  }
  await browser.close();
  await db.session.deleteMany({ where: { id: { in: Object.values(personas).filter(Boolean).map((p) => p.sessionId) } } });
  console.log(JSON.stringify(results));
  await db.$disconnect();
})().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
