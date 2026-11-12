import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole, ProviderUserRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { id: string; csrf: string; cookie: string };

/**
 * On-demand pet taxi: server fare from staff rules (straight-line estimate without a maps provider), first driver to
 * accept wins, forward-only ride steps, contact details only after acceptance, member cancel/rate.
 */
describe("Pet taxi on demand (e2e)", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const post = (a: Actor, u: string) => request(server()).post(u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const put = (a: Actor, u: string) => request(server()).put(u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const tajrish = { label: "Tajrish", latitude: 35.8048, longitude: 51.4344, city: "تهران" };
  const azadi = { label: "Azadi", latitude: 35.6997, longitude: 51.338 };

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    await db.petTaxiFareRule.deleteMany({});
  });
  afterAll(async () => {
    await db.petTaxiFareRule.deleteMany({});
    await app.close();
  });

  async function actor(name: string, phone?: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `ptaxi-${randomUUID()}@example.com`, ...(phone ? { phone } : {}) } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  async function member() {
    const owner = await actor("Sara", `+98912${Math.floor(1e6 + Math.random() * 8e6)}`);
    const hh = await db.household.create({ data: { name: "h", members: { create: { userId: owner.id, role: "OWNER" } } } });
    const pet = await db.pet.create({ data: { householdId: hh.id, name: "Cookie", species: "DOG", approximateAgeMonths: 30 } });
    return { owner, petId: pet.id };
  }
  async function driver(type: "PET_TAXI" | "VET_CLINIC" = "PET_TAXI", verificationStatus: "VERIFIED" | "NOT_STARTED" = "VERIFIED") {
    const org = await db.providerOrganization.create({ data: { name: `Taxi ${randomUUID().slice(0, 6)}`, type: type as never, verificationStatus, phone: "02188888888" } });
    const d = await actor("Reza");
    await db.providerUser.create({ data: { userId: d.id, providerOrganizationId: org.id, role: ProviderUserRole.OWNER } });
    return d;
  }

  it("prices from staff rules, lets the first online driver take the ride, and moves it forward only", async () => {
    const staff = await actor("staff");
    await db.adminUser.create({ data: { userId: staff.id, role: AdminRole.SUPER_ADMIN, status: AdminMembershipStatus.ACTIVE } });
    const { owner, petId } = await member();
    // No rule yet: no price, no ride.
    expect((await post(owner, "/pet-taxi/quote").send({ pickup: tajrish, dropoff: azadi, carrierSize: "MEDIUM", petCount: 1 }).expect(201)).body).toMatchObject({ available: false, reason: "NOT_PRICED", routeSource: "STRAIGHT_LINE_ESTIMATE" });
    await put(owner, "/admin/pet-taxi/fare-rules/*").send({ baseFareIrr: 500_000, perKmIrr: 80_000, perMinuteIrr: 10_000, minimumFareIrr: 1_000_000, mediumSurchargePercent: 20, largeSurchargePercent: 40, extraPetIrr: 200_000, active: true }).expect(403);
    await put(staff, "/admin/pet-taxi/fare-rules/*").send({ baseFareIrr: 500_000, perKmIrr: 80_000, perMinuteIrr: 10_000, minimumFareIrr: 1_000_000, mediumSurchargePercent: 20, largeSurchargePercent: 40, extraPetIrr: 200_000, active: true, reason: "Launch fares" }).expect(200);
    const quote = (await post(owner, "/pet-taxi/quote").send({ pickup: tajrish, dropoff: azadi, carrierSize: "MEDIUM", petCount: 1 }).expect(201)).body;
    expect(quote).toMatchObject({ available: true, fareRuleCity: "*" });
    expect(quote.fareIrr % 10_000).toBe(0);
    expect(quote.distanceMeters).toBeGreaterThan(12_000);

    const key = randomUUID();
    const ride = (await post(owner, "/pet-taxi/rides").set("Idempotency-Key", key).send({ pickup: tajrish, dropoff: azadi, carrierSize: "MEDIUM", petIds: [petId] }).expect(201)).body;
    expect(ride).toMatchObject({ status: "SEARCHING", fareIrr: quote.fareIrr, driver: null });
    expect((await post(owner, "/pet-taxi/rides").set("Idempotency-Key", key).send({ pickup: tajrish, dropoff: azadi, carrierSize: "MEDIUM", petIds: [petId] }).expect(201)).body.id).toBe(ride.id);
    await post(owner, "/pet-taxi/rides").set("Idempotency-Key", randomUUID()).send({ pickup: tajrish, dropoff: azadi, carrierSize: "MEDIUM", petIds: [petId] }).expect(400);
    const stranger = await actor("stranger");
    await get(stranger, `/pet-taxi/rides/${ride.id}`).expect(400);
    await post(stranger, "/pet-taxi/rides").set("Idempotency-Key", randomUUID()).send({ pickup: tajrish, dropoff: azadi, carrierSize: "SMALL", petIds: [petId] }).expect(400);

    const clinic = await driver("VET_CLINIC");
    expect((await get(clinic, "/provider/pet-taxi").expect(200)).body).toMatchObject({ eligible: false, reason: "NOT_PET_TAXI" });
    await post(clinic, `/provider/pet-taxi/rides/${ride.id}/accept`).expect(400);

    const first = await driver();
    const second = await driver();
    // Offline drivers see no requests; online ones near the pickup do, without the member's contact.
    expect((await get(first, "/provider/pet-taxi").expect(200)).body.requests).toEqual([]);
    const seen = (await post(first, "/provider/pet-taxi/presence").send({ online: true, latitude: 35.79, longitude: 51.43 }).expect(201)).body;
    expect(seen.requests.map((r: { id: string }) => r.id)).toContain(ride.id);
    expect(JSON.stringify(seen.requests)).not.toContain("Sara");
    await post(second, "/provider/pet-taxi/presence").send({ online: true, latitude: 35.7, longitude: 51.34 }).expect(201);

    const [a, b] = await Promise.all([post(first, `/provider/pet-taxi/rides/${ride.id}/accept`), post(second, `/provider/pet-taxi/rides/${ride.id}/accept`)]);
    expect([a.status, b.status].sort()).toEqual([201, 400]);
    const winner = a.status === 201 ? first : second;
    const loser = a.status === 201 ? second : first;
    const active = (await get(winner, "/provider/pet-taxi").expect(200)).body.activeRide;
    expect(active).toMatchObject({ id: ride.id, status: "DRIVER_ASSIGNED", member: { name: "Sara" } });
    expect((await get(loser, "/provider/pet-taxi").expect(200)).body.activeRide).toBeNull();

    // The member now sees the driver and their position moving.
    await post(winner, "/provider/pet-taxi/presence").send({ online: true, latitude: 35.8, longitude: 51.43 }).expect(201);
    const followed = (await get(owner, `/pet-taxi/rides/${ride.id}`).expect(200)).body;
    expect(followed.driver).toMatchObject({ name: "Reza", phone: "02188888888", latitude: 35.8, longitude: 51.43 });
    expect(followed.etaSeconds).toBeGreaterThan(0);

    await post(winner, `/provider/pet-taxi/rides/${ride.id}/status`).send({ status: "PICKED_UP" }).expect(400);
    await post(winner, `/provider/pet-taxi/rides/${ride.id}/status`).send({ status: "ARRIVING" }).expect(201);
    await post(winner, `/provider/pet-taxi/rides/${ride.id}/status`).send({ status: "PICKED_UP" }).expect(201);
    await post(owner, `/pet-taxi/rides/${ride.id}/cancel`).send({}).expect(400);
    await post(loser, `/provider/pet-taxi/rides/${ride.id}/status`).send({ status: "COMPLETED" }).expect(400);
    await post(winner, `/provider/pet-taxi/rides/${ride.id}/status`).send({ status: "COMPLETED" }).expect(201);

    await post(owner, `/pet-taxi/rides/${ride.id}/rate`).send({ rating: 6 }).expect(400);
    const rated = (await post(owner, `/pet-taxi/rides/${ride.id}/rate`).send({ rating: 5, comment: "Gentle with Cookie" }).expect(201)).body;
    expect(rated).toMatchObject({ status: "COMPLETED", rating: 5 });
    expect(rated.driver.phone).toBeNull();
    await post(owner, `/pet-taxi/rides/${ride.id}/rate`).send({ rating: 4 }).expect(400);
    const overview = (await get(staff, "/admin/pet-taxi").expect(200)).body;
    expect(overview.rides.find((r: { id: string }) => r.id === ride.id)).toMatchObject({ memberName: "Sara", driverName: "Reza" });
  });

  it("a member can cancel while searching, and a driver can hand a ride back before pickup", async () => {
    await db.petTaxiFareRule.upsert({ where: { city: "*" }, create: { city: "*", baseFareIrr: 500_000, perKmIrr: 50_000 }, update: { active: true } });
    const { owner, petId } = await member();
    const ride = (await post(owner, "/pet-taxi/rides").set("Idempotency-Key", randomUUID()).send({ pickup: tajrish, dropoff: azadi, carrierSize: "SMALL", petIds: [petId] }).expect(201)).body;
    const d = await driver();
    await post(d, "/provider/pet-taxi/presence").send({ online: true }).expect(201);
    await post(d, `/provider/pet-taxi/rides/${ride.id}/accept`).expect(201);
    await post(d, `/provider/pet-taxi/rides/${ride.id}/release`).send({ reason: "Flat tyre" }).expect(201);
    expect((await get(owner, `/pet-taxi/rides/${ride.id}`).expect(200)).body).toMatchObject({ status: "SEARCHING", driver: null });
    // The driver who handed it back is not offered it again.
    expect((await get(d, "/provider/pet-taxi").expect(200)).body.requests.map((r: { id: string }) => r.id)).not.toContain(ride.id);
    expect((await post(owner, `/pet-taxi/rides/${ride.id}/cancel`).send({ reason: "Changed plans" }).expect(201)).body.status).toBe("CANCELLED_BY_MEMBER");
  });
});
