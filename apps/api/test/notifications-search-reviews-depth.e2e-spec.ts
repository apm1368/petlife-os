import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { id: string; cookie: string; csrf: string };

/** G18: mark selected notifications read, SERVICE in recently viewed, reporting provider reviews, ACCESS_SHARED activity. */
describe("Notifications, search and reviews depth", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const post = (a: Actor, u: string) => request(server()).post(u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(name: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `g18-${randomUUID()}@example.com` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  const note = (userId: string) => db.notification.create({ data: { userId, type: "booking.confirmed", category: "BOOKING", title: "t", body: "b", locale: "fa" } });

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("mark selected read: only the caller's own ids are touched", async () => {
    const a = await actor("a");
    const b = await actor("b");
    const [a1, a2, a3] = [await note(a.id), await note(a.id), await note(a.id)];
    const b1 = await note(b.id);
    expect((await post(a, "/notifications/read").send({ ids: [a1.id, a2.id, b1.id] }).expect(201)).body.updatedCount).toBe(2);
    expect((await db.notification.findUniqueOrThrow({ where: { id: b1.id } })).readAt).toBeNull();
    expect((await db.notification.findUniqueOrThrow({ where: { id: a3.id } })).readAt).toBeNull();
    await post(a, "/notifications/read").send({ ids: [] }).expect(400);
    await post(a, "/notifications/read").send({ ids: ["not-a-uuid"] }).expect(400);
  });

  it("recently viewed accepts public services, never inactive ones", async () => {
    const a = await actor("a");
    const org = await db.providerOrganization.create({ data: { name: `G18 ${randomUUID().slice(0, 6)}`, type: "VET_CLINIC", verificationStatus: "VERIFIED" } });
    const loc = await db.providerLocation.create({ data: { providerOrganizationId: org.id, addressLine: "x", city: "Tehran", countryCode: "IR", timezone: "UTC" } });
    const mk = (isActive: boolean) => db.providerService.create({ data: { providerOrganizationId: org.id, locationId: loc.id, name: `Svc ${isActive}`, type: "GENERAL_VET_VISIT", category: "VET", locationMode: "AT_PROVIDER", durationMinutes: 30, isActive } });
    const live = await mk(true);
    const off = await mk(false);
    await post(a, "/me/recently-viewed").send({ entityType: "SERVICE", entityId: off.id }).expect(404);
    await post(a, "/me/recently-viewed").send({ entityType: "SERVICE", entityId: live.id }).expect(201);
    expect((await get(a, "/me/recently-viewed").expect(200)).body[0]).toMatchObject({ type: "SERVICE", id: live.id, preview: { title: "Svc true", deepLink: `/providers/${org.id}` } });
  });

  it("provider reviews (and their replies) can be reported once by others, never by their author, only while published", async () => {
    const author = await actor("author");
    const other = await actor("other");
    const org = await db.providerOrganization.create({ data: { name: `G18R ${randomUUID().slice(0, 6)}`, type: "VET_CLINIC", verificationStatus: "VERIFIED" } });
    const loc = await db.providerLocation.create({ data: { providerOrganizationId: org.id, addressLine: "x", city: "Tehran", countryCode: "IR", timezone: "UTC" } });
    const svc = await db.providerService.create({ data: { providerOrganizationId: org.id, locationId: loc.id, name: "v", type: "GENERAL_VET_VISIT", category: "VET", locationMode: "AT_PROVIDER", durationMinutes: 30 } });
    const hh = await db.household.create({ data: { name: "h", members: { create: { userId: author.id, role: "OWNER" } } } });
    const pet = await db.pet.create({ data: { householdId: hh.id, name: "p", species: "DOG", approximateAgeMonths: 20 } });
    const b = await db.booking.create({ data: { householdId: hh.id, petId: pet.id, userId: author.id, providerOrganizationId: org.id, providerLocationId: loc.id, providerServiceId: svc.id, category: "VET", locationMode: "AT_PROVIDER", startAt: new Date(Date.now() - 86400e3), endAt: new Date(Date.now() - 86000e3), timezone: "UTC", bookingStatus: "COMPLETED" } });
    const review = await db.providerReview.create({ data: { bookingId: b.id, providerOrganizationId: org.id, userId: author.id, rating: 1, body: "bad", providerResponse: "abusive reply" } });
    const report = (a: Actor) => post(a, "/reports").send({ targetType: "PROVIDER_REVIEW", targetId: review.id, reason: "ABUSE", details: "the provider reply insults the customer" });
    expect((await report(author).expect(400)).body.error.details.reason).toBe("CANNOT_REPORT_OWN_REVIEW");
    await report(other).expect(201);
    await report(other).expect((r) => expect(r.status).toBeGreaterThanOrEqual(400)); // duplicate
    expect(await db.communityReport.count({ where: { providerReviewId: review.id } })).toBe(1);
    await db.providerReview.update({ where: { id: review.id }, data: { status: "HIDDEN" } });
    await report(await actor("third")).expect(404);
  });

  it("activity feed shows access shared with someone", async () => {
    const owner = await actor("owner");
    const helper = await actor("helper");
    const hh = (await post(owner, "/households").send({}).expect(201)).body;
    const pet = (await post(owner, `/households/${hh.id}/pets`).send({ name: "Share Dog", species: "DOG", approximateAgeMonths: 30 }).expect(201)).body;
    await db.domainEvent.create({ data: { type: "PetAccessGranted", aggregateType: "Pet", aggregateId: pet.id, payload: { petId: pet.id, actorUserId: owner.id, targetUserId: helper.id } } });
    const items = (await get(owner, `/households/${hh.id}/activity`).expect(200)).body.items;
    expect(items.find((i: { kind: string }) => i.kind === "ACCESS_SHARED")).toMatchObject({ petId: pet.id, actor: { isMe: true } });
  });
});
