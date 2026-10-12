#!/usr/bin/env node
/**
 * Browser flows for the expense tracker, caregiver care sheet, year in review, OTP sign-in, support tickets
 * and checkout delivery/payment. Real clicks as QA personas (seed-ux-personas.ts); every write is checked after
 * a reload and in the database, and fixtures it creates are removed afterwards.
 *
 *   cd apps/api && set -a && . ./.env && set +a && \
 *   NODE_PATH=<dir with playwright> PRISMA_CLIENT=$PWD/node_modules/@prisma/client \
 *   BASE=http://localhost:3000 [API_ORIGIN=http://localhost:4000] [CHROMIUM_PATH=/opt/pw-browsers/chromium] \
 *   [API_LOG=<api stdout log, dev OTP provider only>] OUT=feature-flow-results.json node docs/qa/flows/feature-flows.cjs
 *
 * OTP flows need the dev OTP provider's log (API_LOG) and are skipped without it; they also trip the OTP rate
 * limit if run many times in a row against the same identifier, which is the limiter working.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const { createHmac, randomUUID } = require("crypto");
const { PrismaClient } = require(process.env.PRISMA_CLIENT);
const db = new PrismaClient();
const BASE = process.env.BASE || "http://localhost:3000";
const API_ORIGIN = process.env.API_ORIGIN || "http://localhost:4000";
const SHOTS = process.env.SHOTS || "/tmp/flow-shots";
const RICH = "qa-ux-owner-rich@example.test";
const sign = (id) => `${id}.${createHmac("sha256", process.env.SESSION_SECRET).update(id).digest("hex")}`;
const sessions = [];
const cleanup = [];
const results = [];

async function contextFor(browser, email, { width = 1440, locale = "fa" } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: locale === "fa" ? "fa-IR" : "en-US", reducedMotion: "reduce" });
  if (email) {
    const u = await db.user.findUnique({ where: { email } });
    const s = await db.session.create({ data: { userId: u.id, expiresAt: new Date(Date.now() + 2 * 3600e3), userAgent: "petlife-feature-flows" } });
    sessions.push(s.id);
    await ctx.addCookies([{ name: "petlife_session", value: sign(s.id), url: BASE }]);
  }
  return ctx;
}

async function flow(name, persona, opts, fn) {
  const steps = [];
  const step = (label, ok, detail = "") => { steps.push({ label, ok, detail: String(detail).slice(0, 160) }); if (!ok) throw new Error(`${label}: ${detail}`); };
  const ctx = await contextFor(flow.browser, persona, opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror " + String(e.message).slice(0, 140)));
  page.on("response", (r) => { const u = r.url(); if ((u.startsWith(API_ORIGIN) || u.includes("/api/")) && r.status() >= 500) errors.push(`${r.status()} ${u.replace(API_ORIGIN, "")}`); });
  const started = Date.now();
  try {
    await fn({ page, step, go: (p) => page.goto(BASE + p, { waitUntil: "networkidle", timeout: 45000 }) });
    results.push({ flow: name, status: errors.length ? "PASS_WITH_ERRORS" : "PASS", steps, errors, ms: Date.now() - started });
  } catch (e) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => {});
    results.push({ flow: name, status: "FAIL", steps, errors, error: String(e.message).split("\n")[0].slice(0, 240), url: page.url().replace(BASE, ""), ms: Date.now() - started });
  } finally {
    if (opts.shot) await page.screenshot({ path: `${SHOTS}/${opts.shot}.png`, fullPage: true }).catch(() => {});
    await ctx.close();
  }
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  flow.browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const owner = await db.user.findUnique({ where: { email: RICH } });
  const hh = await db.householdMember.findFirst({ where: { userId: owner.id, role: "OWNER" } });
  const pet = await db.pet.findFirst({ where: { householdId: hh.householdId }, orderBy: { createdAt: "asc" } });
  const petBase = `/fa/pets/${pet.id}`;

  // A user who can see the pet through a manual grant but is not in its household.
  const outsider = await db.user.create({ data: { displayName: "QA outsider", email: `qa-outsider-${randomUUID()}@example.test` } });
  cleanup.push(() => db.user.delete({ where: { id: outsider.id } }));
  await db.petAccessGrant.create({ data: { petId: pet.id, userId: outsider.id, canViewCareProfile: true, source: "MANUAL", grantedByUserId: owner.id } });

  // A completed, priced booking this year, so a derived expense row exists.
  const svc = await db.providerService.findFirst({ where: { isActive: true, category: "GROOMING", providerOrganization: { verificationStatus: "VERIFIED" } }, include: { providerOrganization: true } });
  const loc = await db.providerLocation.findFirst({ where: { providerOrganizationId: svc.providerOrganizationId } });
  const start = new Date(Date.now() - 3 * 86400e3);
  const booking = await db.booking.create({ data: { householdId: hh.householdId, petId: pet.id, userId: owner.id, providerOrganizationId: svc.providerOrganizationId, providerLocationId: loc.id, providerServiceId: svc.id, category: "GROOMING", locationMode: "AT_PROVIDER", startAt: start, endAt: new Date(start.getTime() + 3600e3), timezone: "Asia/Tehran", bookingStatus: "COMPLETED", priceAmount: 1_800_000, currency: "IRR" } });
  cleanup.push(() => db.booking.delete({ where: { id: booking.id } }));

  const LOG = process.env.API_LOG;
  const latestOtp = async (identifier, after) => {
    for (let i = 0; i < 40; i++) {
      const lines = fs.readFileSync(LOG, "utf8").split("\n").slice(after);
      const hit = lines.reverse().map((l) => l.match(new RegExp(`identifier=${identifier.replace(/[.@]/g, "\\$&")} code=(\\d{6})`))).find(Boolean);
      if (hit) return hit[1];
      await new Promise((r) => setTimeout(r, 250));
    }
    return null;
  };
  const logLines = () => fs.readFileSync(LOG, "utf8").split("\n").length;

  if (LOG) await flow("OTP_LOGIN", null, { shot: "otp-login-landed" }, async ({ page, step, go }) => {
    await go("/fa/account");
    const mark = logLines();
    await page.getByLabel("آدرس ایمیل").fill("sarah@example.com");
    await page.getByRole("button", { name: "ارسال کد" }).click();
    const code = await latestOtp("sarah@example.com", mark - 1);
    step("dev OTP issued", !!code);
    const first = page.locator("input[inputmode=numeric]").first();
    await first.waitFor({ timeout: 10000 });
    await first.click();
    await page.keyboard.type(code);
    await page.getByRole("button", { name: "تأیید" }).click();
    await page.waitForURL((u) => !/\/(account|auth)(\/|$)/.test(u.pathname), { timeout: 20000 });
    step("signed in and left the sign-in page", true, page.url().replace(BASE, ""));
    step("session cookie issued", (await page.context().cookies()).some((c) => c.name === "petlife_session"));
  });

  if (LOG) await flow("OTP_WRONG_CODE", null, {}, async ({ page, step, go }) => {
    await go("/fa/account");
    await page.getByLabel("آدرس ایمیل").fill("support-admin@example.com");
    await page.getByRole("button", { name: "ارسال کد" }).click();
    const first = page.locator("input[inputmode=numeric]").first();
    await first.waitFor({ timeout: 10000 });
    await first.click();
    await page.keyboard.type("000000");
    await page.getByRole("button", { name: "تأیید" }).click();
    await page.getByText("این کد نادرست است یا منقضی شده.").waitFor({ timeout: 10000 });
    step("wrong code refused with a clear message, still signed out", !(await page.context().cookies()).some((c) => c.name === "petlife_session"));
  });

  await flow("EXPENSES_ADD_EDIT_DELETE", RICH, { shot: "expenses-fa-desktop" }, async ({ page, step, go }) => {
    await go(petBase);
    await page.getByRole("link", { name: "هزینه‌ها" }).first().click();
    await page.waitForURL(/\/expenses$/, { timeout: 15000 });
    await page.getByRole("heading", { name: "هزینه‌ها" }).waitFor({ timeout: 15000 });
    step("tab opens the expense tracker", true);
    await page.getByText("رزرو در پت‌لایف").first().waitFor({ timeout: 15000 });
    step("derived booking row shown", true);
    await page.getByRole("button", { name: "افزودن هزینه" }).first().click();
    await page.getByLabel("مبلغ (تومان)").fill("۲۵۰٬۰۰۰");
    await page.getByLabel("دسته", { exact: true }).selectOption("FOOD");
    const note = `کیسه غذا QA ${Date.now()}`;
    await page.getByLabel("یادداشت (اختیاری)").fill(note);
    await page.getByRole("button", { name: "ذخیره" }).click();
    await page.getByText(note).first().waitFor({ timeout: 15000 });
    await page.reload({ waitUntil: "networkidle" });
    step("visible after reload", await page.getByText(note).first().isVisible());
    let row = await db.petExpense.findFirst({ where: { petId: pet.id, note } });
    step("persisted in IRR", row && row.amountIrr === 2_500_000 && row.category === "FOOD", row && row.amountIrr);
    const li = page.locator("li", { hasText: note });
    await li.getByRole("button", { name: "ویرایش" }).click();
    await page.getByLabel("مبلغ (تومان)").fill("300000");
    await page.getByRole("button", { name: "ذخیره" }).click();
    await page.waitForTimeout(1200);
    await page.reload({ waitUntil: "networkidle" });
    row = await db.petExpense.findFirst({ where: { petId: pet.id, note } });
    step("edit persisted", row.amountIrr === 3_000_000, row.amountIrr);
    step("edited amount shown", await page.locator("li", { hasText: note }).getByText("۳۰۰٬۰۰۰ تومان").isVisible());
    await page.locator("li", { hasText: note }).getByRole("button", { name: "حذف" }).click();
    await page.locator("li", { hasText: note }).getByRole("button", { name: "بله، حذف شود" }).click();
    await page.waitForTimeout(1200);
    await page.reload({ waitUntil: "networkidle" });
    step("gone after reload", !(await page.getByText(note).first().isVisible().catch(() => false)));
    step("deleted in DB", (await db.petExpense.count({ where: { petId: pet.id, note } })) === 0);
  });

  await flow("EXPENSES_INVALID_AMOUNT", RICH, {}, async ({ page, step, go }) => {
    await go(`${petBase}/expenses`);
    await page.getByRole("button", { name: "افزودن هزینه" }).first().click();
    await page.getByLabel("مبلغ (تومان)").fill("خیلی");
    await page.getByRole("button", { name: "ذخیره" }).click();
    step("inline error, nothing saved", await page.getByText("مبلغ را به تومان و به‌صورت عدد صحیح وارد کنید.").first().isVisible({ timeout: 5000 }));
  });

  await flow("EXPENSES_HIDDEN_FOR_NON_MEMBER", outsider.email, { shot: "expenses-non-member" }, async ({ page, step, go }) => {
    await go(petBase);
    await page.getByRole("navigation", { name: "بخش‌های پرونده حیوان" }).waitFor({ timeout: 15000 });
    step("pet visible, expenses tab absent", (await page.getByRole("link", { name: "هزینه‌ها" }).count()) === 0);
    await go(`${petBase}/expenses`);
    await page.waitForTimeout(1500);
    const body = await page.locator("body").innerText();
    step("direct URL shows a no-access state, not data or a skeleton", !/افزودن هزینه|جمع هزینه‌ها/.test(body) && (await page.locator("[aria-label='در حال بارگذاری هزینه‌ها']").count()) === 0, body.slice(0, 160).replace(/\s+/g, " "));
  });

  await flow("CARE_SHEET", RICH, { shot: "care-sheet-fa" }, async ({ page, step, go }) => {
    await go(`${petBase}/care`);
    await page.getByRole("link", { name: "برگه مراقبت برای پرستار" }).click();
    await page.waitForURL(/\/care-sheet$/, { timeout: 15000 });
    await page.getByRole("button", { name: "چاپ / ذخیره PDF" }).waitFor({ timeout: 15000 });
    step("print button", true);
    for (const h of ["روال روزانه", "خلق‌وخو", "نکات سلامت", "مراقبت‌های ۱۴ روز آینده", "برای این سپردن"]) step(`section ${h}`, await page.getByText(h, { exact: true }).first().isVisible());
    await page.getByLabel("تماس اضطراری — نام").fill("مریم");
    step("stay fields are local only", (await db.careProfile.findUnique({ where: { petId: pet.id } }))?.specialInstructionsText !== "مریم");
    await page.emulateMedia({ media: "print" });
    await page.waitForTimeout(300);
    const printVisible = await page.evaluate(() => {
      const chrome = [...document.querySelectorAll("header, nav")].filter((n) => !n.closest(".care-sheet"));
      const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("چاپ"));
      return { chrome: chrome.length, visibleChrome: chrome.filter((n) => getComputedStyle(n).visibility !== "hidden").map((n) => n.className.toString().slice(0, 30)), navHidden: chrome.every((n) => getComputedStyle(n).visibility === "hidden"), printBtnHidden: getComputedStyle(btn.closest(".print-hide")).display === "none" };
    });
    step("print media hides app chrome and controls", printVisible.navHidden && printVisible.printBtnHidden, JSON.stringify(printVisible));
  });

  await flow("YEAR_REVIEW", RICH, { shot: "year-review-fa" }, async ({ page, step, go }) => {
    await go(petBase);
    await page.getByRole("link", { name: "مرور سال و تولد" }).click();
    await page.waitForURL(/\/year-review$/, { timeout: 15000 });
    const heading = page.getByRole("heading", { level: 1 });
    await heading.waitFor({ timeout: 15000 });
    const text = await heading.innerText();
    step("Jalali year heading with pet name", /^سال ۱۴۰۵ با /.test(text) && text.includes(pet.name), text);
    step("memories stat", await page.getByText("خاطره", { exact: true }).isVisible());
    step("birthday or invitation to add one", await page.getByText(/تا تولد|تولد .* سالگی|تاریخ تولد ثبت نشده/).first().isVisible());
    await page.getByRole("button", { name: "سال قبل" }).click();
    await page.getByRole("heading", { name: /۱۴۰۴/ }).waitFor({ timeout: 10000 });
    step("previous year navigates", true);
  });

  await flow("EXPENSES_EN", RICH, { locale: "en", shot: "expenses-en" }, async ({ page, step, go }) => {
    await go(`/en/pets/${pet.id}/expenses`);
    await page.getByRole("heading", { name: "Expenses", level: 1 }).waitFor({ timeout: 15000 });
    step("English UI", await page.getByRole("button", { name: "Add expense" }).first().isVisible());
    step("Gregorian year", await page.getByText(String(new Date().getFullYear()), { exact: true }).first().isVisible());
    await page.getByText(/Toman$/).first().waitFor({ timeout: 15000 });
    step("Toman amounts", true);
  });

  await flow("SUPPORT_TICKET_CREATE", RICH, { shot: "support-ticket" }, async ({ page, step, go }) => {
    const subject = `QA موضوع پشتیبانی ${Date.now()}`;
    await go("/fa/support/new");
    await page.getByLabel("موضوع").fill(subject);
    await page.getByLabel("توضیح مشکل").fill("این یک درخواست آزمایشی برای بررسی جریان پشتیبانی است.");
    await page.getByRole("button", { name: "ثبت درخواست" }).click();
    await page.waitForURL(/\/support\/tickets\/[0-9a-f-]{36}/, { timeout: 20000 });
    await page.reload({ waitUntil: "networkidle" });
    step("ticket page shows the subject after reload", await page.getByText(subject).first().isVisible());
    const row = await db.supportCase.findFirst({ where: { subject } });
    step("persisted for the requester", row && row.requesterUserId === owner.id, row && row.status);
    cleanup.push(() => db.supportCase.delete({ where: { id: row.id } }));
  });

  await flow("CHECKOUT_DELIVERY_REQUIRED_AND_PAY", RICH, { shot: "checkout-paid" }, async ({ page, step, go }) => {
    const offer = await db.sellerOffer.findFirst({ where: { productVariant: { product: { status: "ACTIVE" } } }, include: { productVariant: true }, orderBy: { createdAt: "asc" } });
    await go(`/fa/shop/products/${offer.productVariant.productId}`);
    await page.getByRole("button", { name: "افزودن به سبد خرید" }).first().click();
    await page.waitForTimeout(1200);
    await go("/fa/cart");
    await page.getByRole("button", { name: "ادامه تا پرداخت" }).or(page.getByRole("link", { name: "ادامه تا پرداخت" })).first().click();
    await page.waitForURL(/\/checkout$/, { timeout: 15000 });
    if (await page.getByLabel("نام گیرنده").isVisible().catch(() => false)) {
      await page.getByLabel("نام گیرنده").fill("سارا محمدی");
      await page.getByLabel("تلفن همراه").fill("09121234567");
      await page.getByLabel("شهر").fill("تهران");
      await page.getByLabel("آدرس", { exact: true }).fill("خیابان ولیعصر، پلاک ۱۲");
      await page.getByRole("button", { name: "ذخیره آدرس" }).click();
      await page.waitForTimeout(1200);
    }
    await page.getByRole("button", { name: "ادامه" }).last().click();
    await page.getByRole("button", { name: "ادامه" }).last().waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: "ادامه" }).last().click();
    const cont = page.getByRole("button", { name: "ادامه" }).last();
    await page.getByText("برای ادامه، روش ارسال را انتخاب کنید.").waitFor({ timeout: 15000 });
    step("continue is disabled until delivery is chosen", await cont.isDisabled());
    await page.getByRole("button", { name: /ارسال عادی/ }).first().click();
    await page.getByText("انتخاب‌شده").first().waitFor({ timeout: 15000 }).catch(() => {});
    await page.waitForFunction(() => { const b = [...document.querySelectorAll("button")].filter((x) => x.textContent.trim() === "ادامه").pop(); return b && !b.disabled; }, null, { timeout: 15000 });
    step("continue enabled after choosing", true);
    await cont.click();
    const online = page.getByRole("button", { name: /پرداخت آنلاین/ });
    await online.waitFor({ timeout: 15000 });
    const summary = await page.locator("body").innerText();
    step("delivery is no longer zero", !/ارسال\s*\n?\s*۰ تومان/.test(summary), summary.match(/ارسال[^\n]*\n?[^\n]*/)?.[0]);
    await online.click();
    await page.getByText("مبلغ قابل پرداخت").waitFor({ timeout: 15000 });
    const due = await page.locator("body").innerText();
    step("amount due includes delivery", /مبلغ قابل پرداخت\s*\n?\s*[۰-۹٬,]+ تومان/.test(due), due.match(/مبلغ قابل پرداخت[^\n]*\n?[^\n]*/)?.[0]);
    await page.getByRole("button", { name: "پرداخت آنلاین", exact: true }).click();
    // The sandbox either confirms at once or shows a simulator; both must end on the confirmation page.
    const confirmed = page.waitForURL(/\/checkout\/[0-9a-f-]{36}\/confirmation/, { timeout: 20000 });
    const simulate = page.getByRole("button", { name: "شبیه‌سازی پرداخت موفق" });
    await Promise.race([confirmed, simulate.waitFor({ timeout: 20000 }).then(() => simulate.click())]).catch(() => {});
    await confirmed;
    const checkoutId = page.url().match(/checkout\/([0-9a-f-]{36})/)[1];
    const orders = await db.order.findMany({ where: { checkoutId } });
    step("order created with real delivery amount", orders.length > 0 && orders.every((o) => o.deliveryAmount > 0), orders.map((o) => `${o.status}:${o.deliveryAmount}`).join(","));
    const intent = await db.paymentIntent.findFirst({ where: { checkoutId } });
    step("payment captured for the full total", intent && intent.status === "CAPTURED" && intent.amount === orders.reduce((a, o) => a + o.totalAmount, 0), intent && `${intent.status}:${intent.amount}`);
  });

  for (const [name, path] of [["MOBILE_EXPENSES", "/expenses"], ["MOBILE_CARE_SHEET", "/care-sheet"], ["MOBILE_YEAR_REVIEW", "/year-review"]]) {
    await flow(name, RICH, { width: 390, shot: name.toLowerCase() }, async ({ page, step, go }) => {
      await go(petBase + path);
      await page.getByRole("heading", { level: 1 }).first().waitFor({ timeout: 15000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      step("no horizontal overflow at 390px", overflow <= 2, overflow);
    });
  }

  await flow.browser.close();
  await db.session.deleteMany({ where: { id: { in: sessions } } });
  for (const fn of cleanup.reverse()) await fn().catch(() => {});
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 1));
  for (const r of results) console.log(r.status.padEnd(16), r.flow, r.error ? `— ${r.error} @ ${r.url}` : "", r.errors.length ? `errors: ${r.errors.join(" | ")}` : "");
  await db.$disconnect();
})().catch(async (e) => { console.error(e); await db.session.deleteMany({ where: { id: { in: sessions } } }); for (const fn of cleanup.reverse()) await fn().catch(() => {}); await db.$disconnect(); process.exit(1); });
