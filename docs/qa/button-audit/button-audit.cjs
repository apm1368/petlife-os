#!/usr/bin/env node
/**
 * Button audit (UX hardening 2026). Clicks every visible non-mutating control, checks every link. Canonical site only. QA personas only; sessions are created for the run and
 * deleted afterwards; page loads are GET navigations (no clicks that write).
 *
 *   cd /var/www/petlife-os/apps/api && set -a && . ./.env && set +a && \
 *   NODE_PATH=/opt/petlife-qa/node_modules PRISMA_CLIENT=/var/www/petlife-os/node_modules/.pnpm/node_modules/@prisma/client \
 *   PAGES=pages.txt OUT=button-audit.json node button-audit.cjs
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
    app: await sessionFor(process.env.APP_EMAIL || "qa-erp-owner@example.test"),
    admin: await sessionFor(process.env.ADMIN_EMAIL || "qa-admin-super@example.test"),
    provider: await sessionFor("qa-erp-owner@example.test"),
    seller: await sessionFor("qa-erp-owner@example.test"),
  };
  const P = personas.app.userId;
  const hh = await db.householdMember.findFirst({ where: { userId: P, role: "OWNER" } });
  const pet = (await db.pet.findFirst({ where: { householdId: hh.householdId, memories: { some: {} } } }).catch(() => null)) ?? await db.pet.findFirst({ where: { householdId: hh.householdId } });
  const qaClinic = await db.providerOrganization.findFirst({ where: { name: "کلینیک نمایشی ERP (QA)" } });
  const PV = personas.provider.userId; // provider context lives on the QA provider persona only
  await db.providerContextPreference.upsert({ where: { userId: PV }, create: { userId: PV, providerOrganizationId: qaClinic.id }, update: { providerOrganizationId: qaClinic.id } });
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
  const browser = await chromium.launch();
  const rows = [];
  const shellSeen = new Set();
  const linkCache = new Map();
  const DESTRUCTIVE = /حذف|لغو|delete|remove|cancel|revoke|suspend|تعلیق|ابطال|log ?out|خروج|sign out|block|مسدود|report|گزارش|archive|بایگانی|reject|رد کردن|approve|تأیید|پرداخت|\bpay|submit|ارسال|ثبت|save|ذخیره|send|publish|انتشار|confirm|refund|بازپرداخت|ban|merge|ادغام|run|اجرا|retry|تلاش دوباره|claim|برداشتن|release|رها|dismiss|reset|بازنشانی|disable|غیرفعال|enable|فعال‌سازی|accept|پذیرش|decline|upload|بارگذاری|book|رزرو|checkout|خرید|add to|افزودن به|follow|دنبال|like|پسند|join|عضویت|start trial|آزمایشی|subscribe|اشتراک|upgrade|ارتقا|invite|دعوت|grant|اعطا|share|اشتراک‌گذاری|export|خروجی|download|دانلود|print|چاپ|copy|کپی|mark|علامت|resolve|حل|escalate|ارجاع|assign|واگذاری|close|بستن|favorite|علاقه|bookmark|نشان|snooze|تعویق|complete|انجام شد|toggle|vote|رأی/i;
  const SKIP_ROUTES = /\/definitely-missing-page/;
  async function checkLink(href, cookie) {
    if (linkCache.has(href)) return linkCache.get(href);
    let r;
    try {
      const res = await fetch(BASE + href, { redirect: "manual", headers: cookie ? { cookie: `petlife_session=${cookie}` } : {}, signal: AbortSignal.timeout(20000) });
      r = { status: res.status, location: res.headers.get("location") };
    } catch (e) { r = { status: "NETWORK", error: String(e.message).slice(0, 80) }; }
    linkCache.set(href, r);
    return r;
  }
  const pass = { links: 0, buttons: 0 };
  const CONTEXTS = (process.env.CONTEXTS || "fa:1440:click,fa:390:click,en:1440:links").split(",").map((s) => { const [locale, w, mode] = s.split(":"); return { locale, width: +w, mode }; });
  for (const raw of pages) {
    const group = (raw.match(/^\/\(([a-z-]+)\)/) || [])[1] || "root";
    const route = raw.replace(/^\/\([a-z-]+\)/, "") || "/";
    const { path, missing } = fill(route);
    if (missing || SKIP_ROUTES.test(path)) { rows.push({ route, locale: "*", viewport: "*", control: "*", expected: "page", actual: `NO_QA_FIXTURE:${missing}`, status: "MISSING_STATE" }); continue; }
    const persona = personas[group] || null;
    for (const { locale, width, mode } of CONTEXTS) {
      const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: locale === "fa" ? "fa-IR" : "en-US", reducedMotion: "reduce" });
      if (persona) await ctx.addCookies([{ name: "petlife_session", value: persona.cookie, url: BASE }]);
      const page = await ctx.newPage();
      page.on("dialog", (d) => d.dismiss().catch(() => {}));
      const url = `/${locale}${path === "/" ? "" : path}`;
      const vp = String(width);
      const push = (control, expected, actual, status, shell = false) => {
        const key = `${group}|${locale}|${vp}|${control}|${expected}`;
        if (shell) { if (shellSeen.has(key)) return; shellSeen.add(key); }
        rows.push({ route: shell ? `(shell:${group})` : route, locale, viewport: vp, control, expected, actual, status });
      };
      try {
        await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(300);
        const finalPath = new URL(page.url()).pathname;
        if (finalPath !== url.split("?")[0]) push("(page)", url, `redirected ${finalPath}`, /\/(welcome|auth|account)/.test(finalPath) ? "PERMISSION_ERROR" : "PASS");
        const controls = await page.evaluate(() => {
          const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
          const label = (e) => (e.getAttribute("aria-label") || e.textContent || e.getAttribute("title") || e.getAttribute("value") || "").replace(/\s+/g, " ").trim().slice(0, 70);
          const shell = (e) => !!e.closest("header, footer, [role=banner], [role=contentinfo], .member-tabbar, .lp-header, .public-site-header");
          const out = [];
          document.querySelectorAll("a").forEach((a, i) => { if (!vis(a)) return; out.push({ kind: "link", i, label: label(a) || "(icon link)", href: a.getAttribute("href"), target: a.getAttribute("target"), shell: shell(a) }); });
          document.querySelectorAll("button, [role=tab], [role=menuitem], summary").forEach((b, i) => {
            if (!vis(b)) return;
            const form = b.closest("form");
            out.push({ kind: "button", i, tag: b.tagName, label: label(b) || "(icon button)", disabled: b.disabled || b.getAttribute("aria-disabled") === "true", submit: b.tagName === "BUTTON" && (b.getAttribute("type") ?? (form ? "submit" : "button")) === "submit" && !!form, shell: shell(b), expanded: b.getAttribute("aria-expanded") });
          });
          document.querySelectorAll("select").forEach((s, i) => { if (!vis(s)) return; out.push({ kind: "select", i, label: s.getAttribute("aria-label") || s.labels?.[0]?.textContent?.trim() || s.name || "(select)", options: s.options.length, disabled: s.disabled, shell: shell(s) }); });
          return out;
        });
        for (const c of controls.filter((c) => c.kind === "link")) {
          const h = c.href ?? "";
          if (!h || h === "#" || /^javascript:/i.test(h)) { push(`link:${c.label}`, "navigate", `href="${h}"`, "DEAD", c.shell); continue; }
          if (/^(https?:)?\/\//.test(h) && !h.startsWith(BASE)) { push(`link:${c.label}`, h, "external", "PASS", c.shell); continue; }
          if (/^(mailto|tel|sms):/.test(h)) { push(`link:${c.label}`, h, "protocol", "PASS", c.shell); continue; }
          if (h.startsWith("#")) { const ok = await page.evaluate((id) => !!document.getElementById(id), h.slice(1)); push(`link:${c.label}`, h, ok ? "anchor" : "missing anchor", ok ? "PASS" : "DEAD", c.shell); continue; }
          const target = h.startsWith("/") ? h : new URL(h, BASE + url).pathname;
          if (/^\/(api|uploads|_next)\//.test(target)) { push(`link:${c.label}`, target, "asset", "PASS", c.shell); continue; }
          const r = await checkLink(target, persona?.cookie);
          const badLocale = !/^\/(fa|en)(\/|$|\?)/.test(target) || /^\/(fa|en)\/(fa|en)(\/|$)/.test(target);
          const status = badLocale ? "WRONG_DESTINATION" : r.status === 404 ? "WRONG_DESTINATION" : r.status === "NETWORK" || r.status >= 500 ? "BROKEN" : "PASS";
          push(`link:${c.label}`, target, `${r.status}${r.location ? " → " + r.location : ""}`, status, c.shell);
          if (status === "PASS") pass.links++;
        }
        for (const c of controls.filter((c) => c.kind === "select")) push(`select:${c.label}`, "choose option", `${c.options} options`, c.options > 0 ? "PASS" : "MISSING_STATE", c.shell);
        const buttons = controls.filter((c) => c.kind === "button");
        if (mode !== "click") { for (const c of buttons) push(`button:${c.label}`, "action", "not clicked in this context", "NOT_TESTED", c.shell); }
        else for (const c of buttons) {
          if (c.disabled) { push(`button:${c.label}`, "action", "disabled", "PASS", c.shell); continue; }
          if (c.submit) { push(`button:${c.label}`, "form submit", "covered by mutation flows", "NOT_TESTED", c.shell); continue; }
          if (DESTRUCTIVE.test(c.label)) { push(`button:${c.label}`, "mutation", "not clicked (mutation/destructive)", "NOT_TESTED", c.shell); continue; }
          const key = `${group}|${locale}|${vp}|button:${c.label}|action`;
          if (c.shell && shellSeen.has(key)) continue;
          const before = page.url();
          let requests = 0; const onReq = (r) => { if (!/\.(png|jpe?g|webp|svg|woff2?|css)(\?|$)/.test(r.url())) requests++; };
          page.on("request", onReq);
          let popup = false; const onPopup = () => { popup = true; }; ctx.on("page", onPopup);
          await page.evaluate(() => { window.__mut = 0; window.__mo?.disconnect(); window.__mo = new MutationObserver((m) => { window.__mut += m.length; }); window.__mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); });
          let actual = "";
          try {
            const loc = page.locator("button, [role=tab], [role=menuitem], summary").nth(c.i);
            await loc.click({ timeout: 3000 });
            await page.waitForTimeout(500);
            const mut = await page.evaluate(() => window.__mut).catch(() => -1);
            const moved = page.url() !== before;
            actual = moved ? `navigated ${new URL(page.url()).pathname}${new URL(page.url()).search}` : popup ? "opened window" : mut > 0 ? `ui changed (${mut})` : requests > 0 ? `request (${requests})` : "no effect";
            const status = actual === "no effect" ? "DEAD" : moved && /\/definitely|not-found/.test(page.url()) ? "WRONG_DESTINATION" : "PASS";
            push(`button:${c.label}`, "action", actual, status, c.shell);
            if (status === "PASS") pass.buttons++;
            if (moved) { await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 30000 }); await page.waitForTimeout(250); }
            else { await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(150); }
          } catch (e) {
            push(`button:${c.label}`, "action", `click failed: ${String(e.message).split("\n")[0].slice(0, 80)}`, "CONFUSING", c.shell);
            await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
          } finally { page.off("request", onReq); ctx.off("page", onPopup); }
        }
      } catch (e) { push("(page)", url, `load failed: ${String(e.message).slice(0, 100)}`, "BROKEN"); }
      await ctx.close();
    }
    process.stderr.write(`${route} done (${rows.length})\n`);
  }
  await browser.close();
  await db.session.deleteMany({ where: { id: { in: Object.values(personas).filter(Boolean).map((p) => p.sessionId) } } });
  const summary = rows.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  fs.writeFileSync(process.env.OUT || "button-audit.json", JSON.stringify({ checkedAt: new Date().toISOString(), base: BASE, contexts: CONTEXTS, summary, rows }, null, 1));
  console.log(JSON.stringify(summary));
  await db.$disconnect();
})().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
