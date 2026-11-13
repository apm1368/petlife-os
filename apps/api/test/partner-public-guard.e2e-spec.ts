import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { LocationMode, ProviderServiceType, ServiceCategory } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { id: string; cookie: string; csrf: string };

/**
 * Owner rule (2026-11-13): a partner is public only after verification, on
 * the server. A clinic that has signed up but is not verified yet must not
 * be findable, readable or actionable from any public surface; the same
 * clinic appears once staff verify it.
 */
describe("a partner is public only after verification", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const anon = (u: string) => request(server()).get(u);
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const send = (m: "post" | "put", a: Actor, u: string) => request(server())[m](u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(name: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `pguard-${randomUUID()}@example.com` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("an unverified clinic is invisible and unbookable everywhere, then appears once verified", async () => {
    const tag = randomUUID().slice(0, 8);
    const name = `Guard Clinic ${tag}`;
    const org = await db.providerOrganization.create({ data: { name, type: "VET_CLINIC", verificationStatus: "UNDER_REVIEW" } });
    const location = await db.providerLocation.create({ data: { providerOrganizationId: org.id, addressLine: "Guard Road 1", city: "Tehran", countryCode: "IR", timezone: "UTC" } });
    const service = await db.providerService.create({ data: { providerOrganizationId: org.id, locationId: location.id, name: "Checkup", type: "GENERAL_VET_VISIT", category: "VET", locationMode: "AT_PROVIDER", durationMinutes: 30 } });
    const taxiOrg = await db.providerOrganization.create({ data: { name: `Guard Taxi ${tag}`, type: "PET_TAXI", verificationStatus: "SUBMITTED" } });
    const taxiLocation = await db.providerLocation.create({ data: { providerOrganizationId: taxiOrg.id, addressLine: "Base", city: "Tehran", countryCode: "IR", timezone: "UTC" } });
    const taxi = await db.providerService.create({ data: { providerOrganizationId: taxiOrg.id, locationId: taxiLocation.id, name: "Pet taxi", type: ProviderServiceType.PET_TAXI_RIDE, category: ServiceCategory.PET_TAXI, locationMode: LocationMode.TRANSPORT, durationMinutes: 60, priceAmount: 2_000_000, currency: "IRR" } });

    const owner = await actor("Pet Owner");
    const household = await db.household.create({ data: { name: "Guard home", members: { create: { userId: owner.id, role: "OWNER" } } } });
    const pet = await db.pet.create({ data: { householdId: household.id, name: "Pishi", species: "CAT" } });
    // Pet permissions come from grants, not from household membership alone (same fixture as the booking e2e).
    await db.petAccessGrant.create({ data: { petId: pet.id, userId: owner.id, canViewIdentity: true, canViewHealth: true, canEditHealth: true, canBookCare: true, canViewCareProfile: true, canEditCareProfile: true, canManageAccess: true } });
    const from = new Date(Date.now() + 86400000).toISOString();
    const to = new Date(Date.now() + 3 * 86400000).toISOString();
    const availability = `/providers/vets/${org.id}/availability?locationId=${location.id}&serviceId=${service.id}&from=${from}&to=${to}`;
    const waitlist = { petId: pet.id, providerId: org.id, serviceId: service.id, windowStart: from, windowEnd: to };
    const quote = `/provider-services/${taxi.id}/transport-quote?pickupAddressId=${randomUUID()}&dropoffAddressId=${randomUUID()}`;
    const listed = async () => [
      JSON.stringify((await anon(`/providers/vets?search=${encodeURIComponent(name)}`).expect(200)).body).includes(org.id),
      JSON.stringify((await anon(`/providers/services?search=${encodeURIComponent(name)}`).expect(200)).body).includes(org.id),
      JSON.stringify((await anon(`/discovery/providers?q=${encodeURIComponent(name)}`).expect(200)).body).includes(org.id),
    ];

    // Before verification: not listed, not readable, no slots, no reviews, no waitlist, no favourite, no taxi quote.
    expect(await listed()).toEqual([false, false, false]);
    await anon(`/providers/vets/${org.id}`).expect(404);
    await anon(`/discovery/providers/${org.id}`).expect(404);
    await anon(`/provider-services/${service.id}`).expect(404);
    await anon(availability).expect(404);
    await anon(`/providers/${org.id}/reviews`).expect(404);
    await send("post", owner, "/waitlist").send(waitlist).expect(404);
    await send("put", owner, `/providers/${org.id}/favorite`).expect(404);
    await get(owner, quote).expect(404);

    // A favourite saved earlier (say, before a suspension) is not listed back while the clinic is not public.
    await db.providerFavorite.create({ data: { userId: owner.id, providerOrganizationId: org.id } });
    expect((await get(owner, "/me/favorite-providers").expect(200)).body).toEqual([]);

    // Staff verify both businesses: everything opens up.
    await db.providerOrganization.updateMany({ where: { id: { in: [org.id, taxiOrg.id] } }, data: { verificationStatus: "VERIFIED" } });
    expect(await listed()).toEqual([true, true, true]);
    await anon(`/providers/vets/${org.id}`).expect(200);
    await anon(availability).expect(200);
    expect((await anon(`/providers/${org.id}/reviews`).expect(200)).body).toMatchObject({ reviews: [] });
    await send("put", owner, `/providers/${org.id}/favorite`).expect(204);
    expect((await get(owner, "/me/favorite-providers").expect(200)).body.map((p: { id: string }) => p.id)).toEqual([org.id]);
    // Only someone who may book care for the pet can put it on a waitlist.
    const stranger = await actor("Stranger");
    await send("post", stranger, "/waitlist").send(waitlist).expect(403);
    await send("post", owner, "/waitlist").send(waitlist).expect(201);
    // Past the public gate the quote now checks the addresses (these are made up), so it is no longer a 404.
    expect((await get(owner, quote)).status).not.toBe(404);

    // Suspension hides the clinic again.
    await db.providerOrganization.update({ where: { id: org.id }, data: { verificationStatus: "SUSPENDED" } });
    await anon(availability).expect(404);
    await anon(`/providers/${org.id}/reviews`).expect(404);
    expect((await get(owner, "/me/favorite-providers").expect(200)).body).toEqual([]);
  });
});
