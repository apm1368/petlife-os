import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { LocationMode, ProviderServiceType, ProviderUserRole, ServiceCategory } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { SlotGeneratorService } from "../src/modules/providers/slot-generator.service";

type Actor = { id: string; cookie: string; csrf: string };

/**
 * Pet taxi as a ride: quote between two saved addresses, an immutable route snapshot on the booking,
 * and a server-computed fare only when the provider activated distance pricing and a distance exists.
 * Runs with the QA-only straight-line distance so the priced path is exercised; coordinates missing →
 * UNAVAILABLE, exactly as production behaves without a map provider.
 */
describe("Pet taxi — route snapshot and distance pricing", () => {
  let app: INestApplication, db: PrismaService, slots: SlotGeneratorService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, u: string) => request(server()).get(u).set("Cookie", a.cookie);
  const post = (a: Actor, u: string) => request(server()).post(u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(name: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `taxi-${randomUUID()}@example.com` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }

  async function rider(owner: Actor) {
    const hh = await db.household.create({ data: { name: `خانواده ${randomUUID().slice(0, 6)}`, members: { create: { userId: owner.id, role: "OWNER" } } } });
    const pet = await db.pet.create({ data: { householdId: hh.id, name: "پاپی", species: "DOG", approximateAgeMonths: 30 } });
    await db.petAccessGrant.create({ data: { petId: pet.id, userId: owner.id, canViewIdentity: true, canBookCare: true, canViewCareProfile: true, canManageAccess: true } });
    const pickup = await db.customerAddress.create({ data: { householdId: hh.id, label: "خانه", addressLine: "تجریش، خیابان دربند", city: "تهران", countryCode: "IR", latitude: 35.8048, longitude: 51.4344 } });
    const dropoff = await db.customerAddress.create({ data: { householdId: hh.id, label: "کلینیک", addressLine: "میدان آزادی", city: "تهران", countryCode: "IR", latitude: 35.6997, longitude: 51.338 } });
    const noCoords = await db.customerAddress.create({ data: { householdId: hh.id, label: "بدون مختصات", addressLine: "ونک", city: "تهران", countryCode: "IR" } });
    return { householdId: hh.id, petId: pet.id, pickup, dropoff, noCoords };
  }

  async function taxi(pricing?: { baseFareIrr: number; perKmRateIrr: number; serviceAdjustmentIrr?: number; isActive: boolean }) {
    const org = await db.providerOrganization.create({ data: { name: `تاکسی ${randomUUID().slice(0, 6)}`, type: "PET_TAXI", verificationStatus: "VERIFIED" } });
    const location = await db.providerLocation.create({ data: { providerOrganizationId: org.id, addressLine: "پایگاه", city: "تهران", countryCode: "IR", timezone: "UTC" } });
    const driver = await actor("driver");
    const pu = await db.providerUser.create({ data: { userId: driver.id, providerOrganizationId: org.id, role: ProviderUserRole.OWNER } });
    const service = await db.providerService.create({ data: {
      providerOrganizationId: org.id, locationId: location.id, name: "تاکسی پت", type: ProviderServiceType.PET_TAXI_RIDE, category: ServiceCategory.PET_TAXI,
      locationMode: LocationMode.TRANSPORT, durationMinutes: 60, priceAmount: 2_000_000, currency: "IRR",
    } });
    if (pricing) await db.serviceTransportPricing.create({ data: { providerServiceId: service.id, ...pricing } });
    await db.providerAvailabilityRule.createMany({ data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ providerOrganizationId: org.id, locationId: location.id, providerUserId: pu.id, dayOfWeek, startLocalTime: "00:00", endLocalTime: "23:30", timezone: "UTC" })) });
    return { org, location, service };
  }

  async function book(owner: Actor, r: Awaited<ReturnType<typeof rider>>, t: Awaited<ReturnType<typeof taxi>>, dropoffId = r.dropoff.id) {
    const from = new Date(Date.now() + 48 * 3600_000);
    const s = (await slots.generate({ providerOrganizationId: t.org.id, locationId: t.location.id, serviceId: t.service.id, from, to: new Date(from.getTime() + 2 * 86400_000) })).find((x) => x.state === "AVAILABLE")!;
    const hold = await post(owner, "/booking-holds").send({ petId: r.petId, providerId: t.org.id, locationId: t.location.id, serviceId: t.service.id, slotStart: s.startAt.toISOString() }).expect(201);
    return (await post(owner, "/bookings").set("Idempotency-Key", randomUUID()).send({ holdId: hold.body.holdId, petId: r.petId, customerAddressId: r.pickup.id, dropoffAddressId: dropoffId }).expect(201)).body;
  }

  beforeAll(async () => {
    // jest-env-setup sets TRANSPORT_DISTANCE_MODE=straight_line_demo for the e2e run; the production
    // default (unavailable) is covered by transport-route.service.spec.ts.
    app = await createTestApp();
    db = app.get(PrismaService);
    slots = app.get(SlotGeneratorService);
  });
  afterAll(async () => { await app?.close(); });

  it("with active distance pricing, the quote and the booking carry the server's fare; the route is a snapshot", async () => {
    const owner = await actor("owner");
    const r = await rider(owner);
    const t = await taxi({ baseFareIrr: 500_000, perKmRateIrr: 120_000, serviceAdjustmentIrr: 0, isActive: true });
    const quote = (await get(owner, `/provider-services/${t.service.id}/transport-quote?pickupAddressId=${r.pickup.id}&dropoffAddressId=${r.dropoff.id}`).expect(200)).body;
    expect(quote.mapProvider).toBe("BLOCKED_EXTERNAL");
    expect(quote.distanceSource).toBe("STRAIGHT_LINE_DEMO");
    expect(quote.distancePricingApplied).toBe(true);
    const expected = 500_000 + Math.ceil((120_000 * quote.distanceMeters) / 1000);
    expect(quote.estimatedFareIrr).toBe(expected);

    const booking = await book(owner, r, t);
    expect(Number(booking.priceAmount)).toBe(expected);
    expect(booking.transportRoute).toMatchObject({ distanceSource: "STRAIGHT_LINE_DEMO", distancePricingApplied: true, estimatedFareIrr: expected });
    expect(booking.transportRoute.pickupAddressText).toContain("دربند");

    // Editing the saved address later never moves the booked ride.
    await db.customerAddress.update({ where: { id: r.pickup.id }, data: { addressLine: "نشانی تازه" } });
    const reread = (await get(owner, `/bookings/${booking.id}`).expect(200)).body;
    expect(reread.transportRoute.pickupAddressText).toContain("دربند");
  });

  it("inactive pricing — or no coordinates — keeps the fixed price and says the distance is unavailable", async () => {
    const owner = await actor("owner2");
    const r = await rider(owner);
    const inactive = await taxi({ baseFareIrr: 500_000, perKmRateIrr: 120_000, isActive: false });
    const q1 = (await get(owner, `/provider-services/${inactive.service.id}/transport-quote?pickupAddressId=${r.pickup.id}&dropoffAddressId=${r.dropoff.id}`).expect(200)).body;
    expect([q1.distancePricingApplied, q1.estimatedFareIrr]).toEqual([false, 2_000_000]);
    const priced = await taxi({ baseFareIrr: 500_000, perKmRateIrr: 120_000, isActive: true });
    const q2 = (await get(owner, `/provider-services/${priced.service.id}/transport-quote?pickupAddressId=${r.pickup.id}&dropoffAddressId=${r.noCoords.id}`).expect(200)).body;
    expect([q2.distanceSource, q2.distanceMeters, q2.distancePricingApplied, q2.estimatedFareIrr]).toEqual(["UNAVAILABLE", null, false, 2_000_000]);
    const booking = await book(owner, r, priced, r.noCoords.id);
    expect(Number(booking.priceAmount)).toBe(2_000_000);
    expect(booking.transportRoute).toMatchObject({ distanceSource: "UNAVAILABLE", distancePricingApplied: false });
  });

  it("a quote or booking can only use the member's own addresses, and only for a transport service", async () => {
    const owner = await actor("owner3");
    const stranger = await actor("stranger");
    const r = await rider(owner);
    await rider(stranger);
    const t = await taxi({ baseFareIrr: 1, perKmRateIrr: 1, isActive: true });
    await get(stranger, `/provider-services/${t.service.id}/transport-quote?pickupAddressId=${r.pickup.id}&dropoffAddressId=${r.dropoff.id}`).expect(400);
    await get(owner, `/provider-services/${t.service.id}/transport-quote?pickupAddressId=not-a-uuid&dropoffAddressId=${r.dropoff.id}`).expect(400);
    await request(server()).get(`/provider-services/${t.service.id}/transport-quote?pickupAddressId=${r.pickup.id}&dropoffAddressId=${r.dropoff.id}`).expect(401);
    const vet = await db.providerService.create({ data: { providerOrganizationId: t.org.id, locationId: t.location.id, name: "ویزیت", type: ProviderServiceType.GENERAL_VET_VISIT, category: ServiceCategory.VET, locationMode: LocationMode.AT_PROVIDER, durationMinutes: 30, priceAmount: 1, currency: "IRR" } });
    await get(owner, `/provider-services/${vet.id}/transport-quote?pickupAddressId=${r.pickup.id}&dropoffAddressId=${r.dropoff.id}`).expect(400);
  });
});
