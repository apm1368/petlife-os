import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { LocationMode, PetAccessSource, ProviderServiceType, ProviderUserRole, ServiceCategory, type ProviderService } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { SlotGeneratorService } from "../src/modules/providers/slot-generator.service";

type Actor = { id: string; cookie: string; csrf: string };

/**
 * A booking (its details, intake answers, attachments, and the power to repeat it) belongs to the booker and the
 * household members the owner lets book care. A provider's own booking access, or a sitter's temporary grant,
 * never opens it. A series is re-checked against the provider and service as they are now.
 */
describe("Booking access and weekly series", () => {
  let app: INestApplication;
  let db: PrismaService;
  const server = () => app.getHttpServer();

  async function actor(name: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `bk-${randomUUID()}@example.com` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  const get = (a: Actor, url: string) => request(server()).get(url).set("Cookie", a.cookie);
  const post = (a: Actor, url: string) => request(server()).post(url).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  const FULL = { canViewIdentity: true, canViewHealth: true, canEditHealth: true, canBookCare: true, canViewCareProfile: true, canEditCareProfile: true, canManageAccess: true };

  async function household(owner: Actor) {
    const hh = await db.household.create({ data: { name: `hh ${randomUUID().slice(0, 6)}` } });
    await db.householdMember.create({ data: { householdId: hh.id, userId: owner.id, role: "OWNER" } });
    const pet = await db.pet.create({ data: { householdId: hh.id, name: "Biscuit", species: "DOG", approximateAgeMonths: 30 } });
    await db.petAccessGrant.create({ data: { petId: pet.id, userId: owner.id, source: PetAccessSource.HOUSEHOLD, ...FULL } });
    return { householdId: hh.id, petId: pet.id };
  }

  async function provider(opts: { service?: Partial<ProviderService> } = {}) {
    const org = await db.providerOrganization.create({ data: { name: `walkers ${randomUUID().slice(0, 6)}`, type: "WALKER", verificationStatus: "VERIFIED" } });
    const location = await db.providerLocation.create({ data: { providerOrganizationId: org.id, addressLine: "Test St", city: "Tehran", countryCode: "IR", timezone: "UTC" } });
    const staff = await actor("walker");
    const staffUser = await db.providerUser.create({ data: { userId: staff.id, providerOrganizationId: org.id, role: ProviderUserRole.OWNER } });
    const service = await db.providerService.create({
      data: { providerOrganizationId: org.id, locationId: location.id, name: "Dog walk", type: ProviderServiceType.DOG_WALK, category: ServiceCategory.WALKING, locationMode: LocationMode.AT_PROVIDER, durationMinutes: 30, priceAmount: 500_000, currency: "IRR", ...opts.service },
    });
    await db.providerAvailabilityRule.createMany({
      data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ providerOrganizationId: org.id, locationId: location.id, providerUserId: staffUser.id, dayOfWeek, startLocalTime: "00:00", endLocalTime: "23:30", timezone: "UTC" })),
    });
    return { org, location, service, staff, staffUserId: staffUser.id };
  }

  async function book(owner: Actor, petId: string, p: Awaited<ReturnType<typeof provider>>) {
    const from = new Date(Date.now() + 48 * 3600_000);
    const slots = await app.get(SlotGeneratorService).generate({ providerOrganizationId: p.org.id, locationId: p.location.id, serviceId: p.service.id, providerUserId: p.staffUserId, from, to: new Date(from.getTime() + 2 * 86400_000) });
    const s = slots.find((x) => x.state === "AVAILABLE")!;
    const hold = await post(owner, "/booking-holds").send({ petId, providerId: p.org.id, locationId: p.location.id, serviceId: p.service.id, providerUserId: p.staffUserId, slotStart: s.startAt.toISOString() }).expect(201);
    return (await post(owner, "/bookings").set("Idempotency-Key", randomUUID()).send({ holdId: hold.body.holdId, petId }).expect(201)).body as { id: string; bookingStatus: string };
  }

  async function member(householdId: string, petId: string, grant: { source: PetAccessSource; canBookCare: boolean; expiresAt?: Date }) {
    const a = await actor("member");
    await db.householdMember.create({ data: { householdId, userId: a.id, role: "FAMILY" } });
    await db.petAccessGrant.create({ data: { petId, userId: a.id, canViewIdentity: true, ...grant } });
    return a;
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
  });
  afterAll(async () => { await app?.close(); });

  it("only the booker and members who may book care for the pet can read a booking and its attachments", async () => {
    const owner = await actor("owner");
    const { householdId, petId } = await household(owner);
    const walkers = await provider();
    const booking = await book(owner, petId, walkers);

    const booker = owner;
    const bookingMember = await member(householdId, petId, { source: PetAccessSource.MANUAL, canBookCare: true });
    const viewOnlyMember = await member(householdId, petId, { source: PetAccessSource.MANUAL, canBookCare: false });
    const sitter = await member(householdId, petId, { source: PetAccessSource.TEMPORARY, canBookCare: true, expiresAt: new Date(Date.now() + 86400000) });
    // The walker holds an active booking grant on this pet (created with the booking).
    expect(await db.petAccessGrant.count({ where: { petId, userId: walkers.staff.id, revokedAt: null } })).toBeGreaterThan(0);

    for (const allowed of [booker, bookingMember]) {
      await get(allowed, `/bookings/${booking.id}`).expect(200);
      await get(allowed, `/bookings/${booking.id}/attachments`).expect(200);
    }
    for (const denied of [viewOnlyMember, sitter, walkers.staff]) {
      await get(denied, `/bookings/${booking.id}`).expect(403);
      await get(denied, `/bookings/${booking.id}/attachments`).expect(403);
      await post(denied, `/bookings/${booking.id}/recur`).send({ occurrences: 2 }).expect(403);
    }
  });

  it("a series follows the service's current booking mode: REQUEST occurrences wait for the provider", async () => {
    const owner = await actor("owner");
    const { petId } = await household(owner);
    const walkers = await provider();
    const origin = await book(owner, petId, walkers);
    expect(origin.bookingStatus).toBe("CONFIRMED");

    await db.providerService.update({ where: { id: walkers.service.id }, data: { bookingMode: "REQUEST" } });
    const series = await post(owner, `/bookings/${origin.id}/recur`).send({ occurrences: 3 }).expect(201);
    const occurrences = await db.booking.findMany({ where: { id: { in: series.body.createdBookingIds.filter((id: string) => id !== origin.id) } } });
    expect(occurrences.length).toBeGreaterThan(0);
    expect(occurrences.every((b) => b.bookingStatus === "REQUESTED" && b.bookingMode === "REQUEST")).toBe(true);
  });

  it("a series is refused once the service is retired or the provider loses verification", async () => {
    const owner = await actor("owner");
    const { petId } = await household(owner);

    const retired = await provider();
    const a = await book(owner, petId, retired);
    await db.providerService.update({ where: { id: retired.service.id }, data: { isActive: false } });
    expect((await post(owner, `/bookings/${a.id}/recur`).send({ occurrences: 2 }).expect(400)).body.error.code).toBe("SERVICE_NOT_AVAILABLE");

    const unverified = await provider();
    const b = await book(owner, petId, unverified);
    await db.providerOrganization.update({ where: { id: unverified.org.id }, data: { verificationStatus: "SUSPENDED" } });
    expect((await post(owner, `/bookings/${b.id}/recur`).send({ occurrences: 2 }).expect(400)).body.error.code).toBe("PROVIDER_NOT_VERIFIED");
  });
});
