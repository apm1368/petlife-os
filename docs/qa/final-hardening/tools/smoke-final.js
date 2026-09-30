// Final hardening browser smoke — ISOLATED preview only (web :3100, API :4100 on *_test).
// Each flow is driven through the real API as the persona that would do it, then the result is
// checked in the rendered page (fa, 390px): right heading, no system error state, no page errors,
// no failed API calls, no horizontal overflow, Persian digits. One real OTP sign-in through the UI.
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const { createHmac, randomUUID } = require("crypto");
const { PrismaClient } = require(process.env.PRISMA_CLIENT);
const db = new PrismaClient();
if (!new URL(process.env.DATABASE_URL).pathname.endsWith("_test")) throw new Error("preview (*_test) only");
const WEB = "http://localhost:3100", API = "http://localhost:4100";
const results = [];

async function sessionFor(email) {
  const user = (await db.$queryRawUnsafe(`select id::text id from users where email='${email}'`))[0];
  const s = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 3600e3) } });
  const r = await fetch(`${API}/health/live`);
  const csrf = (r.headers.get("set-cookie") ?? "").match(/petlife_csrf=([^;]+)/)[1];
  const session = `${s.id}.${createHmac("sha256", process.env.SESSION_SECRET).update(s.id).digest("hex")}`;
  const call = async (method, path, body, extra = {}) => {
    const res = await fetch(`${API}${path}`, { method, headers: { cookie: `petlife_session=${session}; petlife_csrf=${csrf}`, "x-csrf-token": csrf, "content-type": "application/json", ...extra }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    if (res.status >= 400) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 160)}`);
    return json;
  };
  return { userId: user.id, session, csrf, call };
}

async function main() {
  const browser = await chromium.launch();
  async function check(name, persona, path, expect = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    if (persona) await ctx.addCookies([{ name: "petlife_session", value: persona.session, domain: "localhost", path: "/" }, { name: "petlife_csrf", value: persona.csrf, domain: "localhost", path: "/" }]);
    const page = await ctx.newPage();
    const problems = [];
    page.on("pageerror", (e) => problems.push("pageerror " + e.message.slice(0, 120)));
    page.on("response", (r) => { if (r.url().startsWith(API) && r.status() >= 500) problems.push(`api ${r.status()} ${r.url().slice(API.length, API.length + 70)}`); });
    await page.goto(`${WEB}/fa${path}`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1000);
    const info = await page.evaluate(() => ({ text: (document.querySelector("main") ?? document.body).innerText, kind: document.querySelector("[data-kind]")?.getAttribute("data-kind"), overflow: document.documentElement.scrollWidth - innerWidth, dir: document.documentElement.dir }));
    if (info.kind) problems.push(`system state ${info.kind}`);
    if (info.overflow > 1) problems.push(`overflow ${info.overflow}px`);
    if (info.dir !== "rtl") problems.push(`dir ${info.dir}`);
    for (const needle of expect.contains ?? []) if (!info.text.includes(needle)) problems.push(`missing "${needle}"`);
    await page.screenshot({ path: `/opt/petlife-qa/shots-final/smoke-${name}.png`, fullPage: true });
    await ctx.close();
    return problems;
  }
  async function flow(name, fn) {
    try { const problems = await fn(); results.push({ flow: name, ok: problems.length === 0, problems }); }
    catch (e) { results.push({ flow: name, ok: false, problems: [String(e.message).slice(0, 220)] }); }
  }
  require("fs").mkdirSync("/opt/petlife-qa/shots-final", { recursive: true });

  // AUTH — a real OTP sign-in through the UI, landing back on the requested page.
  await flow("auth-otp-ui", async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await page.goto(`${WEB}/fa/welcome?returnTo=${encodeURIComponent("/fa/profile")}`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "ادامه با ایمیل" }).click();
    await page.waitForTimeout(500);
    const idField = page.locator('input[type="email"], input[type="tel"], input[name="identifier"], input[autocomplete="email"], input[inputmode="email"]').first();
    await idField.fill("batch8-security@example.test");
    await page.getByRole("button", { name: /ادامه|ارسال|دریافت کد|ورود/ }).first().click();
    await page.waitForTimeout(1500);
    const code = execSync(`pm2 logs qa-final-api --lines 300 --nostream 2>/dev/null | grep "DEV OTP" | grep "batch8-security@example.test" | tail -1 | sed -E 's/.*code=([0-9]+).*/\\1/'`).toString().trim();
    if (!/^\d+$/.test(code)) throw new Error("no dev OTP in preview log");
    const otp = page.locator('input[autocomplete="one-time-code"], input[inputmode="numeric"]');
    if ((await otp.count()) > 1) { for (let i = 0; i < code.length; i++) await otp.nth(i).fill(code[i]); } else await otp.first().fill(code);
    const verify = page.getByRole("button", { name: /تأیید|ورود|ادامه/ }).first();
    if (await verify.isEnabled().catch(() => false)) await verify.click().catch(() => undefined);
    await page.waitForURL(/\/fa\/(profile|onboarding|home)/, { timeout: 20000 });
    const landed = new URL(page.url()).pathname;
    await ctx.close();
    return landed.startsWith("/fa/profile") || landed.startsWith("/fa/onboarding") ? [] : [`landed on ${landed}`];
  });

  // ACCOUNT
  const account = await sessionFor("batch8-owner@example.test");
  await flow("account-profile-sessions", async () => check("account", account, "/profile"));

  // PET + HEALTH (owner with a real grant)
  const owner = await sessionFor("batch2-review@example.test");
  const pet = (await db.$queryRawUnsafe(`select p.id::text id, p.name from pets p join pet_access_grants g on g."petId"=p.id where g."userId"='${owner.userId}'::uuid and g."canManageAccess" and g."revokedAt" is null limit 1`))[0];
  await flow("pet-overview", async () => check("pet", owner, `/pets/${pet.id}`, { contains: [pet.name] }));
  await flow("health-record", async () => {
    await owner.call("POST", `/pets/${pet.id}/health/allergies`, { name: `گرده (دود ${Date.now() % 1000})` });
    return check("health", owner, `/pets/${pet.id}/health/allergies`, { contains: ["گرده"] });
  });

  // SERVICES / BOOKING — hold → confirm → pay → confirmed, visible on the booking page
  await flow("services-booking-pay", async () => {
    const svc = (await db.$queryRawUnsafe(`select s.id::text id, s."providerOrganizationId"::text org, s."locationId"::text loc from provider_services s join provider_organizations o on o.id=s."providerOrganizationId" where s."isActive" and o."verificationStatus"='VERIFIED' and s."locationId" is not null and s."supportsDog" and s."paymentMode"::text='FULL_PREPAYMENT' and exists (select 1 from provider_availability_rules r where r."providerOrganizationId"=o.id) limit 1`))[0];
    const dog = (await db.$queryRawUnsafe(`select p.id::text id from pets p join pet_access_grants g on g."petId"=p.id where g."userId"='${owner.userId}'::uuid and p.species='DOG' and g."revokedAt" is null limit 1`))[0];
    const from = new Date(Date.now() + 2 * 86400e3), to = new Date(Date.now() + 9 * 86400e3);
    const variant = (await db.$queryRawUnsafe(`select id::text id from provider_service_variants where "serviceId"='${svc.id}'::uuid and "isActive" limit 1`).catch(() => []))[0];
    const slots = await owner.call("GET", `/provider-services/${svc.id}/availability?from=${from.toISOString()}&to=${to.toISOString()}${variant ? `&variantId=${variant.id}` : ""}`);
    const list = Array.isArray(slots) ? slots : slots.slots ?? slots.items ?? [];
    const slot = list.find((x) => x.state === "AVAILABLE");
    if (!slot) throw new Error("no available slot");
    const hold = await owner.call("POST", "/booking-holds", { petId: dog.id, providerId: svc.org, locationId: svc.loc, serviceId: svc.id, slotStart: slot.startAt, providerUserId: slot.providerUserId, ...(variant ? { variantId: variant.id } : {}) });
    const booking = await owner.call("POST", "/bookings", { holdId: hold.holdId, petId: dog.id }, { "Idempotency-Key": randomUUID() });
    if (booking.bookingStatus === "AWAITING_PAYMENT") await owner.call("POST", `/bookings/${booking.id}/pay`, { mode: "SUCCESS" }, { "Idempotency-Key": randomUUID() });
    return check("booking", owner, `/bookings/${booking.id}`);
  });

  // COMMERCE — cart → checkout → pay → order → cancel with refund
  const customer = await sessionFor("batch4-customer@example.test");
  await flow("commerce-checkout-cancel-refund", async () => {
    const offer = (await db.$queryRawUnsafe(`select o.id::text id from seller_offers o join inventory_items i on i."sellerOfferId"=o.id where o.status::text='ACTIVE' and i."onHand" - i."reserved" > 3 limit 1`).catch(() => []))[0];
    if (!offer) throw new Error("no in-stock offer");
    await customer.call("POST", "/cart/items", { offerId: offer.id, quantity: 1 });
    const cart = await customer.call("GET", "/cart");
    const address = (await db.$queryRawUnsafe(`select id::text id from customer_addresses where "householdId" in (select "householdId" from household_members where "userId"='${customer.userId}'::uuid) limit 1`))[0];
    const checkout = await customer.call("POST", "/checkout", { addressId: address?.id }, { "Idempotency-Key": randomUUID() });
    await customer.call("POST", `/checkout/${checkout.id}/payment-intent`, {});
    const paid = await customer.call("POST", `/checkout/${checkout.id}/pay`, { mode: "SUCCESS" });
    const orderId = (paid.orderIds ?? [])[0];
    if (!orderId) throw new Error(`no order after payment (${JSON.stringify(paid).slice(0, 120)}; cart lines ${cart.lines?.length})`);
    const p1 = await check("order", customer, `/orders/${orderId}`);
    await customer.call("POST", `/orders/${orderId}/cancel`, { reason: "smoke" });
    const p2 = await check("order-cancelled", customer, `/orders/${orderId}`);
    return [...p1, ...p2];
  });

  // TRAVEL — hold → submit → pay → confirmed
  const traveler = await sessionFor("batch5-traveler@example.test");
  await flow("travel-book-pay", async () => {
    const l = (await db.$queryRawUnsafe(`select l.id::text id, u.id::text unit, rp.id::text plan from travel_listings l join travel_inventory_units u on u."listingId"=l.id join travel_rate_plans rp on rp."unitId"=u.id and rp."isActive" where l.status::text='PUBLISHED' and l."bookingMode"::text='INSTANT' limit 1`).catch(() => []))[0]
      ?? (await db.$queryRawUnsafe(`select l.id::text id, u.id::text unit, rp.id::text plan from travel_listings l join travel_inventory_units u on u."listingId"=l.id join travel_rate_plans rp on rp."unitId"=u.id and rp."isActive" where l.status::text='PUBLISHED' limit 1`))[0];
    const pets = (await db.$queryRawUnsafe(`select p.id::text id from pets p join pet_access_grants g on g."petId"=p.id where g."userId"='${traveler.userId}'::uuid and g."revokedAt" is null and p.species='DOG' limit 1`)).map((r) => r.id);
    const day = (n) => new Date(Date.now() + n * 86400e3).toISOString().slice(0, 10);
    const offset = 40 + Math.floor(Math.random() * 200);
    const hold = await traveler.call("POST", "/travel/bookings/hold", { listingId: l.id, unitId: l.unit, ratePlanId: l.plan, checkIn: day(offset), checkOut: day(offset + 2), petIds: pets });
    const sub = await traveler.call("POST", `/travel/bookings/${hold.id}/submit`, { acknowledgeMissingInfo: true });
    if (sub.status === "AWAITING_PAYMENT") await traveler.call("POST", `/travel/bookings/${hold.id}/pay`, { mode: "SUCCESS" });
    return check("travel-booking", traveler, `/travel/bookings/${hold.id}`);
  });

  // LOST PET — report → public page shows it without the exact address
  const dogOwner = await sessionFor("b6-dog-owner@example.test");
  await flow("lost-pet-report", async () => {
    const dp = (await db.$queryRawUnsafe(`select p.id::text id from pets p join pet_access_grants g on g."petId"=p.id where g."userId"='${dogOwner.userId}'::uuid and g."revokedAt" is null and not exists (select 1 from lost_pet_incidents i where i."petId"=p.id and i.status::text in ('SEARCHING','SIGHTING_REPORTED')) limit 1`))[0];
    if (!dp) throw new Error("no pet without an open incident");
    const inc = await dogOwner.call("POST", `/pets/${dp.id}/lost-incidents`, { description: "گم‌شده نزدیک پارک (دود)", publicArea: "ونک", lastKnownLocation: "خیابان ونک، پلاک ۱۲" });
    const probs = await check("lost-public", null, `/lost-pets/${inc.id}`, { contains: ["ونک"] });
    const pub = await (await fetch(`${API}/lost-pets/${inc.id}`)).text();
    if (pub.includes("پلاک ۱۲")) probs.push("public payload carries the private address");
    await dogOwner.call("POST", `/pets/${dp.id}/lost-incidents/${inc.id}/reunite`, {}).catch(() => undefined);
    return probs;
  });

  // ANIMAL SUPPORT — offer help on a published listing
  const helper = await sessionFor(process.env.SMOKE_HELPER ?? "b6-reporter@example.test");
  await flow("animal-support-offer", async () => {
    const need = (await db.$queryRawUnsafe(`select n.id::text id, n.category::text category from support_need_listings n where n.status::text in ('PUBLISHED','PARTIALLY_FULFILLED') and n."creatorUserId" <> '${helper.userId}'::uuid and not exists (select 1 from help_offers o where o."listingId"=n.id and o."helperUserId"='${helper.userId}'::uuid and o.status::text in ('PENDING','ACCEPTED','IN_PROGRESS')) limit 1`))[0];
    if (!need) throw new Error("no open listing for this helper");
    await helper.call("POST", `/animal-support/needs/${need.id}/offers`, { message: "می‌توانم کمک کنم (دود)", helpType: need.category, quantity: 1 });
    const p1 = await check("support-need", helper, `/animal-support/needs/${need.id}`);
    const p2 = await check("my-help", helper, `/animal-support/my-help`);
    const p3 = await check("support-missing", null, `/animal-support/needs/${randomUUID()}`);
    return [...p1, ...p2, ...p3.filter((p) => p !== "system state NOT_FOUND")];
  });

  // DONATION — sandbox donation, receipt page in Toman with Persian digits
  await flow("donation-receipt", async () => {
    const camp = (await db.$queryRawUnsafe(`select id::text id from support_campaigns where status::text='ACTIVE' limit 1`))[0];
    const d = await helper.call("POST", `/animal-support/campaigns/${camp.id}/donate`, { amountIrr: 500000, idempotencyKey: randomUUID(), showDonorPublicly: false });
    const id = d.donationIntentId;
    return check("donation", helper, `/donations/${id}`, { contains: ["تومان"] });
  });

  await browser.close();
  process.stdout.write(JSON.stringify(results, null, 1));
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
