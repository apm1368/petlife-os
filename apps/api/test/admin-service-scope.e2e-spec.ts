import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import {
  AdminMembershipStatus,
  AdminRole,
  AdminVertical,
  ProviderServiceType,
  ProviderType,
  ServiceCategory,
} from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { id: string; adminUserId: string; cookie: string; csrf: string };

/**
 * W2-4 row-level scoping, the case a controller-level vertical gate cannot cover: clinic and grooming
 * providers share one admin controller (`/admin/provider-services` et al.), so a GROOMING-scoped
 * SERVICE_ADMIN must be separated from CLINIC rows inside the query, not by the route. Every list,
 * mutation, empty-scope, forged-id and scope-change case goes through the HTTP API, and an allowed
 * request is asserted 200/201 — never merely "not 403".
 */
describe("Admin service vertical scoping (W2-4, row level)", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const post = (a: Actor, u: string) => request(server()).post(u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(role: AdminRole, serviceScopes: AdminVertical[] = []): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: `svc ${role}`, email: `svc-${randomUUID()}@example.com` } });
    const admin = await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE, serviceScopes } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    const csrf = extractCookie((await request(server()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, adminUserId: admin.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }

  async function provider(type: ProviderType, category: ServiceCategory, serviceType: ProviderServiceType) {
    const org = await db.providerOrganization.create({ data: { name: `${type}-${randomUUID().slice(0, 6)}`, type } });
    const location = await db.providerLocation.create({ data: { providerOrganizationId: org.id, addressLine: "Scope test", city: "Tehran", countryCode: "IR", timezone: "UTC" } });
    const service = await db.providerService.create({ data: { providerOrganizationId: org.id, locationId: location.id, name: `svc-${randomUUID().slice(0, 6)}`, type: serviceType, category, locationMode: "AT_PROVIDER", durationMinutes: 30 } });
    return { orgId: org.id, locationId: location.id, serviceId: service.id, category };
  }

  type Fixture = { orgId: string; locationId: string; serviceId: string; category: ServiceCategory; bookingId: string; reviewId: string; waitlistId: string };
  let clinic: Fixture;
  let groomer: Fixture;

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    db = app.get(PrismaService);
    const customer = await db.user.create({ data: { displayName: "scope customer", email: `scope-customer-${randomUUID()}@example.com` } });
    const household = await db.household.create({ data: { name: "scope household", members: { create: { userId: customer.id, role: "OWNER" } } } });
    const pet = await db.pet.create({ data: { householdId: household.id, name: "scope pet", species: "DOG" } });
    const complete = async (base: Awaited<ReturnType<typeof provider>>): Promise<Fixture> => {
      const booking = await db.booking.create({ data: { householdId: household.id, petId: pet.id, userId: customer.id, providerOrganizationId: base.orgId, providerLocationId: base.locationId, providerServiceId: base.serviceId, category: base.category, locationMode: "AT_PROVIDER", startAt: new Date(Date.now() - 3600_000), endAt: new Date(Date.now() - 1800_000), timezone: "UTC", bookingStatus: "COMPLETED" } });
      const review = await db.providerReview.create({ data: { bookingId: booking.id, providerOrganizationId: base.orgId, userId: customer.id, rating: 4, body: `scope ${base.category}` } });
      const waitlist = await db.bookingWaitlistEntry.create({ data: { householdId: household.id, userId: customer.id, petId: pet.id, providerOrganizationId: base.orgId, serviceId: base.serviceId, windowStart: new Date(Date.now() + 3600_000), windowEnd: new Date(Date.now() + 7200_000) } });
      return { ...base, bookingId: booking.id, reviewId: review.id, waitlistId: waitlist.id };
    };
    clinic = await complete(await provider(ProviderType.VET_CLINIC, ServiceCategory.VET, ProviderServiceType.GENERAL_VET_VISIT));
    groomer = await complete(await provider(ProviderType.GROOMER, ServiceCategory.GROOMING, ProviderServiceType.CONSULTATION));
  });
  afterAll(async () => app.close());

  const idsIn = async (a: Actor, url = "/admin/provider-services"): Promise<string[]> =>
    (await get(a, url).expect(200)).body.map((s: { id: string }) => s.id);

  it("an unscoped admin sees both clinic and grooming services", async () => {
    const ids = await idsIn(await actor(AdminRole.SUPER_ADMIN));
    expect(ids).toEqual(expect.arrayContaining([clinic.serviceId, groomer.serviceId]));
  });

  it("a clinic-scoped service admin sees only clinic services", async () => {
    const ids = await idsIn(await actor(AdminRole.SERVICE_ADMIN, [AdminVertical.CLINIC]));
    expect(ids).toContain(clinic.serviceId);
    expect(ids).not.toContain(groomer.serviceId);
  });

  it("a grooming-scoped service admin sees only grooming services", async () => {
    const ids = await idsIn(await actor(AdminRole.SERVICE_ADMIN, [AdminVertical.GROOMING]));
    expect(ids).toContain(groomer.serviceId);
    expect(ids).not.toContain(clinic.serviceId);
  });

  it("scopes booking lists and direct booking detail by provider type", async () => {
    const grooming = await actor(AdminRole.SERVICE_ADMIN, [AdminVertical.GROOMING]);
    const listed = (await get(grooming, "/admin/service-bookings").expect(200)).body.items.map((row: { id: string }) => row.id);
    expect(listed).toContain(groomer.bookingId);
    expect(listed).not.toContain(clinic.bookingId);
    await get(grooming, `/admin/service-bookings/${groomer.bookingId}`).expect(200);
    const denied = await get(grooming, `/admin/service-bookings/${clinic.bookingId}`).expect(403);
    expect(denied.body.error.details.reason).toBe("OUT_OF_VERTICAL_SCOPE");
  });

  it("scopes review and waitlist lists and blocks a cross-vertical review mutation", async () => {
    const clinicAdmin = await actor(AdminRole.SERVICE_ADMIN, [AdminVertical.CLINIC]);
    const reviews = (await get(clinicAdmin, "/admin/provider-reviews").expect(200)).body.map((row: { id: string }) => row.id);
    expect(reviews).toContain(clinic.reviewId);
    expect(reviews).not.toContain(groomer.reviewId);
    const waitlist = (await get(clinicAdmin, "/admin/service-waitlist").expect(200)).body.map((row: { id: string }) => row.id);
    expect(waitlist).toContain(clinic.waitlistId);
    expect(waitlist).not.toContain(groomer.waitlistId);
    await post(clinicAdmin, `/admin/provider-reviews/${groomer.reviewId}/hide`).send({ reason: "Cross-vertical review mutation" }).expect(403);
    expect((await db.providerReview.findUniqueOrThrow({ where: { id: groomer.reviewId } })).status).toBe("PUBLISHED");
  });

  it("computes analytics only from categories in the caller's provider scope", async () => {
    const clinicAdmin = await actor(AdminRole.SERVICE_ADMIN, [AdminVertical.CLINIC]);
    const groomingAdmin = await actor(AdminRole.SERVICE_ADMIN, [AdminVertical.GROOMING]);
    const clinicAnalytics = (await get(clinicAdmin, "/admin/services-analytics").expect(200)).body;
    const groomingAnalytics = (await get(groomingAdmin, "/admin/services-analytics").expect(200)).body;
    const since = new Date(Date.now() - 30 * 86400_000);
    const expected = async (types: ProviderType[]) => Object.fromEntries((await db.booking.groupBy({
      by: ["category"],
      where: { providerOrganization: { type: { in: types } }, createdAt: { gte: since } },
      _count: { _all: true },
    })).map((row) => [row.category, row._count._all]));
    expect(clinicAnalytics.byCategory).toEqual(await expected([ProviderType.VET_CLINIC, ProviderType.VET_HOSPITAL, ProviderType.VETERINARIAN]));
    expect(groomingAnalytics.byCategory).toEqual(await expected([ProviderType.GROOMER]));
    expect(clinicAnalytics.totalBookings).toBe(Object.values(clinicAnalytics.byCategory as Record<string, number>).reduce((sum, count) => sum + count, 0));
    expect(groomingAnalytics.totalBookings).toBe(Object.values(groomingAnalytics.byCategory as Record<string, number>).reduce((sum, count) => sum + count, 0));
  });

  it("a service admin whose verticals map to no provider type sees nothing (empty, not all)", async () => {
    // INSURANCE is a service vertical but has no ProviderType, so it must deny the provider surface.
    const ids = await idsIn(await actor(AdminRole.SERVICE_ADMIN, [AdminVertical.INSURANCE]));
    expect(ids).not.toContain(clinic.serviceId);
    expect(ids).not.toContain(groomer.serviceId);
    const none = await idsIn(await actor(AdminRole.SERVICE_ADMIN, []));
    expect(none).toHaveLength(0);
  });

  it("a forged providerId cannot widen scope", async () => {
    // A grooming admin asking for the clinic's providerId gets nothing, not the clinic's services.
    const ids = await idsIn(await actor(AdminRole.SERVICE_ADMIN, [AdminVertical.GROOMING]), `/admin/provider-services?providerId=${clinic.orgId}`);
    expect(ids).toHaveLength(0);
  });

  it("a scoped admin may mutate inside its vertical but not across it", async () => {
    const groomingAdmin = await actor(AdminRole.SERVICE_ADMIN, [AdminVertical.GROOMING]);
    // Across the vertical: refused, and the row is untouched.
    const denied = await post(groomingAdmin, `/admin/provider-services/${clinic.serviceId}/deactivate`).send({ reason: "cross-vertical attempt" }).expect(403);
    expect(denied.body.error.details).toMatchObject({ reason: "OUT_OF_VERTICAL_SCOPE" });
    expect((await db.providerService.findUniqueOrThrow({ where: { id: clinic.serviceId } })).isActive).toBe(true);
    // Inside the vertical: a real 200 (not merely "not 403"), and the row actually changes.
    await post(groomingAdmin, `/admin/provider-services/${groomer.serviceId}/deactivate`).send({ reason: "within vertical" }).expect(201);
    expect((await db.providerService.findUniqueOrThrow({ where: { id: groomer.serviceId } })).isActive).toBe(false);
    await post(groomingAdmin, `/admin/provider-services/${groomer.serviceId}/reactivate`).send({ reason: "restore" }).expect(201);
  });

  it("applies a scope change to the next request without a new session", async () => {
    const admin = await actor(AdminRole.SERVICE_ADMIN, [AdminVertical.CLINIC]);
    expect(await idsIn(admin)).toContain(clinic.serviceId);
    await db.adminUser.update({ where: { id: admin.adminUserId }, data: { serviceScopes: [AdminVertical.GROOMING] } });
    const after = await idsIn(admin);
    expect(after).toContain(groomer.serviceId);
    expect(after).not.toContain(clinic.serviceId);
  });
});
