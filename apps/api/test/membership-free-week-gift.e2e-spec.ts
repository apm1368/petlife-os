import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { SubscriptionEntitlementType } from "@prisma/client";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import type { PrismaService } from "../src/common/prisma/prisma.service";
import type { PlatformSettingsService } from "../src/modules/platform-settings/platform-settings.service";

const PLAN = `free-week-${randomUUID()}`;
const LIST_PRICE = 1_000_000;
const SETTING_KEYS = [
  "membership.freeWeek.enabled",
  "membership.freeWeek.days",
  "membership.freeWeek.requireVerifiedPhone",
  "membership.firstPurchaseGift.enabled",
  "membership.firstPurchaseGift.code",
  "membership.firstPurchaseGift.percentOff",
  "membership.firstPurchaseGift.expiresOn",
];

/**
 * Owner request 2026-11-13: a one-click free trial (once per account, household and verified phone; idempotent; no
 * card; it simply ends) and a first-purchase gift code (admin settings, off by default; first paid purchase only;
 * single use per account and household; rate-limited; one answer for every refusal).
 */
describe("Membership: free week and first-purchase gift", () => {
  let app: INestApplication, db: PrismaService, settings: PlatformSettingsService;
  let extractCookie: (typeof import("./test-app"))["extractCookie"];
  const previous = process.env.WELCOME_TRIAL_PLAN_CODE;
  let planId: string;

  type Client = { id: string; get: (u: string) => request.Test; post: (u: string) => request.Test };

  async function user(data: { phone?: string } = {}): Promise<Client> {
    const u = await db.user.create({ data: { displayName: "Member", email: `fw-${randomUUID()}@example.com`, ...(data.phone ? { phone: data.phone, phoneVerifiedAt: new Date() } : {}) } });
    const session = await db.session.create({ data: { userId: u.id, expiresAt: new Date(Date.now() + 86400000) } });
    const csrf = extractCookie((await request(app.getHttpServer()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    const cookie = `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`;
    return {
      id: u.id,
      get: (url) => request(app.getHttpServer()).get(url).set("Cookie", cookie),
      post: (url) => request(app.getHttpServer()).post(url).set("Cookie", cookie).set("x-csrf-token", csrf),
    };
  }
  const household = async (c: Client) => (await c.post("/households").send({ name: "خانه" }).expect(201)).body.id as string;
  const freeWeek = (c: Client, h: string) => c.post(`/households/${h}/subscription/free-week`);
  const offers = async (c: Client, h: string) => (await c.get(`/households/${h}/subscription/offers`).expect(200)).body;
  const subscribe = (c: Client, h: string, extra: Record<string, unknown> = {}) => c.post(`/households/${h}/subscription/subscribe`).send({ planId, billingInterval: "MONTHLY", ...extra });
  const phone = () => `+98912${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;

  async function setSetting(key: string, value: unknown) {
    await db.platformSetting.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } });
    await settings.refresh();
  }
  async function resetSettings() {
    await db.platformSetting.deleteMany({ where: { key: { in: SETTING_KEYS } } });
    await settings.refresh();
  }
  const giftOn = async (code = "SPRING-25", percentOff = 25) => {
    await setSetting("membership.firstPurchaseGift.enabled", true);
    await setSetting("membership.firstPurchaseGift.code", code);
    await setSetting("membership.firstPurchaseGift.percentOff", percentOff);
  };

  beforeAll(async () => {
    process.env.WELCOME_TRIAL_PLAN_CODE = PLAN;
    let mods!: { testApp: typeof import("./test-app"); prisma: typeof import("../src/common/prisma/prisma.service"); settings: typeof import("../src/modules/platform-settings/platform-settings.service") };
    await jest.isolateModulesAsync(async () => {
      mods = { testApp: await import("./test-app"), prisma: await import("../src/common/prisma/prisma.service"), settings: await import("../src/modules/platform-settings/platform-settings.service") };
    });
    app = await mods.testApp.createTestApp();
    extractCookie = mods.testApp.extractCookie;
    db = app.get(mods.prisma.PrismaService);
    settings = app.get(mods.settings.PlatformSettingsService);
    await resetSettings();
    const plan = await db.subscriptionPlan.create({
      data: {
        code: PLAN, nameFa: "کامل", nameEn: "Full", trialDays: 14, countryAvailability: { create: { countryCode: "IR" } },
        entitlements: { create: [{ key: "care.reminders", type: SubscriptionEntitlementType.BOOLEAN, boolValue: true }] },
        prices: { create: { countryCode: "IR", billingInterval: "MONTHLY", amount: LIST_PRICE } },
      },
    });
    planId = plan.id;
  });
  afterEach(resetSettings);
  afterAll(async () => {
    process.env.WELCOME_TRIAL_PLAN_CODE = previous;
    await resetSettings().catch(() => undefined);
    await app?.close();
  });

  describe("free week", () => {
    it("starts in one click with the admin length, no payment, and a repeat returns the same trial", async () => {
      await setSetting("membership.freeWeek.days", 3);
      const owner = await user();
      const h = await household(owner);
      expect((await offers(owner, h)).freeWeek).toMatchObject({ status: "AVAILABLE", days: 3, canStart: true, trialUsed: false });

      const first = await freeWeek(owner, h).expect(201);
      expect(first.body.started).toBe(true);
      expect(first.body.subscription.status).toBe("TRIALING");
      const days = (Date.parse(first.body.subscription.trialEndsAt) - Date.now()) / 86400000;
      expect(days).toBeGreaterThan(2.9);
      expect(days).toBeLessThanOrEqual(3);

      // Idempotent: the same trial comes back, nothing new is created — also under concurrency.
      const again = await freeWeek(owner, h).expect(201);
      expect(again.body).toMatchObject({ started: false, subscription: { trialEndsAt: first.body.subscription.trialEndsAt } });
      const burst = await Promise.all([freeWeek(owner, h), freeWeek(owner, h)]);
      expect(burst.map((r) => r.status)).toEqual([201, 201]);
      expect(await db.subscriptionTrial.count({ where: { householdId: h } })).toBe(1);
      expect(await db.subscriptionBillingAttempt.count({ where: { subscription: { householdId: h } } })).toBe(0);
      expect(await db.paymentIntent.count({ where: { checkout: { householdId: h } } })).toBe(0);
      expect((await offers(owner, h)).freeWeek).toMatchObject({ status: "ACTIVE", trialEndsAt: first.body.subscription.trialEndsAt, canStart: false });
    });

    it("is once per household (a second member) and per account, also after the trial was cancelled or ended early", async () => {
      const owner = await user();
      const h = await household(owner);
      const coOwner = await user();
      const family = await user();
      await db.householdMember.create({ data: { householdId: h, userId: coOwner.id, role: "OWNER" } });
      await db.householdMember.create({ data: { householdId: h, userId: family.id, role: "FAMILY" } });
      await freeWeek(owner, h).expect(201);
      await freeWeek(family, h).expect(403);

      // Cancelling at the end of the trial: still the household's one trial.
      await owner.post(`/households/${h}/subscription/cancel`).expect(201);
      expect((await freeWeek(coOwner, h).expect(409)).body.error.code).toBe("SUBSCRIPTION_TRIAL_NOT_ELIGIBLE");
      await db.subscription.update({ where: { householdId: h }, data: { status: "CANCELLED" } });
      expect((await freeWeek(coOwner, h).expect(409)).body.error.details.reason).toBe("TRIAL_ALREADY_USED");
      expect((await freeWeek(owner, h).expect(409)).body.error.details.reason).toBe("TRIAL_ALREADY_USED");
      expect((await offers(coOwner, h)).freeWeek).toMatchObject({ status: "USED", canStart: false });

      // The owner's own account is spent too: a new household of theirs gets no second trial.
      const second = await household(owner);
      expect((await freeWeek(owner, second).expect(409)).body.error.details.reason).toBe("USER_TRIAL_ALREADY_USED");
      expect(await db.subscriptionTrial.count({ where: { householdId: { in: [h, second] } } })).toBe(1);
    });

    it("ending the trial early stops it at once, charges nothing, and it still counts as used", async () => {
      const owner = await user();
      const h = await household(owner);
      await freeWeek(owner, h).expect(201);
      const ended = await owner.post(`/households/${h}/subscription/trial/end`).expect(201);
      expect(ended.body.status).toBe("CANCELLED");
      expect(Date.parse(ended.body.trialEndsAt)).toBeLessThanOrEqual(Date.now());
      const entitlements = (await owner.get(`/households/${h}/subscription/entitlements`).expect(200)).body as { key: string; boolValue: boolean | null }[];
      expect(entitlements.find((e) => e.key === "care.reminders")?.boolValue ?? false).toBe(false);
      const sub = await db.subscription.findUniqueOrThrow({ where: { householdId: h } });
      expect(await db.subscriptionChange.count({ where: { subscriptionId: sub.id, type: "TRIAL_ENDED_EARLY" } })).toBe(1);
      expect(await db.subscriptionBillingAttempt.count({ where: { subscriptionId: sub.id } })).toBe(0);
      await owner.post(`/households/${h}/subscription/trial/end`).expect(409);
      expect((await freeWeek(owner, h).expect(409)).body.error.details.reason).toBe("TRIAL_ALREADY_USED");
    });

    it("a new account on the same verified phone gets no second trial", async () => {
      const number = phone();
      const first = await user({ phone: number });
      await freeWeek(first, await household(first)).expect(201);
      // The first account goes away (deletion releases the number); a fresh account verifies the same number.
      await db.user.update({ where: { id: first.id }, data: { phone: null, phoneVerifiedAt: null } });
      const second = await user({ phone: number });
      const h = await household(second);
      expect((await offers(second, h)).freeWeek.status).toBe("USED");
      expect((await freeWeek(second, h).expect(409)).body.error.details.reason).toBe("PHONE_TRIAL_ALREADY_USED");
      // The welcome trial on a first pet follows the same rule.
      await second.post(`/households/${h}/pets`).send({ name: "Biscuit", species: "DOG", approximateAgeMonths: 12 }).expect(201);
      expect(await db.subscriptionTrial.count({ where: { householdId: h } })).toBe(0);
      expect((await db.user.findUniqueOrThrow({ where: { id: second.id } })).welcomeTrialConsumedAt).toBeNull();
    });

    it("is only for members who never paid, can require a verified phone, and can be switched off", async () => {
      const payer = await user();
      await subscribe(payer, await household(payer)).expect(201);
      const later = await household(payer);
      expect((await offers(payer, later)).freeWeek.status).toBe("ALREADY_PAID");
      expect((await freeWeek(payer, later).expect(409)).body.error.details.reason).toBe("ALREADY_PAID");

      await setSetting("membership.freeWeek.requireVerifiedPhone", true);
      const noPhone = await user();
      const h = await household(noPhone);
      expect((await offers(noPhone, h)).freeWeek.status).toBe("PHONE_REQUIRED");
      expect((await freeWeek(noPhone, h).expect(409)).body.error.details.reason).toBe("PHONE_VERIFICATION_REQUIRED");
      const withPhone = await user({ phone: phone() });
      await freeWeek(withPhone, await household(withPhone)).expect(201);

      await setSetting("membership.freeWeek.enabled", false);
      const off = await user();
      const offHousehold = await household(off);
      expect((await offers(off, offHousehold)).freeWeek.status).toBe("UNAVAILABLE");
      expect((await freeWeek(off, offHousehold).expect(409)).body.error.details.reason).toBe("FREE_WEEK_UNAVAILABLE");
    });
  });

  describe("first-purchase gift", () => {
    it("is off by default: not offered, and a code is refused like any wrong code", async () => {
      const owner = await user();
      const h = await household(owner);
      expect((await offers(owner, h)).firstPurchaseGift).toBeNull();
      expect((await owner.get("/account/membership-offers").expect(200)).body.firstPurchaseGift).toBeNull();
      const refused = await subscribe(owner, h, { giftCode: "WELCOME" }).expect(400);
      expect(refused.body.error.code).toBe("SUBSCRIPTION_GIFT_CODE_NOT_APPLICABLE");
      await owner.post(`/households/${h}/subscription/gift/check`).send({ code: "WELCOME" }).expect(400);
      expect(await db.subscriptionBillingAttempt.count({ where: { subscription: { householdId: h } } })).toBe(0);
    });

    it("takes the admin percent off the first paid purchase only, once per account and household, with an audit trail", async () => {
      await giftOn("SPRING-25", 25);
      const owner = await user();
      const h = await household(owner);
      expect((await offers(owner, h)).firstPurchaseGift).toEqual({ code: "SPRING-25", percentOff: 25, expiresOn: null });
      expect((await owner.post(`/households/${h}/subscription/gift/check`).send({ code: " spring-25 " }).expect(200)).body).toMatchObject({ code: "SPRING-25", percentOff: 25 });

      const bought = await subscribe(owner, h, { giftCode: "spring-25" }).expect(201);
      expect(bought.body.attempt).toMatchObject({ status: "SUCCEEDED", amount: 750_000, discountAmount: 250_000 });
      const redemption = await db.subscriptionGiftRedemption.findUniqueOrThrow({ where: { householdId: h } });
      expect(redemption).toMatchObject({ userId: owner.id, code: "SPRING-25", percentOff: 25, listAmount: LIST_PRICE, discountAmount: 250_000, chargedAmount: 750_000, billingAttemptId: bought.body.attempt.id });
      expect(await db.paymentIntent.findFirstOrThrow({ where: { checkout: { householdId: h } } })).toMatchObject({ amount: 750_000 });
      const sub = await db.subscription.findUniqueOrThrow({ where: { householdId: h } });
      expect((await db.subscriptionChange.findFirstOrThrow({ where: { subscriptionId: sub.id, type: "INITIAL_PURCHASE" } })).note).toContain("SPRING-25");
      expect(await db.domainEvent.count({ where: { type: "SubscriptionGiftRedeemed", aggregateId: sub.id } })).toBe(1);

      // Spent: not offered again, and refused for the same account elsewhere and for the same household's co-owner.
      expect((await offers(owner, h)).firstPurchaseGift).toBeNull();
      const elsewhere = await household(owner);
      const wrong = await owner.post(`/households/${elsewhere}/subscription/gift/check`).send({ code: "NOPE-0000" }).expect(400);
      const used = await subscribe(owner, elsewhere, { giftCode: "SPRING-25" }).expect(400);
      expect(used.body.error).toMatchObject({ code: wrong.body.error.code, message: wrong.body.error.message });
      expect(used.body.error.details).toBeUndefined();
      const coOwner = await user();
      await db.householdMember.create({ data: { householdId: h, userId: coOwner.id, role: "OWNER" } });
      expect((await offers(coOwner, h)).firstPurchaseGift).toBeNull();
      await coOwner.post(`/households/${h}/subscription/upgrade`).send({ planId, billingInterval: "MONTHLY", giftCode: "SPRING-25" }).expect(400);
      expect(await db.subscriptionGiftRedemption.count({ where: { OR: [{ householdId: h }, { userId: owner.id }] } })).toBe(1);
    });

    it("works after a free trial, is released by a failed charge, and respects the expiry setting", async () => {
      await giftOn("AFTER-TRIAL", 10);
      const owner = await user();
      const h = await household(owner);
      await freeWeek(owner, h).expect(201);
      const failed = await subscribe(owner, h, { giftCode: "AFTER-TRIAL", mode: "FAILURE" }).expect(201);
      expect(failed.body.attempt.status).toBe("FAILED");
      expect(await db.subscriptionGiftRedemption.count({ where: { householdId: h } })).toBe(0);
      const paid = await subscribe(owner, h, { giftCode: "AFTER-TRIAL" }).expect(201);
      expect(paid.body.attempt).toMatchObject({ status: "SUCCEEDED", amount: 900_000, discountAmount: 100_000 });

      await setSetting("membership.firstPurchaseGift.expiresOn", "2020-01-01");
      const late = await user();
      const lateHousehold = await household(late);
      expect((await offers(late, lateHousehold)).firstPurchaseGift).toBeNull();
      await late.post(`/households/${lateHousehold}/subscription/gift/check`).send({ code: "AFTER-TRIAL" }).expect(400);
    });

    it("is rate-limited per account, and a guess can't tell a used code from a wrong one", async () => {
      await giftOn("LIMIT-CODE", 15);
      const owner = await user();
      const h = await household(owner);
      for (let i = 0; i < 5; i++) {
        const res = await owner.post(`/households/${h}/subscription/gift/check`).send({ code: `WRONG-${i}` }).expect(400);
        expect(res.body.error.code).toBe("SUBSCRIPTION_GIFT_CODE_NOT_APPLICABLE");
      }
      const limited = await owner.post(`/households/${h}/subscription/gift/check`).send({ code: "LIMIT-CODE" }).expect(429);
      expect(limited.body.error.code).toBe("SUBSCRIPTION_GIFT_RATE_LIMITED");
      // The budget is the account's, not the household's: a purchase with the code is held back too.
      await subscribe(owner, h, { giftCode: "LIMIT-CODE" }).expect(429);
      expect(await db.subscriptionBillingAttempt.count({ where: { subscription: { householdId: h } } })).toBe(0);
      // Another account is not affected.
      const other = await user();
      await other.post(`/households/${await household(other)}/subscription/gift/check`).send({ code: "LIMIT-CODE" }).expect(200);
    });

    it("is shown on the account's first screen after sign-up, before any household", async () => {
      await giftOn("HELLO-PET", 20);
      const fresh = await user();
      const body = (await fresh.get("/account/membership-offers").expect(200)).body;
      expect(body.firstPurchaseGift).toEqual({ code: "HELLO-PET", percentOff: 20, expiresOn: null });
      expect(body.freeWeek).toMatchObject({ status: "AVAILABLE", days: 7, canStart: false });
    });
  });
});
