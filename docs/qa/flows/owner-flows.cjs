#!/usr/bin/env node
/**
 * Browser mutation flows (UX hardening 2026 §68–69). Real clicks on the canonical site as the stable UX QA
 * personas (seed-ux-personas.ts) — never owner.review / showcase accounts. Every save is verified after a full
 * page reload (and in the database), not from optimistic UI.
 *
 *   cd /var/www/petlife-os/apps/api && set -a && . ./.env && set +a && \
 *   NODE_PATH=/opt/petlife-qa/node_modules PRISMA_CLIENT=/var/www/petlife-os/node_modules/.pnpm/node_modules/@prisma/client \
 *   FLOWS=all OUT=flow-results.json SHOTS=/tmp/flow-shots node owner-flows.cjs
 */
const { chromium } = require("playwright");
const fs = require("fs");
const { createHmac } = require("crypto");
const { PrismaClient } = require(process.env.PRISMA_CLIENT);
const db = new PrismaClient();
const BASE = process.env.BASE || "http://185.231.112.154";
const SHOTS = process.env.SHOTS || "/tmp/flow-shots";
const RICH = "qa-ux-owner-rich@example.test";
const sign = (id) => `${id}.${createHmac("sha256", process.env.SESSION_SECRET).update(id).digest("hex")}`;
const sessions = [];
const results = [];
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");

async function contextFor(browser, email, { width = 1440, locale = "fa" } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, locale: locale === "fa" ? "fa-IR" : "en-US", reducedMotion: "reduce" });
  if (email) {
    const u = await db.user.findUnique({ where: { email } });
    if (!u) throw new Error(`persona missing: ${email}`);
    const s = await db.session.create({ data: { userId: u.id, expiresAt: new Date(Date.now() + 2 * 3600e3), userAgent: "petlife-ux-flows" } });
    sessions.push(s.id);
    await ctx.addCookies([{ name: "petlife_session", value: sign(s.id), url: BASE }]);
    ctx.userId = u.id;
  }
  return ctx;
}

async function flow(name, persona, fn) {
  if (process.env.FLOWS && process.env.FLOWS !== "all" && !process.env.FLOWS.split(",").includes(name)) return;
  const steps = [];
  const step = (label, ok, detail = "") => { steps.push({ label, ok, detail }); if (!ok) throw new Error(`${label}: ${detail}`); };
  const browser = flow.browser;
  const ctx = await contextFor(browser, persona);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 140)));
  page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 500) errors.push(`${r.status()} ${r.url().replace(BASE, "")}`); });
  const started = Date.now();
  try {
    await fn({ page, ctx, step, go: (p) => page.goto(BASE + p, { waitUntil: "networkidle", timeout: 45000 }) });
    results.push({ flow: name, persona, status: errors.length ? "PASS_WITH_ERRORS" : "PASS", steps, errors, ms: Date.now() - started });
  } catch (e) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }).catch(() => {});
    results.push({ flow: name, persona, status: "FAIL", steps, errors, error: String(e.message).split("\n")[0].slice(0, 240), url: page.url().replace(BASE, ""), ms: Date.now() - started });
  } finally {
    await ctx.close();
  }
}


/** The canonical Jalali/Gregorian picker: open the field, click the ISO day, apply. */
async function pickDate(page, label, iso) {
  await page.getByRole("button", { name: new RegExp(`^${label}`) }).first().click();
  const sheet = page.getByRole("dialog");
  for (let i = 0; i < 3 && !(await sheet.locator(`button[data-iso="${iso}"]`).count()); i++) await sheet.getByRole("button", { name: /ماه بعد|Next month/ }).click();
  await sheet.locator(`button[data-iso="${iso}"]`).first().click();
  await sheet.getByRole("button", { name: /تأیید تاریخ|Apply dates/ }).click();
}
const isoDay = (offsetDays) => new Date(Date.now() + offsetDays * 86400e3 + 3.5 * 3600e3).toISOString().slice(0, 10);

const richPet = async () => {
  const u = await db.user.findUnique({ where: { email: RICH } });
  const hm = await db.householdMember.findFirst({ where: { userId: u.id, role: "OWNER" } });
  return db.pet.findFirst({ where: { householdId: hm.householdId, name: "نیلو" } });
};

