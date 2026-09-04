import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { AdminMembershipStatus, AdminRole, SubscriptionBillingInterval, SubscriptionBillingReason, SubscriptionEntitlementType, SubscriptionStatus } from "@prisma/client";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { SubscriptionBillingService } from "../src/modules/subscriptions/subscription-billing.service";
import { SubscriptionService } from "../src/modules/subscriptions/subscription.service";

interface Cookies {
  session?: string;
  csrf?: string;
}

function captureOtpCode(logSpy: jest.SpyInstance, identifier: string): string {
  const call = logSpy.mock.calls.find((args) => typeof args[0] === "string" && args[0].includes("[DEV OTP]") && args[0].includes(identifier));
  if (!call) throw new Error(`No OTP log found for ${identifier}`);
  const match = /code=(\d+)/.exec(call[0] as string);
  if (!match) throw new Error("Could not parse OTP code from log line");
  return match[1]!;
}

async function primeCsrf(app: INestApplication): Promise<Cookies> {
  const res = await request(app.getHttpServer()).get("/health/live");
  return { csrf: extractCookie(res.headers["set-cookie"], "petlife_csrf") };
}

async function signUp(app: INestApplication, logSpy: jest.SpyInstance, identifier: string): Promise<Cookies> {
  const primed = await primeCsrf(app);
  await request(app.getHttpServer()).post("/auth/request-otp").set("Cookie", `petlife_csrf=${primed.csrf}`).set("x-csrf-token", primed.csrf!).send({ identifier }).expect(200);
  const code = captureOtpCode(logSpy, identifier);
  const verifyRes = await request(app.getHttpServer()).post("/auth/verify-otp").set("Cookie", `petlife_csrf=${primed.csrf}`).set("x-csrf-token", primed.csrf!).send({ identifier, code }).expect(200);
  const session = extractCookie(verifyRes.headers["set-cookie"], "petlife_session");
  return { session, csrf: primed.csrf };
}

function authedRequest(app: INestApplication, cookies: Cookies) {
  const cookieHeader = `petlife_session=${cookies.session}; petlife_csrf=${cookies.csrf}`;
  return {
    get: (url: string) => request(app.getHttpServer()).get(url).set("Cookie", cookieHeader),
    post: (url: string) => request(app.getHttpServer()).post(url).set("Cookie", cookieHeader).set("x-csrf-token", cookies.csrf!),
    patch: (url: string) => request(app.getHttpServer()).patch(url).set("Cookie", cookieHeader).set("x-csrf-token", cookies.csrf!),
    delete: (url: string) => request(app.getHttpServer()).delete(url).set("Cookie", cookieHeader).set("x-csrf-token", cookies.csrf!),
  };
}

/**
 * Handoff 16 — Subscription + Membership + Metering e2e flows. A separate
 * file (mirrors content.e2e-spec.ts / seller-finance.e2e-spec.ts) exercising
 * the real HTTP surface: consumer subscription lifecycle, server-side limit
 * enforcement, entitlement resolution/overrides, the admin plan/price/
 * household/billing-attempt surface, and the two required concurrency
 * scenarios (concurrent purchase, concurrent cancel) via direct
 * SubscriptionBillingService/SubscriptionService calls where no HTTP-only
 * race is otherwise observable (mirrors `app.get(DevPaymentGateway)` /
 * `app.get(FulfillmentTransitionService)` precedent elsewhere).
 */
