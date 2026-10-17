import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { LocationMode, ProviderServiceType, ProviderUserRole, ServiceCategory, type ProviderService } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { SlotGeneratorService } from "../src/modules/providers/slot-generator.service";

type Actor = { id: string; cookie: string; csrf: string };

/** G13: eligibility + service area, waitlist offers with expiry, owner/provider no-show, booking completion chain #2. */
describe("Services and booking depth", () => {
  let app: INestApplication;
  let db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor, url: string) => request(server()).get(url).set("Cookie", a.cookie);
  const post = (a: Actor, url: string) => request(server()).post(url).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const patch = (a: Actor, url: string) => request(server()).patch(url).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(name: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `g13-${randomUUID()}@example.com` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  async function household(owner: Actor, species: "DOG" | "CAT" = "DOG") {
    const hh = await db.household.create({ data: { name: `G13 ${randomUUID().slice(0, 6)}` } });
    await db.householdMember.create({ data: { householdId: hh.id, userId: owner.id, role: "OWNER" } });
    const pet = await db.pet.create({ data: { householdId: hh.id, name: "G13 Pet", species, approximateAgeMonths: 30 } });
    await db.petAccessGrant.create({ data: { petId: pet.id, userId: owner.id, canViewIdentity: true, canViewHealth: true, canBookCare: true, canViewCareProfile: true, canEditCareProfile: true, canManageAccess: true } });
    return { householdId: hh.id, pet };
  }
  async function clinic(service: Partial<ProviderService> = {}) {
    const org = await db.providerOrganization.create({ data: { name: `G13 ${randomUUID().slice(0, 6)}`, type: "VET_CLINIC", verificationStatus: "VERIFIED" } });
    const location = await db.providerLocation.create({ data: { providerOrganizationId: org.id, addressLine: "x", city: "تهران", countryCode: "IR", timezone: "UTC" } });
    const owner = await actor("clinic-owner");
    const staff = await db.providerUser.create({ data: { userId: owner.id, providerOrganizationId: org.id, role: ProviderUserRole.OWNER } });
    const svc = await db.providerService.create({ data: { providerOrganizationId: org.id, locationId: location.id, name: "ویزیت", type: ProviderServiceType.GENERAL_VET_VISIT, category: ServiceCategory.VET, locationMode: LocationMode.AT_PROVIDER, durationMinutes: 30, priceAmount: 1_000_000, currency: "IRR", ...service } as never });
    await db.providerAvailabilityRule.createMany({ data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ providerOrganizationId: org.id, locationId: location.id, providerUserId: staff.id, dayOfWeek, startLocalTime: "00:00", endLocalTime: "23:30", timezone: "UTC" })) });
    return { org, location, svc, owner, staff };
  }
  async function freeSlot(c: Awaited<ReturnType<typeof clinic>>, hoursAhead = 48) {
    const from = new Date(Date.now() + hoursAhead * 3600_000);
    const slots = await app.get(SlotGeneratorService).generate({ providerOrganizationId: c.org.id, locationId: c.location.id, serviceId: c.svc.id, from, to: new Date(from.getTime() + 86400_000) });
    return slots.find((s) => s.state === "AVAILABLE")!;
  }

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    db = app.get(PrismaService);
  });
  afterAll(async () => app?.close());

  it("eligibility: species/age/weight reasons plus the at-home service area, enforced at booking", async () => {
    const c = await clinic({ locationMode: LocationMode.AT_CUSTOMER, supportsCat: false });
    await patch(c.owner, `/provider/services/${c.svc.id}`).send({ serviceAreaCities: ["تهران", " کرج "], travelSurchargeIrr: 150_000 }).expect(200);
    const owner = await actor("owner");
    const dog = await household(owner);
    const cat = await household(owner, "CAT");
    const inArea = await db.customerAddress.create({ data: { householdId: dog.householdId, addressLine: "ونک", city: "کرج", countryCode: "IR" } });
    const outArea = await db.customerAddress.create({ data: { householdId: dog.householdId, addressLine: "x", city: "شیراز", countryCode: "IR" } });

    const ok = (await get(owner, `/provider-services/${c.svc.id}/eligibility?petId=${dog.pet.id}&addressId=${inArea.id}`).expect(200)).body;
    expect(ok).toMatchObject({ eligible: true, location: { status: "SUPPORTED", city: "کرج" }, travelSurchargeIrr: 150_000, reasons: [] });
    const out = (await get(owner, `/provider-services/${c.svc.id}/eligibility?petId=${dog.pet.id}&addressId=${outArea.id}`).expect(200)).body;
    expect(out).toMatchObject({ eligible: false, location: { status: "NOT_SUPPORTED" }, reasons: ["LOCATION_NOT_SUPPORTED"] });
    expect((await get(owner, `/provider-services/${c.svc.id}/eligibility?petId=${dog.pet.id}`).expect(200)).body.location.status).toBe("ADDRESS_REQUIRED");
    const catRes = (await get(owner, `/provider-services/${c.svc.id}/eligibility?petId=${cat.pet.id}`).expect(200)).body;
    expect(catRes.eligible).toBe(false);
    expect(catRes.reasons).toContain("SPECIES_UNSUPPORTED");
    await get(await actor("stranger"), `/provider-services/${c.svc.id}/eligibility?petId=${dog.pet.id}`).expect(403);

    const s = await freeSlot(c);
    const hold = (await post(owner, "/booking-holds").send({ petId: dog.pet.id, providerId: c.org.id, locationId: c.location.id, serviceId: c.svc.id, slotStart: s.startAt.toISOString() }).expect(201)).body;
    const refused = await post(owner, "/bookings").set("Idempotency-Key", randomUUID()).send({ holdId: hold.holdId, petId: dog.pet.id, customerAddressId: outArea.id }).expect(400);
    expect(refused.body.error).toMatchObject({ code: "SERVICE_LOCATION_NOT_SUPPORTED", details: { reason: "LOCATION_NOT_SUPPORTED", city: "شیراز" } });
    await post(owner, "/bookings").set("Idempotency-Key", randomUUID()).send({ holdId: hold.holdId, petId: dog.pet.id, customerAddressId: inArea.id }).expect(201);
  });

  it("waitlist offer: a real available slot in the member's window, expiring; accept → normal hold; only the member", async () => {
    const c = await clinic();
    const owner = await actor("owner");
    const stranger = await actor("stranger");
    const { pet } = await household(owner);
    const windowStart = new Date(Date.now() + 24 * 3600_000), windowEnd = new Date(Date.now() + 5 * 86400_000);
    const entry = (await post(owner, "/waitlist").send({ petId: pet.id, providerId: c.org.id, serviceId: c.svc.id, windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString() }).expect(201)).body;
    const s = await freeSlot(c, 48);
    await post(c.owner, `/provider/waitlist/${entry.id}/offer`).send({ startAt: new Date(Date.now() + 10 * 86400_000).toISOString() }).expect(400);
    const offered = (await post(c.owner, `/provider/waitlist/${entry.id}/offer`).send({ startAt: s.startAt.toISOString(), expiresInMinutes: 60 }).expect(201)).body;
    expect(offered).toMatchObject({ status: "OFFERED", offer: { startAt: s.startAt.toISOString() } });
    await post(c.owner, `/provider/waitlist/${entry.id}/offer`).send({ startAt: s.startAt.toISOString() }).expect(400); // already offered
    expect(await db.notification.count({ where: { userId: owner.id, type: "waitlist.offer" } })).toBe(1);
    expect(await db.booking.count({ where: { providerOrganizationId: c.org.id } })).toBe(0); // nothing booked or held yet

    await post(stranger, `/waitlist/${entry.id}/accept-offer`).expect(404);
    const accepted = (await post(owner, `/waitlist/${entry.id}/accept-offer`).expect(201)).body;
    expect(accepted.hold.holdId).toBeTruthy();
    await post(owner, `/waitlist/${entry.id}/accept-offer`).expect((r) => expect(r.status).toBeGreaterThanOrEqual(400)); // slot now held

    // Expiry: a lapsed offer turns EXPIRED and cannot be accepted.
    const entry2 = (await post(owner, "/waitlist").send({ petId: pet.id, providerId: c.org.id, serviceId: c.svc.id, windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString() }).expect(201)).body;
    const s2 = await freeSlot(c, 72);
    await post(c.owner, `/provider/waitlist/${entry2.id}/offer`).send({ startAt: s2.startAt.toISOString() }).expect(201);
    await db.bookingWaitlistEntry.update({ where: { id: entry2.id }, data: { offerExpiresAt: new Date(Date.now() - 1000) } });
    expect((await post(owner, `/waitlist/${entry2.id}/accept-offer`).expect(400)).body.error.details.reason).toBe("OFFER_EXPIRED");
    expect((await get(owner, "/waitlist").expect(200)).body.find((e: { id: string }) => e.id === entry2.id).status).toBe("EXPIRED");

    // Decline puts the member back in the queue.
    const entry3 = (await post(owner, "/waitlist").send({ petId: pet.id, providerId: c.org.id, serviceId: c.svc.id, windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString() }).expect(201)).body;
    await post(c.owner, `/provider/waitlist/${entry3.id}/offer`).send({ startAt: s2.startAt.toISOString() }).expect(201);
    expect((await post(owner, `/waitlist/${entry3.id}/decline-offer`).expect(201)).body).toMatchObject({ status: "ACTIVE", offer: null });
  });

  it("no-show: provider marks the member (OWNER); the member reports the provider (PROVIDER) only after 30 min, no money moves", async () => {
    const c = await clinic();
    const owner = await actor("owner");
    const { pet, householdId } = await household(owner);
    const mk = async () => {
      const b = await db.booking.create({ data: { householdId, petId: pet.id, userId: owner.id, providerOrganizationId: c.org.id, providerLocationId: c.location.id, providerServiceId: c.svc.id, providerUserId: c.staff.id, category: "VET", locationMode: "AT_PROVIDER", startAt: new Date(Date.now() + 3600_000), endAt: new Date(Date.now() + 5400_000), timezone: "UTC", bookingStatus: "CONFIRMED" } });
      return b.id;
    };
    const early = await mk();
    expect((await post(owner, `/bookings/${early}/report-provider-no-show`).expect(400)).body.error.details.reason).toBe("TOO_EARLY_TO_REPORT");
    await db.booking.update({ where: { id: early }, data: { startAt: new Date(Date.now() - 40 * 60_000), endAt: new Date(Date.now() - 10 * 60_000) } });
    await post(await actor("stranger"), `/bookings/${early}/report-provider-no-show`).expect(403);
    const reported = (await post(owner, `/bookings/${early}/report-provider-no-show`).expect(201)).body;
    expect(reported).toMatchObject({ bookingStatus: "NO_SHOW", noShowParty: "PROVIDER" });
    expect(await db.notification.count({ where: { userId: c.owner.id, type: "provider.no_show_reported" } })).toBe(1);

    const missed = await mk();
    await db.booking.update({ where: { id: missed }, data: { startAt: new Date(Date.now() - 60_000), endAt: new Date(Date.now() + 1800_000) } });
    await post(c.owner, `/provider/bookings/${missed}/no-show`).expect(201);
    expect((await get(owner, `/bookings/${missed}`).expect(200)).body).toMatchObject({ bookingStatus: "NO_SHOW", noShowParty: "OWNER" });
  });

  it("chain #2: check-in → start → complete → owner summary (internal notes never leak) → care suggestion → verified review → activity", async () => {
    const c = await clinic();
    const owner = await actor("owner");
    const { pet, householdId } = await household(owner);
    const b = await db.booking.create({ data: { householdId, petId: pet.id, userId: owner.id, providerOrganizationId: c.org.id, providerLocationId: c.location.id, providerServiceId: c.svc.id, providerUserId: c.staff.id, category: "VET", locationMode: "AT_PROVIDER", startAt: new Date(Date.now() - 600_000), endAt: new Date(Date.now() + 1200_000), timezone: "UTC", bookingStatus: "CONFIRMED" } });
    await post(owner, `/bookings/${b.id}/review`).send({ rating: 5 }).expect(400); // not completed yet
    await post(c.owner, `/provider/bookings/${b.id}/notes`).send({ content: "INTERNAL: client was late twice" }).expect(201);
    await post(c.owner, `/provider/bookings/${b.id}/check-in`).expect(201);
    await post(c.owner, `/provider/bookings/${b.id}/start`).expect(201);
    await post(c.owner, `/provider/bookings/${b.id}/complete`).send({ completionNote: "Ears cleaned, all good", aftercareInstructions: "Keep ears dry for 3 days" }).expect(201);
    const mine = (await get(owner, `/bookings/${b.id}`).expect(200)).body;
    expect(mine).toMatchObject({ bookingStatus: "COMPLETED", completionNote: "Ears cleaned, all good", aftercareInstructions: "Keep ears dry for 3 days" });
    expect(JSON.stringify(mine)).not.toContain("INTERNAL: client was late twice");

    await post(c.owner, `/provider/bookings/${b.id}/care-suggestions`).send({ items: [{ title: "Ear check", type: "FOLLOW_UP", suggestedDueAt: new Date(Date.now() + 14 * 86400_000).toISOString() }] }).expect(201);
    expect((await get(owner, `/pets/${pet.id}/care-suggestions?status=PENDING`).expect(200)).body[0]).toMatchObject({ title: "Ear check", source: { kind: "BOOKING", id: b.id } });
    await post(owner, `/bookings/${b.id}/review`).send({ rating: 5, quality: 5 }).expect(201);
    expect(await db.notification.count({ where: { userId: owner.id, type: "booking.review_invite" } })).toBe(1);
    const kinds = (await get(owner, `/households/${householdId}/activity`).expect(200)).body.items.map((i: { kind: string }) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(["BOOKING_COMPLETED", "CARE_SUGGESTED"]));
  });
});
