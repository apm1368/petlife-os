import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";

describe("Pet year in review", () => {
  let app: INestApplication;
  let db: PrismaService;
  let petId: string;
  const actors: Record<string, { id: string; cookie: string }> = {};
  const year = new Date().getUTCFullYear();
  const at = (m: number, d: number) => new Date(Date.UTC(year, m - 1, d, 10));
  const url = () => `/pets/${petId}/year-review?from=${year}-01-01&to=${year}-12-31`;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    for (const name of ["OWNER", "CARE_ONLY_MEMBER", "VET", "STRANGER"]) {
      const user = await db.user.create({ data: { displayName: name, email: `year-review-${randomUUID()}@example.com` } });
      const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) } });
      const res = await request(app.getHttpServer()).get("/health/live");
      const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
      actors[name] = { id: user.id, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
    }
    const owner = actors.OWNER!.id;
    const household = await db.household.create({ data: { name: "سال کوکی", members: { create: [{ userId: owner, role: "OWNER" }, { userId: actors.CARE_ONLY_MEMBER!.id, role: "FAMILY" }] } } });
    petId = (await db.pet.create({ data: { householdId: household.id, name: "کوکی", species: "DOG" } })).id;
    await db.petAccessGrant.create({ data: { petId, userId: owner, canViewHealth: true, canViewCareProfile: true, canEditIdentity: true } });
    await db.petAccessGrant.create({ data: { petId, userId: actors.CARE_ONLY_MEMBER!.id, canViewCareProfile: true } });
    await db.petAccessGrant.create({ data: { petId, userId: actors.VET!.id, canViewHealth: true, source: "TEMPORARY", expiresAt: new Date(Date.now() + 86_400_000) } });

    const memory = { petId, householdId: household.id, createdByUserId: owner };
    await db.petMemory.createMany({
      data: [
        { ...memory, type: "PHOTO", title: "اولین برف", occurredAt: at(1, 20) },
        { ...memory, type: "PHOTO", title: null, occurredAt: at(2, 2) },
        { ...memory, type: "MILESTONE", title: "یاد گرفت بنشیند", occurredAt: at(5, 5) },
        { ...memory, type: "PHOTO", title: "بایگانی‌شده", occurredAt: at(6, 6), archivedAt: new Date() },
        { ...memory, type: "PHOTO", title: "سال قبل", occurredAt: new Date(Date.UTC(year - 1, 11, 30)) },
      ],
    });
    const reminder = { petId, createdByUserId: owner, title: "x", dueAt: at(3, 1), originalDueAt: at(3, 1) };
    await db.careReminder.createMany({
      data: [
        { ...reminder, type: "DEWORMING", state: "COMPLETED", completedAt: at(3, 1) },
        { ...reminder, type: "DEWORMING", state: "COMPLETED", completedAt: at(6, 1) },
        { ...reminder, type: "GROOMING", state: "COMPLETED", completedAt: at(4, 1) },
        { ...reminder, type: "VACCINATION", state: "UPCOMING" },
      ],
    });

    const org = await db.providerOrganization.create({ data: { name: `YR clinic ${randomUUID().slice(0, 6)}`, type: "VET_CLINIC", verificationStatus: "VERIFIED" } });
    const loc = await db.providerLocation.create({ data: { providerOrganizationId: org.id, addressLine: "x", city: "Tehran", countryCode: "IR", timezone: "UTC" } });
    const svc = await db.providerService.create({ data: { providerOrganizationId: org.id, locationId: loc.id, name: "اصلاح", type: "GROOMING_SESSION", category: "GROOMING", locationMode: "AT_PROVIDER", durationMinutes: 60 } });
    const booking = { householdId: household.id, petId, userId: owner, providerOrganizationId: org.id, providerLocationId: loc.id, providerServiceId: svc.id, category: "GROOMING" as const, locationMode: "AT_PROVIDER" as const, timezone: "UTC" };
    await db.booking.create({ data: { ...booking, startAt: at(4, 10), endAt: at(4, 11), bookingStatus: "COMPLETED" } });
    await db.booking.create({ data: { ...booking, startAt: at(7, 10), endAt: at(7, 11), bookingStatus: "CANCELLED_BY_USER" } });

    const providerUserId = (await db.providerUser.create({ data: { userId: actors.VET!.id, providerOrganizationId: org.id, role: "VET" } })).id;
    const visit = { petId, householdId: household.id, providerOrganizationId: org.id, providerUserId };
    await db.clinicalVisit.create({ data: { ...visit, status: "COMPLETED", startedAt: at(2, 14) } });
    await db.clinicalVisit.create({ data: { ...visit, status: "VOIDED", startedAt: at(2, 15) } });

    const trip = { householdId: household.id, petId, createdByUserId: owner, originCountry: "IR" };
    await db.trip.create({ data: { ...trip, destinationCountry: "IR", destinationCity: "رامسر", departAt: at(8, 1), status: "COMPLETED" } });
    await db.trip.create({ data: { ...trip, destinationCountry: "TR", departAt: at(9, 1), status: "DRAFT" } });
  });

  afterAll(async () => {
    await app?.close();
  });

  const get = (actor: string) => request(app.getHttpServer()).get(url()).set("Cookie", actors[actor]!.cookie);

  it("recaps the owner's year from the source records, counting only what happened", async () => {
    const res = await get("OWNER").expect(200);
    expect(res.body.memories.total).toBe(3);
    expect(res.body.memories.photos).toBe(2);
    expect(res.body.memories.highlights.map((h: { title: string }) => h.title)).toEqual(["یاد گرفت بنشیند", "اولین برف"]);
    expect(res.body.care).toEqual({ completed: 3, topTypes: [{ type: "DEWORMING", count: 2 }, { type: "GROOMING", count: 1 }] });
    expect(res.body.services).toEqual({ completed: 1, byCategory: [{ category: "GROOMING", count: 1 }] });
    expect(res.body.trips).toEqual({ count: 1, destinations: ["رامسر"] });
    expect(res.body.health).toEqual({ visits: 1 });
  });

  it("leaves out every section the reader's own access doesn't cover", async () => {
    const member = await get("CARE_ONLY_MEMBER").expect(200);
    expect(member.body.health).toBeNull();
    expect(member.body.care.completed).toBe(3);
    expect(member.body.services.completed).toBe(1);

    const vet = await get("VET").expect(200);
    expect(vet.body.health).toEqual({ visits: 1 });
    expect(vet.body.care).toBeNull();
    expect(vet.body.services).toBeNull();
    expect(vet.body.trips).toBeNull();
  });

  it("refuses strangers and anonymous readers", async () => {
    await get("STRANGER").expect(403);
    await request(app.getHttpServer()).get(url()).expect(401);
  });
});
