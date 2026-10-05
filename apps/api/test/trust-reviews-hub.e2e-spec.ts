import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { ProviderUserRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { AccountExportService } from "../src/modules/account/account-export.service";

type Actor = { id: string; cookie: string; csrf: string };

/** G10: member appeals, structured reviews + one provider reply, unified saved, public search, recently viewed, export scope, deletion impact. */
describe("Trust, reviews and consumer hub", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const send = (m: "post" | "put" | "delete", a: Actor, u: string) => request(server())[m](u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const tag = randomUUID().slice(0, 8);

  async function actor(name: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `g10-${randomUUID()}@example.com` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  async function decision(subjectType: "USER" | "COMMUNITY_CONTENT", subjectId: string, createdAt = new Date()) {
    const adminUser = await db.user.create({ data: { displayName: "admin", email: `g10a-${randomUUID()}@example.com` } });
    const admin = await db.adminUser.create({ data: { userId: adminUser.id, role: "SUPER_ADMIN" } });
    const c = await db.trustCase.create({ data: { subjectType, subjectId, reason: "r", openedByAdminId: admin.id } });
    return db.trustAction.create({ data: { trustCaseId: c.id, actionType: "WARNING", reason: "قوانین", performedByAdminId: admin.id, createdAt } });
  }
  async function provider() {
    const org = await db.providerOrganization.create({ data: { name: `G10 Clinic ${tag}`, type: "VET_CLINIC", verificationStatus: "VERIFIED" } });
    const loc = await db.providerLocation.create({ data: { providerOrganizationId: org.id, addressLine: "x", city: "Tehran", countryCode: "IR", timezone: "UTC" } });
    const svc = await db.providerService.create({ data: { providerOrganizationId: org.id, locationId: loc.id, name: `G10 Visit ${tag}`, type: "GENERAL_VET_VISIT", category: "VET", locationMode: "AT_PROVIDER", durationMinutes: 30, priceAmount: 1000, currency: "IRR" } });
    const owner = await actor("provider-owner");
    await db.providerUser.create({ data: { userId: owner.id, providerOrganizationId: org.id, role: ProviderUserRole.OWNER } });
    return { org, loc, svc, owner };
  }
  async function completedBooking(customer: Actor, p: Awaited<ReturnType<typeof provider>>) {
    const hh = (await send("post", customer, "/households").send({}).expect(201)).body;
    const pet = (await send("post", customer, `/households/${hh.id}/pets`).send({ name: "Rev Dog", species: "DOG", approximateAgeMonths: 30 }).expect(201)).body;
    const start = new Date(Date.now() - 2 * 86400_000);
    return db.booking.create({ data: { householdId: hh.id, petId: pet.id, userId: customer.id, providerOrganizationId: p.org.id, providerLocationId: p.loc.id, providerServiceId: p.svc.id, category: "VET", locationMode: "AT_PROVIDER", startAt: start, endAt: new Date(start.getTime() + 1800_000), timezone: "UTC", bookingStatus: "COMPLETED" } });
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("appeals: only the affected member sees and appeals a decision, once, within the window; withdraw only before review; nothing auto-reverses", async () => {
    const a = await actor("a");
    const b = await actor("b");
    const own = await decision("USER", a.id);
    const old = await decision("USER", a.id, new Date(Date.now() - 31 * 86400e3));
    const others = await decision("USER", b.id);

    const list = (await get(a, "/me/moderation-decisions").expect(200)).body;
    expect(list.map((d: { actionId: string }) => d.actionId).sort()).toEqual([own.id, old.id].sort());
    expect(list.find((d: { actionId: string }) => d.actionId === old.id).canAppeal).toBe(false);

    await send("post", a, `/me/moderation-decisions/${others.id}/appeal`).send({ reason: "این تصمیم اشتباه است" }).expect(404);
    await send("post", a, `/me/moderation-decisions/${old.id}/appeal`).send({ reason: "این تصمیم اشتباه است" }).expect(400);
    await send("post", a, `/me/moderation-decisions/${own.id}/appeal`).send({ reason: "short" }).expect(400);
    const appeal = (await send("post", a, `/me/moderation-decisions/${own.id}/appeal`).send({ reason: "این تصمیم اشتباه است" }).expect(201)).body;
    expect(appeal.status).toBe("SUBMITTED");
    await send("post", a, `/me/moderation-decisions/${own.id}/appeal`).send({ reason: "دوباره اعتراض می‌کنم" }).expect(400);
    expect(await db.trustAction.count({ where: { id: own.id } })).toBe(1);

    await send("post", b, `/me/appeals/${appeal.id}/withdraw`).expect(404);
    expect((await get(b, "/me/appeals").expect(200)).body).toEqual([]);
    expect((await send("post", a, `/me/appeals/${appeal.id}/withdraw`).expect(201)).body.status).toBe("WITHDRAWN");
    await send("post", a, `/me/appeals/${appeal.id}/withdraw`).expect(400);

    // A second decision: an appeal under review can't be withdrawn; an upheld one shows REJECTED.
    const second = await decision("USER", a.id);
    const ap2 = (await send("post", a, `/me/moderation-decisions/${second.id}/appeal`).send({ reason: "لطفا بازبینی کنید" }).expect(201)).body;
    await db.appeal.update({ where: { id: ap2.id }, data: { status: "UNDER_REVIEW" } });
    await send("post", a, `/me/appeals/${ap2.id}/withdraw`).expect(400);
    await db.appeal.update({ where: { id: ap2.id }, data: { status: "UPHELD", resolution: "تصمیم باقی ماند", resolvedAt: new Date() } });
    expect((await get(a, "/me/appeals").expect(200)).body.find((x: { id: string }) => x.id === ap2.id)).toMatchObject({ status: "REJECTED", resolution: "تصمیم باقی ماند" });
  });

  it("structured reviews: eligibility, 1–5 dimensions, one reply per review by the owning provider with edit audit", async () => {
    const p = await provider();
    const other = await provider();
    const customer = await actor("customer");
    const stranger = await actor("stranger");
    const booking = await completedBooking(customer, p);

    await send("post", stranger, `/bookings/${booking.id}/review`).send({ rating: 4 }).expect(403);
    await send("post", customer, `/bookings/${booking.id}/review`).send({ rating: 4, quality: 6 }).expect(400);
    await send("post", customer, `/bookings/${booking.id}/review`).send({ rating: 4, timeliness: 0 }).expect(400);
    const review = (await send("post", customer, `/bookings/${booking.id}/review`).send({ rating: 4, quality: 5, communication: 4, timeliness: 3, body: "خوب بود" }).expect(201)).body;

    const pub = (await request(server()).get(`/providers/${p.org.id}/reviews`).expect(200)).body;
    expect(pub.summary).toMatchObject({ count: 1, dimensions: { quality: 5, communication: 4, timeliness: 3 } });

    await send("post", other.owner, `/provider/reviews/${review.id}/respond`).send({ response: "نه" }).expect(404);
    await send("post", p.owner, `/provider/reviews/${review.id}/respond`).send({ response: "ممنون" }).expect(201);
    let row = await db.providerReview.findUniqueOrThrow({ where: { id: review.id } });
    expect(row).toMatchObject({ providerResponse: "ممنون", respondedByUserId: p.owner.id, responseEditedAt: null });
    await send("post", p.owner, `/provider/reviews/${review.id}/respond`).send({ response: "ممنون از شما" }).expect(201);
    row = await db.providerReview.findUniqueOrThrow({ where: { id: review.id } });
    expect(row.providerResponse).toBe("ممنون از شما");
    expect(row.responseEditedAt).not.toBeNull();
    const ev = await db.domainEvent.findFirst({ where: { type: "ProviderReviewResponded", aggregateId: review.id }, orderBy: { occurredAt: "desc" } });
    expect((ev?.payload as Record<string, unknown>)?.previousResponse).toBe("ممنون");

    await db.providerReview.update({ where: { id: review.id }, data: { status: "HIDDEN", hiddenReason: "x" } });
    await send("post", p.owner, `/provider/reviews/${review.id}/respond`).send({ response: "باز هم" }).expect(400);
  });

  it("search returns public items only; saved and recently viewed are per-member and drop items that stop being public", async () => {
    const a = await actor("a");
    const b = await actor("b");
    const p = await provider();
    const hidden = await db.providerOrganization.create({ data: { name: `G10 Clinic ${tag} pending`, type: "VET_CLINIC", verificationStatus: "UNDER_REVIEW" } });
    const res = (await request(server()).get(`/search?q=G10 Clinic ${tag}`).expect(200)).body;
    const ids = res.results.map((r: { id: string }) => r.id);
    expect(ids).toContain(p.org.id);
    expect(ids).not.toContain(hidden.id);
    expect(res.results.every((r: { type: string }) => ["PROVIDER", "SERVICE", "PRODUCT", "TRAVEL_LISTING", "PLACE", "ARTICLE", "SUPPORT_NEED", "ORGANIZATION"].includes(r.type))).toBe(true);
    await request(server()).get(`/search?q=G10&types=PET`).expect(400);
    await request(server()).get(`/search?q=x`).expect(400);
    expect((await request(server()).get(`/search?q=G10 Clinic ${tag}&types=SERVICE`).expect(200)).body.results.every((r: { type: string }) => r.type === "SERVICE")).toBe(true);

    await send("put", a, `/providers/${p.org.id}/favorite`).expect((r) => expect([200, 204]).toContain(r.status));
    expect((await get(a, "/me/saved").expect(200)).body.map((s: { id: string }) => s.id)).toContain(p.org.id);
    expect((await get(b, "/me/saved").expect(200)).body.map((s: { id: string }) => s.id)).not.toContain(p.org.id);

    await send("post", a, "/me/recently-viewed").send({ entityType: "PROVIDER", entityId: hidden.id }).expect(404);
    await send("post", a, "/me/recently-viewed").send({ entityType: "PET", entityId: randomUUID() }).expect(400);
    await send("post", a, "/me/recently-viewed").send({ entityType: "PROVIDER", entityId: p.org.id }).expect(201);
    expect((await get(a, "/me/recently-viewed").expect(200)).body.map((r: { id: string }) => r.id)).toEqual([p.org.id]);
    expect((await get(b, "/me/recently-viewed").expect(200)).body).toEqual([]);

    await db.providerOrganization.update({ where: { id: p.org.id }, data: { verificationStatus: "SUSPENDED" } });
    expect((await get(a, "/me/recently-viewed").expect(200)).body).toEqual([]);
    expect((await get(a, "/me/saved").expect(200)).body.map((s: { id: string }) => s.id)).not.toContain(p.org.id);
    expect((await send("delete", a, "/me/recently-viewed").expect(200)).body.cleared).toBe(1);
    await request(server()).get("/me/recently-viewed").expect(401);
  });

  it("export covers the member's own new-domain data only; deletion preview classifies impact without deleting", async () => {
    const a = await actor("a");
    const b = await actor("b");
    const post = await db.communityPost.create({ data: { authorUserId: a.id, body: "پست من", status: "PUBLISHED" } });
    await db.communityPost.create({ data: { authorUserId: b.id, body: "پست دیگری", status: "PUBLISHED" } });
    await db.communityPostBookmark.create({ data: { userId: a.id, postId: post.id } });
    const action = await decision("USER", a.id);
    await send("post", a, `/me/moderation-decisions/${action.id}/appeal`).send({ reason: "این تصمیم اشتباه است" }).expect(201);

    const data = await (app.get(AccountExportService) as unknown as { collect(id: string): Promise<Record<string, unknown>> }).collect(a.id);
    const json = JSON.stringify(data);
    expect(json).toContain("پست من");
    expect(json).not.toContain("پست دیگری");
    expect(json).toContain("این تصمیم اشتباه است");
    expect(json).not.toContain(b.id);

    const preview = (await get(a, "/account/privacy/deletion/preview").expect(200)).body;
    const impact = Object.fromEntries(preview.impact.map((r: { domain: string; count: number; classification: string }) => [r.domain, r]));
    expect(impact.COMMUNITY_POSTS).toMatchObject({ count: 1, classification: "ANONYMIZABLE" });
    expect(impact.SAVED_ITEMS).toMatchObject({ count: 1, classification: "DELETABLE" });
    expect(preview.impact.every((r: { classification: string }) => ["DELETABLE", "ANONYMIZABLE", "RETENTION_REQUIRED_DECISION"].includes(r.classification))).toBe(true);
    expect(await db.communityPost.count({ where: { authorUserId: a.id } })).toBe(1);
  });
});
