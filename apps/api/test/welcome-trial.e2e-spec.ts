import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { SubscriptionEntitlementType } from "@prisma/client";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import type { PrismaService } from "../src/common/prisma/prisma.service";

const WELCOME = `welcome-${randomUUID()}`;
const OTHER = `other-${randomUUID()}`;

/**
 * Decision 4: the welcome trial is one per user AND per household, for life, whatever the plan; it starts with the
 * first successful pet (not sign-up, not household creation), and the single use holds under concurrency.
 */
describe("Welcome trial: once per user and household, from the first pet", () => {
  let app: INestApplication, db: PrismaService;
  let extractCookie: (typeof import("./test-app"))["extractCookie"];
  const previous = process.env.WELCOME_TRIAL_PLAN_CODE;
  let otherPlanId: string;

  type Client = { id: string; get: (u: string) => request.Test; post: (u: string) => request.Test };

  async function user(): Promise<Client> {
    const u = await db.user.create({ data: { displayName: "Member", email: `wt-${randomUUID()}@example.com` } });
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
  const addPet = (c: Client, householdId: string, name = "Biscuit") => c.post(`/households/${householdId}/pets`).send({ name, species: "DOG", approximateAgeMonths: 12 });
  const status = async (c: Client, householdId: string) => (await c.get(`/households/${householdId}/subscription`).expect(200)).body.status as string;
  const trials = (where: Record<string, unknown>) => db.subscriptionTrial.count({ where });

  beforeAll(async () => {
    process.env.WELCOME_TRIAL_PLAN_CODE = WELCOME;
    let mods!: { testApp: typeof import("./test-app"); prisma: typeof import("../src/common/prisma/prisma.service") };
    await jest.isolateModulesAsync(async () => {
      mods = { testApp: await import("./test-app"), prisma: await import("../src/common/prisma/prisma.service") };
    });
    app = await mods.testApp.createTestApp();
    extractCookie = mods.testApp.extractCookie;
    db = app.get(mods.prisma.PrismaService);
    for (const code of [WELCOME, OTHER]) {
      const plan = await db.subscriptionPlan.create({
        data: { code, nameFa: code, nameEn: code, trialDays: 7, countryAvailability: { create: { countryCode: "IR" } }, entitlements: { create: [{ key: "pets.max", type: SubscriptionEntitlementType.LIMIT, limitValue: null }] } },
      });
      if (code === OTHER) otherPlanId = plan.id;
    }
  });
  afterAll(async () => {
    process.env.WELCOME_TRIAL_PLAN_CODE = previous;
    await app?.close();
  });

  it("starts with the first pet — not with sign-up or the household — and only once", async () => {
    const u = await user();
    const h = await household(u);
    expect(await status(u, h)).not.toBe("TRIALING");
    expect(await trials({ householdId: h })).toBe(0);

    await addPet(u, h).expect(201);
    expect(await status(u, h)).toBe("TRIALING");
    await addPet(u, h, "Second").expect(201);
    expect(await trials({ householdId: h })).toBe(1);
    expect((await db.household.findUniqueOrThrow({ where: { id: h } })).welcomeTrialConsumedAt).not.toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).welcomeTrialConsumedAt).not.toBeNull();
  });

  it("is once per user: a second household of the same person gets no trial", async () => {
    const u = await user();
    const first = await household(u);
    await addPet(u, first).expect(201);
    const second = await household(u);
    await addPet(u, second).expect(201);
    expect(await status(u, second)).not.toBe("TRIALING");
    expect(await trials({ householdId: second })).toBe(0);
  });

  it("is once per household: another person's first pet there gets no second trial", async () => {
    const a = await user();
    const h = await household(a);
    await addPet(a, h).expect(201);
    const b = await user();
    await db.householdMember.create({ data: { householdId: h, userId: b.id, role: "OWNER" } });
    await addPet(b, h, "B's pet").expect(201);
    expect(await trials({ householdId: h })).toBe(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: b.id } })).welcomeTrialConsumedAt).toBeNull();
  });

  it("a family member adding the first pet starts the household's trial on the owner's account, not their own", async () => {
    const owner = await user();
    const h = await household(owner);
    const member = await user();
    await db.householdMember.create({ data: { householdId: h, userId: member.id, role: "FAMILY" } });
    await addPet(member, h).expect(201);
    expect(await status(owner, h)).toBe("TRIALING");
    expect((await db.user.findUniqueOrThrow({ where: { id: owner.id } })).welcomeTrialConsumedAt).not.toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: member.id } })).welcomeTrialConsumedAt).toBeNull();
    // The member keeps their own trial for a household of their own.
    const own = await household(member);
    await addPet(member, own).expect(201);
    expect(await status(member, own)).toBe("TRIALING");
  });

  it("is plan-independent: after the welcome trial, no trial of another plan", async () => {
    const u = await user();
    const h = await household(u);
    await addPet(u, h).expect(201);
    await db.subscription.update({ where: { householdId: h }, data: { status: "EXPIRED" } });
    const refused = await u.post(`/households/${h}/subscription/trial`).send({ planId: otherPlanId }).expect(409);
    expect(refused.body.error.details.reason).toBe("TRIAL_ALREADY_USED");
  });

  it("a trial started before this change still counts as used", async () => {
    const u = await user();
    const h = await household(u);
    await status(u, h); // the household's subscription row is created on first read
    const sub = await db.subscription.findUniqueOrThrow({ where: { householdId: h } });
    await db.subscriptionTrial.create({ data: { householdId: h, subscriptionId: sub.id, planId: otherPlanId, startAt: new Date(Date.now() - 30 * 86400000), endAt: new Date(Date.now() - 23 * 86400000) } });
    await addPet(u, h).expect(201);
    expect(await status(u, h)).not.toBe("TRIALING");
    expect(await trials({ householdId: h })).toBe(1);
  });

  it("holds under concurrency: parallel first pets in one household, and in two households of one user, start one trial", async () => {
    const u = await user();
    const h = await household(u);
    const results = await Promise.all([addPet(u, h, "One"), addPet(u, h, "Two"), addPet(u, h, "Three")]);
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(await trials({ householdId: h })).toBe(1);

    const v = await user();
    const [h1, h2] = await Promise.all([household(v), household(v)]);
    const both = await Promise.all([addPet(v, h1), addPet(v, h2)]);
    expect(both.every((r) => r.status === 201)).toBe(true);
    expect(await trials({ householdId: { in: [h1, h2] } })).toBe(1);
  });
});