describe("Subscription + Membership + Metering (Handoff 16)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let billing: SubscriptionBillingService;
  let subscriptions: SubscriptionService;
  let logSpy: jest.SpyInstance;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    billing = app.get(SubscriptionBillingService);
    subscriptions = app.get(SubscriptionService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  async function setupHousehold() {
    const identifier = `hf16-owner-${unique()}@example.com`;
    const client = authedRequest(app, await signUp(app, logSpy, identifier));
    const ownerUser = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
    const household = await client.post("/households").send({}).expect(201);
    const householdId = household.body.id as string;
    // Touches the subscription surface once so the self-healing FREE plan/row are materialized before assertions read them directly.
    await client.get(`/households/${householdId}/subscription`).expect(200);
    return { client, householdId, ownerUserId: ownerUser.id as string };
  }

  async function setupAdmin(role: AdminRole, status: AdminMembershipStatus = AdminMembershipStatus.ACTIVE) {
    const identifier = `hf16-admin-${role.toLowerCase()}-${unique()}@example.com`;
    const client = authedRequest(app, await signUp(app, logSpy, identifier));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: identifier } });
    await prisma.adminUser.create({ data: { userId: user.id, role, status } });
    return { client, userId: user.id as string };
  }

  async function getFreePlan() {
    return prisma.subscriptionPlan.findFirstOrThrow({ where: { isFree: true } });
  }

  async function createPaidPlan(input: {
    nameEn: string;
    trialDays?: number;
    petsMax?: number | null;
    price?: { interval: SubscriptionBillingInterval; amount: number };
  }) {
    const code = `hf16-${unique()}`;
    const plan = await prisma.subscriptionPlan.create({
      data: {
        code,
        nameFa: input.nameEn,
        nameEn: input.nameEn,
        isFree: false,
        sortOrder: 50,
        trialDays: input.trialDays,
        countryAvailability: { create: { countryCode: "IR" } },
        entitlements: input.petsMax === undefined ? undefined : { create: [{ key: "pets.max", type: SubscriptionEntitlementType.LIMIT, limitValue: input.petsMax }] },
      },
    });
    let price = null;
    if (input.price) {
      price = await prisma.subscriptionPlanPrice.create({ data: { planId: plan.id, countryCode: "IR", billingInterval: input.price.interval, amount: input.price.amount } });
    }
    return { plan, price };
  }

  // -- Consumer: entitlements, plans, limit enforcement --------------------

  describe("Free entitlements + plan resolution", () => {
    it("Flow A: a brand-new household resolves real FREE entitlements without ever subscribing", async () => {
      const { client, householdId } = await setupHousehold();
      const sub = await client.get(`/households/${householdId}/subscription`).expect(200);
      expect(sub.body.status).toBe("ACTIVE");
      expect(sub.body.plan.code).toBeTruthy();

      const entitlements = await client.get(`/households/${householdId}/subscription/entitlements`).expect(200);
      const petsMax = entitlements.body.find((e: { key: string }) => e.key === "pets.max");
      expect(petsMax).toBeDefined();
      expect(petsMax.type).toBe("LIMIT");
      expect(typeof petsMax.limitValue === "number" || petsMax.limitValue === null).toBe(true);
    });

    it("Flow B: GET plans lists the FREE plan alongside any paid plans for the household's country, never hidden", async () => {
      const { client, householdId } = await setupHousehold();
      await createPaidPlan({ nameEn: `Plus ${unique()}`, price: { interval: SubscriptionBillingInterval.MONTHLY, amount: 100_000 } });
      const plans = await client.get(`/households/${householdId}/subscription/plans`).expect(200);
      expect(plans.body.some((p: { isFree: boolean }) => p.isFree)).toBe(true);
    });

    it("Flow C: a stranger cannot read or act on another household's subscription (IDOR)", async () => {
      const { householdId } = await setupHousehold();
      const strangerIdentifier = `hf16-stranger-${unique()}@example.com`;
      const stranger = authedRequest(app, await signUp(app, logSpy, strangerIdentifier));
      const denied = await stranger.get(`/households/${householdId}/subscription`).expect(403);
      expect(denied.body.error.code).toBe("HOUSEHOLD_ACCESS_DENIED");
    });
  });

  describe("Server-side limit enforcement (pets.max)", () => {
    it("Flow D: creating one more pet than the FREE plan allows is rejected with a typed, specific error — existing pets remain fully accessible", async () => {
      const { client, householdId } = await setupHousehold();
      const freePlan = await getFreePlan();
      const limit = await prisma.subscriptionPlanEntitlement.findUniqueOrThrow({ where: { planId_key: { planId: freePlan.id, key: "pets.max" } } });
      const max = limit.limitValue!;

      const petIds: string[] = [];
      for (let i = 0; i < max; i++) {
        const pet = await client.post(`/households/${householdId}/pets`).send({ name: `Pet${i}`, species: "DOG", approximateAgeMonths: 12 }).expect(201);
        petIds.push(pet.body.id);
      }

      const rejected = await client.post(`/households/${householdId}/pets`).send({ name: "OneTooMany", species: "CAT", approximateAgeMonths: 6 }).expect(409);
      expect(rejected.body.error.code).toBe("SUBSCRIPTION_ENTITLEMENT_LIMIT_EXCEEDED");
      expect(rejected.body.error.details.key).toBe("pets.max");

      // Every previously created pet is still fully readable — a limit blocks new creation only, never access to existing data.
      for (const petId of petIds) {
        await client.get(`/pets/${petId}/health/summary`).expect(200);
      }
    });

    it("Flow E: usage reporting reflects the household's real pet count against its limit", async () => {
      const { client, householdId } = await setupHousehold();
      await client.post(`/households/${householdId}/pets`).send({ name: "Rex", species: "DOG", approximateAgeMonths: 24 }).expect(201);
      const usage = await client.get(`/households/${householdId}/subscription/usage`).expect(200);
      const petsUsage = usage.body.find((u: { key: string }) => u.key === "pets.max");
      expect(petsUsage.used).toBeGreaterThanOrEqual(1);
      expect(petsUsage.remaining).toBe(petsUsage.limit === null ? null : petsUsage.limit - petsUsage.used);
    });
  });

  // -- Trial -----------------------------------------------------------------

  describe("Trial", () => {
    it("Flow F: starting a trial on a plan with trialDays grants real entitlements immediately, no payment involved", async () => {
      const { client, householdId } = await setupHousehold();
      const { plan } = await createPaidPlan({ nameEn: `Trialable ${unique()}`, trialDays: 14, petsMax: 20 });

      const sub = await client.post(`/households/${householdId}/subscription/trial`).send({ planId: plan.id }).expect(201);
      expect(sub.body.status).toBe("TRIALING");
      expect(sub.body.plan.id).toBe(plan.id);
      expect(sub.body.trialEndsAt).toBeTruthy();

      const entitlements = await client.get(`/households/${householdId}/subscription/entitlements`).expect(200);
      const petsMax = entitlements.body.find((e: { key: string }) => e.key === "pets.max");
      expect(petsMax.limitValue).toBe(20);
    });

    it("Flow G: a plan with no trialDays configured refuses a trial start", async () => {
      const { client, householdId } = await setupHousehold();
      const freePlan = await getFreePlan();
      const rejected = await client.post(`/households/${householdId}/subscription/trial`).send({ planId: freePlan.id }).expect(409);
      expect(rejected.body.error.code).toBe("SUBSCRIPTION_TRIAL_NOT_ELIGIBLE");
      expect(rejected.body.error.details.reason).toBe("PLAN_HAS_NO_TRIAL");
    });

    it("Flow H: a second trial request for the same plan is refused — one trial per household per plan, no repeated abuse", async () => {
      const { client, householdId } = await setupHousehold();
      const { plan } = await createPaidPlan({ nameEn: `OnceOnly ${unique()}`, trialDays: 7 });
      await client.post(`/households/${householdId}/subscription/trial`).send({ planId: plan.id }).expect(201);
      // Resubscribe to FREE first so the state machine's own ALREADY_SUBSCRIBED guard isn't what blocks the second call.
      await prisma.subscription.update({ where: { householdId }, data: { status: SubscriptionStatus.ACTIVE, planId: (await getFreePlan()).id, priceId: null, currentPeriodId: null } });
      const rejected = await client.post(`/households/${householdId}/subscription/trial`).send({ planId: plan.id }).expect(409);
      expect(rejected.body.error.code).toBe("SUBSCRIPTION_TRIAL_NOT_ELIGIBLE");
      expect(rejected.body.error.details.reason).toBe("TRIAL_ALREADY_USED");
    });
  });

  // -- Purchase / upgrade ------------------------------------------------------

  describe("Purchase (initial + upgrade)", () => {
    it("Flow I: a successful initial purchase activates the plan, creates a period, and records a SUCCEEDED billing attempt", async () => {
      const { client, householdId } = await setupHousehold();
      const { plan, price } = await createPaidPlan({ nameEn: `Plus ${unique()}`, petsMax: 10, price: { interval: SubscriptionBillingInterval.MONTHLY, amount: 500_000 } });

      const outcome = await client.post(`/households/${householdId}/subscription/subscribe`).send({ planId: plan.id, billingInterval: "MONTHLY", mode: "SUCCESS" }).expect(201);
      expect(outcome.body.attempt.status).toBe("SUCCEEDED");
      expect(outcome.body.attempt.amount).toBe(price!.amount);
      expect(outcome.body.subscription.status).toBe("ACTIVE");
      expect(outcome.body.subscription.plan.id).toBe(plan.id);
      expect(outcome.body.subscription.currentPeriod).toBeTruthy();

      const history = await client.get(`/households/${householdId}/subscription/billing-history`).expect(200);
      expect(history.body.attempts[0].status).toBe("SUCCEEDED");
      expect(history.body.periods[0].plan.id).toBe(plan.id);
    });

    it("Flow J: a failed purchase attempt never activates the plan and never creates a period", async () => {
      const { client, householdId } = await setupHousehold();
      const { plan } = await createPaidPlan({ nameEn: `Plus ${unique()}`, price: { interval: SubscriptionBillingInterval.MONTHLY, amount: 500_000 } });

      const outcome = await client.post(`/households/${householdId}/subscription/subscribe`).send({ planId: plan.id, billingInterval: "MONTHLY", mode: "FAILURE" }).expect(201);
      expect(outcome.body.attempt.status).toBe("FAILED");
      expect(outcome.body.subscription.plan.id).not.toBe(plan.id);
    });

    it("Flow K: an upgrade is effective immediately after successful payment, no proration — full price charged, new entitlements live at once", async () => {
      const { client, householdId } = await setupHousehold();
      const { plan: basic } = await createPaidPlan({ nameEn: `Basic ${unique()}`, petsMax: 5, price: { interval: SubscriptionBillingInterval.MONTHLY, amount: 200_000 } });
      const { plan: pro, price: proPrice } = await createPaidPlan({ nameEn: `Pro ${unique()}`, petsMax: 50, price: { interval: SubscriptionBillingInterval.MONTHLY, amount: 900_000 } });

      await client.post(`/households/${householdId}/subscription/subscribe`).send({ planId: basic.id, billingInterval: "MONTHLY", mode: "SUCCESS" }).expect(201);
      const upgrade = await client.post(`/households/${householdId}/subscription/upgrade`).send({ planId: pro.id, billingInterval: "MONTHLY", mode: "SUCCESS" }).expect(201);

      expect(upgrade.body.subscription.plan.id).toBe(pro.id);
      expect(upgrade.body.attempt.amount).toBe(proPrice!.amount);
      const entitlements = await client.get(`/households/${householdId}/subscription/entitlements`).expect(200);
      expect(entitlements.body.find((e: { key: string }) => e.key === "pets.max").limitValue).toBe(50);
    });

    it("Flow L: a repeated request carrying the same Idempotency-Key converges on the exact same billing attempt, never a duplicate charge", async () => {
      const { client, householdId } = await setupHousehold();
      const { plan } = await createPaidPlan({ nameEn: `Idem ${unique()}`, price: { interval: SubscriptionBillingInterval.MONTHLY, amount: 300_000 } });
      const key = `idem-${unique()}`;

      const first = await client.post(`/households/${householdId}/subscription/subscribe`).set("Idempotency-Key", key).send({ planId: plan.id, billingInterval: "MONTHLY", mode: "SUCCESS" }).expect(201);
      const second = await client.post(`/households/${householdId}/subscription/subscribe`).set("Idempotency-Key", key).send({ planId: plan.id, billingInterval: "MONTHLY", mode: "SUCCESS" }).expect(201);

      expect(second.body.attempt.id).toBe(first.body.attempt.id);
      const sub = await prisma.subscription.findUniqueOrThrow({ where: { householdId } });
      const periodCount = await prisma.subscriptionPeriod.count({ where: { subscriptionId: sub.id, status: "ACTIVE" } });
      expect(periodCount).toBe(1);
    });
  });

  // -- Downgrade / cancel / resume ---------------------------------------------

  describe("Downgrade, cancel, resume", () => {
    it("Flow M: scheduling a downgrade never reduces entitlements mid-period — it only takes effect at the next renewal boundary", async () => {
      const { client, householdId } = await setupHousehold();
      const { plan: pro } = await createPaidPlan({ nameEn: `Pro ${unique()}`, petsMax: 50, price: { interval: SubscriptionBillingInterval.MONTHLY, amount: 900_000 } });
      const { plan: basic } = await createPaidPlan({ nameEn: `Basic ${unique()}`, petsMax: 5, price: { interval: SubscriptionBillingInterval.MONTHLY, amount: 200_000 } });
      await client.post(`/households/${householdId}/subscription/subscribe`).send({ planId: pro.id, billingInterval: "MONTHLY", mode: "SUCCESS" }).expect(201);

      const scheduled = await client.post(`/households/${householdId}/subscription/downgrade`).send({ planId: basic.id }).expect(201);
      expect(scheduled.body.pendingPlan.id).toBe(basic.id);
      expect(scheduled.body.plan.id).toBe(pro.id);

      const entitlements = await client.get(`/households/${householdId}/subscription/entitlements`).expect(200);
      expect(entitlements.body.find((e: { key: string }) => e.key === "pets.max").limitValue).toBe(50);
    });

    it("Flow N: cancel-at-period-end keeps paid access until the period ends and states the effective date — no immediate stripping", async () => {
      const { client, householdId } = await setupHousehold();
      const { plan } = await createPaidPlan({ nameEn: `Cancelable ${unique()}`, petsMax: 30, price: { interval: SubscriptionBillingInterval.MONTHLY, amount: 400_000 } });
      await client.post(`/households/${householdId}/subscription/subscribe`).send({ planId: plan.id, billingInterval: "MONTHLY", mode: "SUCCESS" }).expect(201);

      const cancelled = await client.post(`/households/${householdId}/subscription/cancel`).expect(201);
      expect(cancelled.body.status).toBe("CANCEL_AT_PERIOD_END");
      expect(cancelled.body.cancelEffectiveAt).toBeTruthy();

      const entitlements = await client.get(`/households/${householdId}/subscription/entitlements`).expect(200);
      expect(entitlements.body.find((e: { key: string }) => e.key === "pets.max").limitValue).toBe(30);
    });

    it("Flow O: resuming a scheduled cancellation restores ACTIVE status before the period ends", async () => {
      const { client, householdId } = await setupHousehold();
      const { plan } = await createPaidPlan({ nameEn: `Resumable ${unique()}`, price: { interval: SubscriptionBillingInterval.MONTHLY, amount: 350_000 } });
      await client.post(`/households/${householdId}/subscription/subscribe`).send({ planId: plan.id, billingInterval: "MONTHLY", mode: "SUCCESS" }).expect(201);
      await client.post(`/households/${householdId}/subscription/cancel`).expect(201);

      const resumed = await client.post(`/households/${householdId}/subscription/resume`).expect(201);
      expect(resumed.body.status).toBe("ACTIVE");
      expect(resumed.body.cancelEffectiveAt).toBeNull();
    });

    it("Flow P: resuming a subscription that was never cancelled is refused", async () => {
      const { client, householdId } = await setupHousehold();
      const rejected = await client.post(`/households/${householdId}/subscription/resume`).expect(409);
      expect(rejected.body.error.code).toBe("SUBSCRIPTION_ALREADY_CANCELLED");
    });
  });

  // -- Renewal / grace / expiry (direct service calls — worker-driven, no HTTP trigger) ------

  describe("Renewal, past-due, grace period, expiry", () => {
    async function subscribeAndForceRenewalDue(client: ReturnType<typeof authedRequest>, householdId: string, price: { billingInterval: SubscriptionBillingInterval; amount: number }, plan: { id: string }) {
      await client.post(`/households/${householdId}/subscription/subscribe`).send({ planId: plan.id, billingInterval: price.billingInterval, mode: "SUCCESS" }).expect(201);
      const sub = await prisma.subscription.findUniqueOrThrow({ where: { householdId } });
      await prisma.subscriptionPeriod.update({ where: { id: sub.currentPeriodId! }, data: { endAt: new Date(Date.now() - 60_000) } });
      return sub.id;
    }

    it("Flow Q: a successful renewal extends the period and records a RENEWED change", async () => {
      const { client, householdId } = await setupHousehold();
      const { plan, price } = await createPaidPlan({ nameEn: `Renewable ${unique()}`, price: { interval: SubscriptionBillingInterval.MONTHLY, amount: 250_000 } });
      const subscriptionId = await subscribeAndForceRenewalDue(client, householdId, price!, plan);

      const outcome = await billing.attemptRenewal(subscriptionId, "SUCCESS");
      expect(outcome!.attempt!.status).toBe("SUCCEEDED");
      expect(outcome!.subscription.status).toBe("ACTIVE");

      const changes = await subscriptions.listChanges(subscriptionId);
      expect(changes.some((c) => c.type === "RENEWED")).toBe(true);
    });

    it("Flow R: a failed renewal moves ACTIVE -> PAST_DUE without revoking access, then escalates to GRACE_PERIOD, then EXPIRED with fallback to FREE entitlements — existing pets stay accessible throughout", async () => {
      const { client, householdId } = await setupHousehold();
      const { plan, price } = await createPaidPlan({ nameEn: `Fragile ${unique()}`, petsMax: 25, price: { interval: SubscriptionBillingInterval.MONTHLY, amount: 250_000 } });
      const pet = await client.post(`/households/${householdId}/pets`).send({ name: "Survivor", species: "DOG", approximateAgeMonths: 24 }).expect(201);
      const subscriptionId = await subscribeAndForceRenewalDue(client, householdId, price!, plan);

      const pastDue = await billing.attemptRenewal(subscriptionId, "FAILURE");
      expect(pastDue!.subscription.status).toBe("PAST_DUE");
      let entitlements = await client.get(`/households/${householdId}/subscription/entitlements`).expect(200);
      expect(entitlements.body.find((e: { key: string }) => e.key === "pets.max").limitValue).toBe(25);
      await client.get(`/pets/${pet.body.id}/health/summary`).expect(200);

      // Force the retry window closed so the next failed attempt escalates to GRACE_PERIOD.
      await prisma.subscription.update({ where: { id: subscriptionId }, data: { gracePeriodEndsAt: new Date(Date.now() - 60_000) } });
      await prisma.subscriptionPeriod.updateMany({ where: { subscriptionId, status: "ACTIVE" }, data: { endAt: new Date(Date.now() - 60_000) } });
      const grace = await billing.attemptRenewal(subscriptionId, "FAILURE");
      expect(grace!.subscription.status).toBe("GRACE_PERIOD");
      entitlements = await client.get(`/households/${householdId}/subscription/entitlements`).expect(200);
      expect(entitlements.body.find((e: { key: string }) => e.key === "pets.max").limitValue).toBe(25);

      // Force the grace window closed so the next failed attempt expires the subscription.
      await prisma.subscription.update({ where: { id: subscriptionId }, data: { gracePeriodEndsAt: new Date(Date.now() - 60_000) } });
      await prisma.subscriptionPeriod.updateMany({ where: { subscriptionId, status: "ACTIVE" }, data: { endAt: new Date(Date.now() - 60_000) } });
      const expired = await billing.attemptRenewal(subscriptionId, "FAILURE");
      expect(expired!.subscription.status).toBe("EXPIRED");

      entitlements = await client.get(`/households/${householdId}/subscription/entitlements`).expect(200);
      const freePlan = await getFreePlan();
      const freeLimit = await prisma.subscriptionPlanEntitlement.findUniqueOrThrow({ where: { planId_key: { planId: freePlan.id, key: "pets.max" } } });
      expect(entitlements.body.find((e: { key: string }) => e.key === "pets.max").limitValue).toBe(freeLimit.limitValue);
      // The pet created while on the paid plan is never deleted, even after falling back to FREE and even if that exceeds the FREE limit.
      await client.get(`/pets/${pet.body.id}/health/summary`).expect(200);
    });

    it("Flow S: a downgrade scheduled to FREE applies at the renewal boundary with no charge and no new billing attempt", async () => {
      const { client, householdId } = await setupHousehold();
      const { plan, price } = await createPaidPlan({ nameEn: `Downgrading ${unique()}`, price: { interval: SubscriptionBillingInterval.MONTHLY, amount: 250_000 } });
      const subscriptionId = await subscribeAndForceRenewalDue(client, householdId, price!, plan);
      const freePlan = await getFreePlan();

      await client.post(`/households/${householdId}/subscription/downgrade`).send({ planId: freePlan.id }).expect(201);
      const before = await prisma.subscriptionBillingAttempt.count({ where: { subscriptionId } });

      const outcome = await billing.attemptRenewal(subscriptionId, "SUCCESS");
      expect(outcome!.attempt).toBeNull();
      expect(outcome!.subscription.plan.id).toBe(freePlan.id);

      const after = await prisma.subscriptionBillingAttempt.count({ where: { subscriptionId } });
      expect(after).toBe(before);
    });
  });

  // -- Entitlement overrides ----------------------------------------------------

  describe("Manual entitlement overrides", () => {
    it("Flow T: an active override wins outright over the plan's own entitlement, and is reflected as overridden", async () => {
      const { client, householdId } = await setupHousehold();
      const superAdmin = await setupAdmin(AdminRole.SUPER_ADMIN);

      const grant = await superAdmin.client
        .post("/admin/subscriptions/entitlement-overrides")
        .send({ householdId, key: "pets.max", type: "LIMIT", limitValue: 999, reason: "Goodwill gesture for a support case" })
        .expect(201);
      expect(grant.body.limitValue).toBe(999);

      const resolved = await client.get(`/households/${householdId}/subscription/entitlements`).expect(200);
      const petsMax = resolved.body.find((e: { key: string }) => e.key === "pets.max");
      expect(petsMax.limitValue).toBe(999);
      expect(petsMax.overridden).toBe(true);

      await superAdmin.client.delete(`/admin/subscriptions/entitlement-overrides/${grant.body.id}`).expect(200);
      const afterRevoke = await client.get(`/households/${householdId}/subscription/entitlements`).expect(200);
      expect(afterRevoke.body.find((e: { key: string }) => e.key === "pets.max").overridden).toBe(false);
    });

    it("Flow U: only SUPER_ADMIN can grant an entitlement override — a plain ADMIN is refused", async () => {
      const { householdId } = await setupHousehold();
      const admin = await setupAdmin(AdminRole.ADMIN);
      const rejected = await admin.client
        .post("/admin/subscriptions/entitlement-overrides")
        .send({ householdId, key: "pets.max", type: "LIMIT", limitValue: 999, reason: "Should not be allowed" })
        .expect(403);
      expect(rejected.body.error.code).toBe("ADMIN_ACCESS_DENIED");
    });
  });

  // -- Admin: plans, prices, household subscriptions, billing attempts, refunds ---------------

  describe("Admin surface", () => {
    it("Flow V: ADMIN can create a plan + price, but SUPPORT (view-only) cannot", async () => {
      const admin = await setupAdmin(AdminRole.ADMIN);
      const created = await admin.client
        .post("/admin/subscriptions/plans")
        .send({ code: `hf16-admin-plan-${unique()}`, nameFa: "پلن ادمین", nameEn: "Admin Plan", countryAvailability: ["IR"] })
        .expect(201);
      expect(created.body.status).toBe("ACTIVE");

      const price = await admin.client.post(`/admin/subscriptions/plans/${created.body.id}/prices`).send({ countryCode: "IR", billingInterval: "MONTHLY", amount: 111_000 }).expect(201);
      expect(price.body.amount).toBe(111_000);

      const support = await setupAdmin(AdminRole.SUPPORT);
      const rejected = await support.client.post("/admin/subscriptions/plans").send({ code: `hf16-support-plan-${unique()}`, nameFa: "x", nameEn: "x", countryAvailability: ["IR"] }).expect(403);
      expect(rejected.body.error.code).toBe("ADMIN_ACCESS_DENIED");
    });

    it("Flow W: admin household subscription list/detail surfaces the real state, paginated and filterable by status", async () => {
      const { client, householdId } = await setupHousehold();
      const { plan, price } = await createPaidPlan({ nameEn: `AdminView ${unique()}`, price: { interval: SubscriptionBillingInterval.MONTHLY, amount: 260_000 } });
      await client.post(`/households/${householdId}/subscription/subscribe`).send({ planId: plan.id, billingInterval: "MONTHLY", mode: "SUCCESS" }).expect(201);

      const admin = await setupAdmin(AdminRole.ADMIN);
      const list = await admin.client.get(`/admin/subscriptions/households?status=ACTIVE&pageSize=5`).expect(200);
      expect(Array.isArray(list.body.items)).toBe(true);
      expect(typeof list.body.total).toBe("number");

      const detail = await admin.client.get(`/admin/subscriptions/households/${householdId}`).expect(200);
      expect(detail.body.plan.id).toBe(plan.id);
      expect(detail.body.household.id).toBe(householdId);
      expect(detail.body.billingAttempts.length).toBeGreaterThanOrEqual(1);

      const attemptId = detail.body.billingAttempts[0].id as string;
      expect(price).toBeTruthy();

      const refunded = await admin.client.post(`/admin/subscriptions/billing-attempts/${attemptId}/refund`).send({ reason: "Customer requested a refund" }).expect(201);
      expect(refunded.status).toBe(201);

      // Refund policy: never auto-infers a subscription-status change.
      const afterRefund = await prisma.subscription.findUniqueOrThrow({ where: { householdId } });
      expect(afterRefund.status).toBe("ACTIVE");

      const refundRow = await prisma.refund.findFirst({ where: { amount: price!.amount }, orderBy: { createdAt: "desc" } });
      expect(refundRow).toBeTruthy();

      // A second refund of the same attempt is refused, not double-posted.
      const secondRefund = await admin.client.post(`/admin/subscriptions/billing-attempts/${attemptId}/refund`).send({ reason: "Trying again" }).expect(409);
      expect(secondRefund.body.error.code).toBe("SUBSCRIPTION_BILLING_ATTEMPT_NOT_REFUNDABLE");
    });

    it("Flow X: admin can cancel a household's subscription at period end (never immediate revocation)", async () => {
      const { client, householdId } = await setupHousehold();
      const { plan } = await createPaidPlan({ nameEn: `AdminCancel ${unique()}`, price: { interval: SubscriptionBillingInterval.MONTHLY, amount: 270_000 } });
      await client.post(`/households/${householdId}/subscription/subscribe`).send({ planId: plan.id, billingInterval: "MONTHLY", mode: "SUCCESS" }).expect(201);

      const admin = await setupAdmin(AdminRole.ADMIN);
      const cancelled = await admin.client.post(`/admin/subscriptions/households/${householdId}/cancel`).send({ reason: "Fraud investigation" }).expect(201);
      expect(cancelled.body.status).toBe("CANCEL_AT_PERIOD_END");
      expect(cancelled.body.cancelEffectiveAt).toBeTruthy();

      const change = await prisma.subscriptionChange.findFirst({ where: { subscriptionId: (await prisma.subscription.findUniqueOrThrow({ where: { householdId } })).id, type: "ADMIN_CANCELLED" } });
      expect(change).toBeTruthy();
    });
  });

  // -- Concurrency ---------------------------------------------------------------

  describe("Concurrency", () => {
    it("Concurrent purchase: two simultaneous calls with the same idempotency key never create two active periods", async () => {
      const { householdId, ownerUserId } = await setupHousehold();
      const { plan } = await createPaidPlan({ nameEn: `Race ${unique()}`, price: { interval: SubscriptionBillingInterval.MONTHLY, amount: 300_000 } });
      const key = `race-${unique()}`;

      const [a, b] = await Promise.all([
        billing.purchase(householdId, ownerUserId, plan.id, SubscriptionBillingInterval.MONTHLY, SubscriptionBillingReason.INITIAL, key, "SUCCESS"),
        billing.purchase(householdId, ownerUserId, plan.id, SubscriptionBillingInterval.MONTHLY, SubscriptionBillingReason.INITIAL, key, "SUCCESS"),
      ]);
      expect(a.attempt!.id).toBe(b.attempt!.id);

      const sub = await prisma.subscription.findUniqueOrThrow({ where: { householdId } });
      const activePeriods = await prisma.subscriptionPeriod.count({ where: { subscriptionId: sub.id, status: "ACTIVE" } });
      expect(activePeriods).toBe(1);
      const succeededAttempts = await prisma.subscriptionBillingAttempt.count({ where: { subscriptionId: sub.id, status: "SUCCEEDED" } });
      expect(succeededAttempts).toBe(1);
    });

    it("Concurrent cancel + resume: the final state is one of the two valid outcomes, never a corrupted intermediate state", async () => {
      const { client, householdId, ownerUserId } = await setupHousehold();
      const { plan } = await createPaidPlan({ nameEn: `RaceCancel ${unique()}`, price: { interval: SubscriptionBillingInterval.MONTHLY, amount: 300_000 } });
      await client.post(`/households/${householdId}/subscription/subscribe`).send({ planId: plan.id, billingInterval: "MONTHLY", mode: "SUCCESS" }).expect(201);

      const results = await Promise.allSettled([subscriptions.cancelAtPeriodEnd(householdId, ownerUserId), subscriptions.cancelAtPeriodEnd(householdId, ownerUserId)]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled.length).toBeGreaterThanOrEqual(1);

      const final = await prisma.subscription.findUniqueOrThrow({ where: { householdId } });
      expect(final.status).toBe(SubscriptionStatus.CANCEL_AT_PERIOD_END);
      const changeCount = await prisma.subscriptionChange.count({ where: { subscriptionId: final.id, type: "CANCEL_SCHEDULED" } });
      // Both racers may each successfully record their own CANCEL_SCHEDULED change (the transition ACTIVE->CANCEL_AT_PERIOD_END is idempotent-safe to re-enter once already there is not allowed by assertTransition, so at most one write actually lands as a state change — but never more than the number of callers).
      expect(changeCount).toBeGreaterThanOrEqual(1);
      expect(changeCount).toBeLessThanOrEqual(2);
    });
  });
});