(async () => {
  flow.browser = await chromium.launch();
  const pet = await richPet();
  const petBase = `/fa/pets/${pet.id}`;

  // ---------------------------------------------------------------- BOOK → persists → CANCEL
  await flow("BOOK_SERVICE_AND_CANCEL", RICH, async ({ page, step, go, ctx }) => {
    const org = await db.providerOrganization.findFirst({ where: { name: "درمانگاه دامپزشکی مهر" } });
    const service = await db.providerService.findFirst({ where: { providerOrganizationId: org.id, name: "واکسیناسیون", isActive: true } });
    step("fixture", !!org && !!service, "demo clinic/service");
    let found = false;
    for (let d = 1; d <= 10 && !found; d++) {
      const day = new Date(Date.now() + d * 86400e3).toISOString().slice(0, 10);
      await go(`/fa/providers/${org.id}/book?serviceId=${service.id}&date=${day}`);
      // service step → pet step
      await page.getByRole("button", { name: "ادامه" }).click({ timeout: 10000 });
      // With a single eligible pet the flow preselects it and the pet step may already be passed.
      const petInput = page.locator("label", { hasText: "نیلو" }).locator("input[name=pet]");
      if (await petInput.count()) { await petInput.check({ timeout: 10000 }); await page.getByRole("button", { name: "ادامه" }).click({ timeout: 10000 }); }
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(600);
      const slots = page.locator("fieldset button[aria-pressed]");
      if ((await slots.count()) > 0) {
        for (let i = 0; i < 3 && !found; i++) {
          const pick = slots.nth((await slots.count()) - 1 - i); // latest slots: earlier QA runs may still hold the first ones
          await pick.click({ timeout: 10000 });
          await page.waitForTimeout(400);
          found = (await pick.getAttribute("aria-pressed")) === "true" && (await page.getByRole("button", { name: "نگه‌داشتن این زمان" }).isEnabled());
        }
      }
    }
    step("open slot found", found, "no AVAILABLE slot in 10 days");
    step("slot selected", true);
    await page.getByRole("button", { name: "نگه‌داشتن این زمان" }).click({ timeout: 10000 });
    await page.getByRole("button", { name: "ادامه" }).waitFor({ timeout: 15000 });
    step("hold created", true);
    await page.locator("textarea").first().fill("واکسن سالانه — آزمون خودکار QA").catch(() => {});
    const minimal = page.locator("input[name=health]").first();
    if (await minimal.count()) await minimal.check();
    await page.getByRole("button", { name: "ادامه" }).click({ timeout: 10000 });
    await page.getByRole("button", { name: /تأیید نوبت/ }).click({ timeout: 10000 });
    await page.waitForURL(/\/fa\/bookings\/[0-9a-f-]{36}/, { timeout: 20000 });
    const bookingId = page.url().match(/bookings\/([0-9a-f-]{36})/)[1];
    step("confirmation page", true, bookingId);
    await page.reload({ waitUntil: "networkidle" });
    step("booking visible after reload", await page.getByText("واکسیناسیون").first().isVisible());
    const row = await db.booking.findUnique({ where: { id: bookingId } });
    step("booking persisted", row?.userId === ctx.userId && ["CONFIRMED", "PENDING_PROVIDER", "REQUESTED"].includes(row.bookingStatus), row?.bookingStatus);
    await go("/fa/bookings");
    step("listed in my bookings", (await page.locator(`a[href*="${bookingId}"]`).count()) > 0);
    // cancel
    await go(`/fa/bookings/${bookingId}`);
    await page.getByRole("button", { name: /لغو/ }).first().click();
    const dialog = page.getByRole("dialog");
    if (await dialog.isVisible().catch(() => false)) {
      const reason = dialog.locator("textarea, input[type=text]").first();
      if (await reason.count()) await reason.fill("آزمون خودکار QA");
      await dialog.getByRole("button", { name: /لغو|تأیید/ }).last().click();
    }
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: "networkidle" });
    const after = await db.booking.findUnique({ where: { id: bookingId } });
    step("cancel persisted", /CANCEL/.test(after.bookingStatus), after.bookingStatus);
  });



  // ---------------------------------------------------------------- START TRIAL (subscription change) — unlocks custom reminders
  await flow("START_TRIAL", RICH, async ({ page, step, go, ctx }) => {
    const hm = await db.householdMember.findFirst({ where: { userId: ctx.userId, role: "OWNER" } });
    const before = await db.subscription.findFirst({ where: { householdId: hm.householdId }, include: { plan: true } });
    if (before?.status === "TRIALING" || (before?.plan?.code && before.plan.code !== "free")) { step("already on trial/paid", true, `${before.status} ${before.plan.code}`); return; }
    await go("/fa/subscription/plans");
    const button = page.getByRole("button", { name: /شروع دوره آزمایشی/ }).first();
    step("trial offered", await button.isVisible().catch(() => false));
    await button.click();
    await page.waitForTimeout(2000);
    await page.reload({ waitUntil: "networkidle" });
    const after = await db.subscription.findFirst({ where: { householdId: hm.householdId }, include: { plan: true }, orderBy: { createdAt: "desc" } });
    step("trial persisted", after?.status === "TRIALING", `${after?.status} ${after?.plan?.code}`);
    await go("/fa/subscription");
    step("membership page shows trial", await page.getByText(/آزمایشی/).first().isVisible());
  });

  // ---------------------------------------------------------------- ADD REMINDER → reload → cancel
  await flow("ADD_REMINDER", RICH, async ({ page, step, go }) => {
    const title = `یادآور آزمون QA ${stamp}`;
    await go(`${petBase}/care`);
    await page.getByRole("button", { name: "یادآور جدید" }).first().click();
    await page.getByLabel("عنوان").fill(title);
    await pickDate(page, "روز", isoDay(5));
    await page.locator("form").getByRole("button", { name: /ذخیره|ثبت/ }).first().click();
    await page.getByText(title).first().waitFor({ timeout: 15000 });
    await page.reload({ waitUntil: "networkidle" });
    step("visible after reload", await page.getByText(title).first().isVisible());
    const row = await db.careReminder.findFirst({ where: { petId: pet.id, title } });
    step("persisted", !!row && row.dueAt > new Date(), row?.dueAt?.toISOString());
    await go(`${petBase}/care/${row.id}`);
    step("detail page shows it", await page.getByRole("heading", { name: title }).isVisible());
    await page.getByRole("button", { name: "لغو" }).first().click();
    // Destructive: an in-place confirmation must appear before anything changes (§52).
    const yes = page.getByRole("button", { name: "بله، لغو شود" });
    if (await yes.isVisible({ timeout: 3000 }).catch(() => false)) {
      step("cancel asks for confirmation", (await db.careReminder.findUnique({ where: { id: row.id } })).cancelledAt === null);
      await yes.click();
    }
    await page.waitForTimeout(1200);
    const after = await db.careReminder.findUnique({ where: { id: row.id } });
    step("cancel persisted", !!after.cancelledAt || after.state === "CANCELLED", after.state);
  });

  // ---------------------------------------------------------------- EDIT PET → reload
  await flow("EDIT_PET", RICH, async ({ page, step, go }) => {
    const color = `خاکستری آبی یکدست (${stamp})`;
    await go(petBase);
    await page.getByRole("link", { name: "ویرایش مشخصات" }).first().click();
    step("edit form opens in place", await page.getByLabel("رنگ و نشانه‌های ظاهری").isVisible({ timeout: 8000 }).catch(() => false), page.url().replace(BASE, ""));
    const field = page.getByLabel("رنگ و نشانه‌های ظاهری");
    await field.fill(color);
    await page.getByRole("button", { name: "ذخیره" }).first().click();
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: "networkidle" });
    const row = await db.pet.findUnique({ where: { id: pet.id } });
    step("persisted", row.colorMarkings === color, row.colorMarkings);
  });

  // ---------------------------------------------------------------- ADD MEMORY → reload
  await flow("ADD_MEMORY", RICH, async ({ page, step, go }) => {
    const title = `خاطره‌ی آزمون QA ${stamp}`;
    await go(`${petBase}/memories/new`);
    await page.getByLabel("عنوان").first().fill(title);
    await pickDate(page, "تاریخ", isoDay(0));
    await page.getByRole("button", { name: "ذخیره خاطره" }).click();
    await page.waitForURL((u) => !u.pathname.endsWith("/memories/new"), { timeout: 20000 });
    await page.reload({ waitUntil: "networkidle" });
    step("visible after reload", await page.getByText(title).first().isVisible(), page.url().replace(BASE, ""));
    const row = await db.petMemory.findFirst({ where: { petId: pet.id, title } });
    step("persisted", !!row);
  });

  // ---------------------------------------------------------------- UPLOAD DOCUMENT → reload
  await flow("UPLOAD_DOCUMENT", RICH, async ({ page, step, go }) => {
    const title = `سند آزمون QA ${stamp}`;
    await go(`${petBase}/health/documents`);
    await page.getByLabel("عنوان").first().fill(title);
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    await page.locator("input[type=file]").first().setInputFiles({ name: "qa-scan.png", mimeType: "image/png", buffer: png });
    await page.getByRole("button", { name: "بارگذاری سند" }).click();
    await page.getByText(title).first().waitFor({ timeout: 20000 });
    await page.reload({ waitUntil: "networkidle" });
    step("visible after reload", await page.getByText(title).first().isVisible());
    const row = await db.medicalDocument.findFirst({ where: { petId: pet.id, title } });
    step("persisted with file", !!row && row.fileSizeBytes > 0, row?.mimeType);
  });

  await flow.browser.close();
  await db.session.deleteMany({ where: { id: { in: sessions } } });
  const out = { checkedAt: new Date().toISOString(), base: BASE, results };
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(out, null, 1));
  for (const r of results) console.log(r.status.padEnd(16), r.flow, r.error ? `— ${r.error} @ ${r.url}` : "", r.errors.length ? `errors: ${r.errors.join(" | ")}` : "");
  await db.$disconnect();
})().catch(async (e) => { console.error(e); await db.session.deleteMany({ where: { id: { in: sessions } } }); await db.$disconnect(); process.exit(1); });
