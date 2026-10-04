import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { SubscriptionEntitlementType, SubscriptionStatus } from "@prisma/client";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import type { PrismaService } from "../src/common/prisma/prisma.service";
import type { SubscriptionRenewalWorkerService } from "../src/modules/subscriptions/subscription-renewal-worker.service";

const WELCOME = `welcome-${randomUUID()}`;

/**
 * Feature-based membership (owner decision): a new household gets every feature for a week through a
 * real trial; after it, personal reminders and vet sharing are plan features enforced by the server;
 * trials and scheduled cancellations actually end.
 */
describe("Feature-based membership, welcome week and lifecycle ends", () => {
  let app: INestApplication, db: PrismaService, worker: SubscriptionRenewalWorkerService;
  let extractCookie: (typeof import("./test-app"))["extractCookie"];
  let cookie: string, csrf: string, userId: string;
  const previous = process.env.WELCOME_TRIAL_PLAN_CODE;

  beforeAll(async () => {
    process.env.WELCOME_TRIAL_PLAN_CODE = WELCOME;
    // Config is read when the app module is imported, so load it after setting the env, in isolation.
    let mods!: { testApp: typeof import("./test-app"); prisma: typeof import("../src/common/prisma/prisma.service"); renewal: typeof import("../src/modules/subscriptions/subscription-renewal-worker.service") };
    await jest.isolateModulesAsync(async () => {
      mods = { testApp: await import("./test-app"), prisma: await import("../src/common/prisma/prisma.service"), renewal: await import("../src/modules/subscriptions/subscription-renewal-worker.service") };
    });
    app = await mods.testApp.createTestApp();
    extractCookie = mods.testApp.extractCookie;
    db = app.get(mods.prisma.PrismaService);
    worker = app.get(mods.renewal.SubscriptionRenewalWorkerService);
    await db.subscriptionPlan.create({
      data: {
        code: WELCOME, nameFa: "کامل", nameEn: "Full", trialDays: 7, countryAvailability: { create: { countryCode: "IR" } },
        entitlements: { create: [
          { key: "care.reminders", type: SubscriptionEntitlementType.BOOLEAN, boolValue: true },
          { key: "vet.share", type: SubscriptionEntitlementType.BOOLEAN, boolValue: true },
          { key: "pets.max", type: SubscriptionEntitlementType.LIMIT, limitValue: null },
        ] },
      },
    });
    const user = await db.user.create({ data: { displayName: "Member", email: `features-${randomUUID()}@example.com` } });
    userId = user.id;
    const session = await db.session.create({ data: { userId, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(app.getHttpServer()).get("/health/live");
    csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    cookie = `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`;
  });
  afterAll(async () => {
    process.env.WELCOME_TRIAL_PLAN_CODE = previous;
    await app?.close();
  });

  const post = (url: string) => request(app.getHttpServer()).post(url).set("Cookie", cookie).set("x-csrf-token", csrf);
  const get = (url: string) => request(app.getHttpServer()).get(url).set("Cookie", cookie);
  const due = () => new Date(Date.now() + 3 * 86400000).toISOString();

  async function petIn(householdId: string) {
    const pet = await db.pet.create({ data: { householdId, name: "Pistachio", species: "RABBIT" } });
    await db.petAccessGrant.create({ data: { petId: pet.id, userId, canViewHealth: true, canViewCareProfile: true, canEditCareProfile: true, canManageAccess: true, canEditIdentity: true } });
    return pet.id;
  }

  it("a household created through the product starts a one-week trial with every feature", async () => {
    const created = await post("/households").send({ name: "خانهٔ تازه" }).expect(201);
    const sub = await get(`/households/${created.body.id}/subscription`).expect(200);
    expect(sub.body.status).toBe("TRIALING");
    const days = (new Date(sub.body.trialEndsAt).getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
    const petId = await petIn(created.body.id);
    await post(`/pets/${petId}/care-items`).send({ title: "کنترل وزن", type: "WEIGHT_CHECK", dueAt: due(), recurrence: "ONCE" }).expect(201);
  });

  it("without the feature, personal reminders are refused with a typed error — not a crash, not a silent pass", async () => {
    const household = await db.household.create({ data: { name: "رایگان", members: { create: { userId, role: "OWNER" } } } });
    const petId = await petIn(household.id);
    const refused = await post(`/pets/${petId}/care-items`).send({ title: "x", type: "CUSTOM", dueAt: due(), recurrence: "ONCE" }).expect(409);
    expect(refused.body.error.code).toBe("SUBSCRIPTION_FEATURE_NOT_INCLUDED");
    expect(refused.body.error.details.key).toBe("care.reminders");
  });

  it("a trial that ends without a purchase expires, falls back to FREE, and keeps existing reminders readable", async () => {
    const created = await post("/households").send({ name: "پایان آزمایش" }).expect(201);
    const householdId = created.body.id;
    const petId = await petIn(householdId);
    await post(`/pets/${petId}/care-items`).send({ title: "قبل از پایان", type: "CUSTOM", dueAt: due(), recurrence: "ONCE" }).expect(201);
    await db.subscription.update({ where: { householdId }, data: { trialEndsAt: new Date(Date.now() - 1000) } });
    await worker.processDueRenewals();
    const sub = await db.subscription.findUniqueOrThrow({ where: { householdId } });
    expect(sub.status).toBe(SubscriptionStatus.EXPIRED);
    expect(await db.subscriptionChange.count({ where: { subscriptionId: sub.id, type: "EXPIRED" } })).toBe(1);
    const list = await get(`/pets/${petId}/care-items`).expect(200);
    expect(list.body.some((r: { title: string }) => r.title === "قبل از پایان")).toBe(true);
    const refused = await post(`/pets/${petId}/care-items`).send({ title: "بعد از پایان", type: "CUSTOM", dueAt: due(), recurrence: "ONCE" }).expect(409);
    expect(refused.body.error.code).toBe("SUBSCRIPTION_FEATURE_NOT_INCLUDED");
    // Running the worker again is a no-op.
    await worker.processDueRenewals();
    expect(await db.subscriptionChange.count({ where: { subscriptionId: sub.id, type: "EXPIRED" } })).toBe(1);
  });

  it("a cancellation scheduled for the period end is applied when it falls due", async () => {
    const household = await db.household.create({ data: { name: "لغو" } });
    const plan = await db.subscriptionPlan.findUniqueOrThrow({ where: { code: WELCOME } });
    const sub = await db.subscription.create({ data: { householdId: household.id, planId: plan.id, status: SubscriptionStatus.CANCEL_AT_PERIOD_END, cancelRequestedAt: new Date(Date.now() - 86400000), cancelEffectiveAt: new Date(Date.now() - 1000) } });
    await worker.processDueRenewals();
    expect((await db.subscription.findUniqueOrThrow({ where: { id: sub.id } })).status).toBe(SubscriptionStatus.CANCELLED);
  });
});
