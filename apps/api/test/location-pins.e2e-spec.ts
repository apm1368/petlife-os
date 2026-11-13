import { Logger } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { ProviderType, ProviderUserRole, SellerMembershipRole, SellerMembershipStatus, SellerStatus, SellerVerificationStatus } from "@prisma/client";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";

interface Cookies { session?: string; csrf?: string }

function otp(logSpy: jest.SpyInstance, identifier: string): string {
  const call = logSpy.mock.calls.find((args) => typeof args[0] === "string" && args[0].includes("[DEV OTP]") && args[0].includes(identifier));
  const match = call && /code=(\d+)/.exec(call[0] as string);
  if (!match) throw new Error("Expected DEV OTP log entry");
  return match[1]!;
}

/**
 * Location pins (2026-11-13): saved pins are validated to Iran and stored only with consent; a member's exact pin
 * never leaves their own household (public, provider and other-member responses stay clean); "near me" distances are
 * computed server-side and shown in whole kilometres; home-based providers are public only at a ~1 km point unless
 * they opt in.
 */
describe("Location pins (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let server: ReturnType<INestApplication["getHttpServer"]>;
  let logSpy: jest.SpyInstance;
  const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // A member's home in Birjand: far from every other suite's Tehran/Rasht fixtures, with digits no fixture uses.
  const HOME = { latitude: 32.871234, longitude: 59.218765 };
  const leaks = (body: unknown) => {
    const text = JSON.stringify(body);
    return ["32.871234", "59.218765", "32.87123", "59.21877"].filter((needle) => text.includes(needle));
  };

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });
  afterEach(() => logSpy.mockRestore());

  async function session(identifier: string): Promise<Cookies> {
    const primed = await request(server).get("/health/live");
    const csrf = extractCookie(primed.headers["set-cookie"], "petlife_csrf")!;
    await request(server).post("/auth/request-otp").set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf).send({ identifier }).expect(200);
    const verified = await request(server).post("/auth/verify-otp").set("Cookie", `petlife_csrf=${csrf}`).set("x-csrf-token", csrf).send({ identifier, code: otp(logSpy, identifier) }).expect(200);
    return { session: extractCookie(verified.headers["set-cookie"], "petlife_session"), csrf };
  }
  function client(cookies: Cookies) {
    const cookie = `petlife_session=${cookies.session}; petlife_csrf=${cookies.csrf}`;
    return {
      get: (path: string) => request(server).get(path).set("Cookie", cookie),
      post: (path: string) => request(server).post(path).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
      put: (path: string) => request(server).put(path).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
      patch: (path: string) => request(server).patch(path).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
      delete: (path: string) => request(server).delete(path).set("Cookie", cookie).set("x-csrf-token", cookies.csrf!),
    };
  }
  async function signedIn(prefix: string) {
    const email = `${prefix}-${unique()}@example.com`;
    const c = client(await session(email));
    return { c, user: await prisma.user.findUniqueOrThrow({ where: { email } }) };
  }
  async function memberWithHome() {
    const member = await signedIn("pin-member");
    const household = (await member.c.post("/households").send({}).expect(201)).body as { id: string };
    const address = (await member.c.post("/addresses").send({ householdId: household.id, addressLine: "خیابان مدرس", city: "بیرجند", countryCode: "IR", ...HOME, locationConsent: true }).expect(201)).body as { id: string; isDefault: boolean };
    return { ...member, householdId: household.id, addressId: address.id };
  }
  /** A verified provider with one pinned location and an active service; `token` makes its name searchable. */
  async function provider(token: string, type: ProviderType, offset: { lat: number; lng: number }, category: "VET" | "SITTING" = "VET") {
    const org = await prisma.providerOrganization.create({ data: { name: `${token} ${type} ${unique()}`, type, verificationStatus: "VERIFIED" } });
    const location = await prisma.providerLocation.create({ data: { providerOrganizationId: org.id, addressLine: "Street 1", city: "بیرجند", countryCode: "IR", timezone: "Asia/Tehran", latitude: HOME.latitude + offset.lat, longitude: HOME.longitude + offset.lng } });
    const service = await prisma.providerService.create({ data: { providerOrganizationId: org.id, locationId: location.id, name: "Visit", type: category === "VET" ? "GENERAL_VET_VISIT" : "PET_SITTING", category, durationMinutes: 30, isActive: true, priceAmount: 1_000_000, currency: "IRR" } });
    return { org, location, service };
  }

  it("validates saved pins: inside Iran, both coordinates, and only with consent", async () => {
    const member = await signedIn("pin-validate");
    const household = (await member.c.post("/households").send({}).expect(201)).body as { id: string };
    const base = { householdId: household.id, addressLine: "خیابان امام", city: "مشهد", countryCode: "IR" };
    // Paris, the Persian Gulf south of the box, and Baghdad are all refused.
    await member.c.post("/addresses").send({ ...base, latitude: 48.8566, longitude: 2.3522, locationConsent: true }).expect(400);
    await member.c.post("/addresses").send({ ...base, latitude: 24.5, longitude: 54.4, locationConsent: true }).expect(400);
    await member.c.post("/addresses").send({ ...base, latitude: 33.3152, longitude: 43.0, locationConsent: true }).expect(400);
    const half = await member.c.post("/addresses").send({ ...base, latitude: 36.3 }).expect(400);
    expect(half.body.error.details.reason).toBe("PIN_NEEDS_BOTH_COORDINATES");
    const noConsent = await member.c.post("/addresses").send({ ...base, latitude: 36.3, longitude: 59.6 }).expect(400);
    expect(noConsent.body.error.details.reason).toBe("LOCATION_CONSENT_REQUIRED");

    const saved = (await member.c.post("/addresses").send({ ...base, latitude: 36.3, longitude: 59.6, locationConsent: true }).expect(201)).body;
    expect(saved).toMatchObject({ latitude: 36.3, longitude: 59.6 });
    expect(typeof saved.locationConsentAt).toBe("string");
    await member.c.patch(`/addresses/${saved.id}`).send({ latitude: 41.0, longitude: 59.6, locationConsent: true }).expect(400);
    // Clearing the pin clears its consent too; an address without a pin keeps working.
    const cleared = (await member.c.patch(`/addresses/${saved.id}`).send({ latitude: null, longitude: null }).expect(200)).body;
    expect(cleared).toMatchObject({ latitude: null, longitude: null, locationConsentAt: null, addressLine: "خیابان امام" });
    const pinless = (await member.c.post("/addresses").send(base).expect(201)).body;
    expect(pinless).toMatchObject({ latitude: null, longitude: null });

    // The seller's pickup pin follows the same rules.
    const seller = await prisma.sellerOrganization.create({ data: { name: `Pin seller ${unique()}`, city: "مشهد", verificationStatus: SellerVerificationStatus.VERIFIED, status: SellerStatus.ACTIVE, countryCode: "IR" } });
    await prisma.sellerMembership.create({ data: { sellerOrganizationId: seller.id, userId: member.user.id, role: SellerMembershipRole.OWNER, status: SellerMembershipStatus.ACTIVE, acceptedAt: new Date() } });
    const pickup = { offeredProviders: [], addressLine: "بازار رضا", city: "مشهد" };
    await member.c.put(`/seller-organizations/${seller.id}/shipping-profile`).send({ ...pickup, latitude: 40.5, longitude: 59.6, locationConsent: true }).expect(400);
    await member.c.put(`/seller-organizations/${seller.id}/shipping-profile`).send({ ...pickup, latitude: 36.29, longitude: 59.61 }).expect(400);
    const profile = (await member.c.put(`/seller-organizations/${seller.id}/shipping-profile`).send({ ...pickup, latitude: 36.29, longitude: 59.61, locationConsent: true }).expect(200)).body;
    expect(profile.pickup).toMatchObject({ latitude: 36.29, longitude: 59.61 });
    expect(typeof profile.pickup.pinConsentAt).toBe("string");
  });

  it("keeps a member's address theirs: another account gets 404 to read, edit or remove it", async () => {
    const owner = await memberWithHome();
    const stranger = await signedIn("pin-stranger");
    const mine = await owner.c.get(`/addresses/${owner.addressId}`).expect(200);
    expect(mine.body).toMatchObject({ id: owner.addressId, ...HOME });
    await stranger.c.get(`/addresses/${owner.addressId}`).expect(404);
    await stranger.c.patch(`/addresses/${owner.addressId}`).send({ label: "mine now" }).expect(404);
    await stranger.c.patch(`/addresses/${owner.addressId}`).send({ latitude: 35.7, longitude: 51.4, locationConsent: true }).expect(404);
    await stranger.c.delete(`/addresses/${owner.addressId}`).expect(404);
    await request(server).get(`/addresses/${owner.addressId}`).expect(401);
    expect((await stranger.c.get(`/addresses?householdId=${owner.householdId}`)).status).toBe(403);
    // Nothing changed.
    expect(await prisma.customerAddress.findUniqueOrThrow({ where: { id: owner.addressId } })).toMatchObject({ ...HOME, label: null, archivedAt: null });
  });

  it("sorts providers and places by distance from the member's home pin, in whole kilometres, without echoing the pin", async () => {
    const member = await memberWithHome();
    const token = `Pinvet${unique().replace(/[^a-z0-9]/gi, "")}`;
    // Tiny longitude offsets keep every fixture's digits distinct from the member's pin.
    const far = await provider(token, ProviderType.VET_CLINIC, { lat: 0.1, lng: 0.0001 }); // ~11.1 km
    const near = await provider(token, ProviderType.VET_CLINIC, { lat: 0.003, lng: 0.0001 }); // ~0.3 km
    const mid = await provider(token, ProviderType.VET_HOSPITAL, { lat: 0.03, lng: 0.0001 }); // ~3.3 km

    const nearest = await member.c.get(`/discovery/providers?q=${token}&near=home&sort=NEAREST`).expect(200);
    expect(nearest.body.origin).toBe("HOME");
    expect(nearest.body.items.map((p: { id: string }) => p.id)).toEqual([near.org.id, mid.org.id, far.org.id]);
    expect(nearest.body.items.map((p: { distanceKm: number }) => p.distanceKm)).toEqual([0, 3, 11]);
    expect(leaks(nearest.body)).toEqual([]);
    const within5 = await member.c.get(`/discovery/providers?q=${token}&near=home&radiusKm=5`).expect(200);
    expect(within5.body.items.map((p: { id: string }) => p.id).sort()).toEqual([near.org.id, mid.org.id].sort());

    // Without a session (or without a pinned address) near=home just has no origin; nothing is invented.
    const anon = await request(server).get(`/discovery/providers?q=${token}&near=home`).expect(200);
    expect(anon.body.origin).toBeNull();
    expect(anon.body.items.every((p: { distanceKm: number | null }) => p.distanceKm === null)).toBe(true);
    const pinless = await signedIn("pin-pinless");
    expect((await pinless.c.get(`/discovery/providers?q=${token}&near=home`).expect(200)).body.origin).toBeNull();
    const point = await request(server).get(`/discovery/providers?q=${token}&lat=32.87&lng=59.22&sort=NEAREST`).expect(200);
    expect(point.body.origin).toBe("POINT");
    expect(point.body.items[0].id).toBe(near.org.id);

    // Places: PostGIS distance, whole kilometres only.
    const placeIds: string[] = [];
    for (const [name, dLat] of [["Far park", 0.1], ["Near park", 0.003], ["Mid park", 0.03]] as const) {
      const place = await prisma.petFriendlyPlace.create({ data: { name: `${name} ${unique()}`, category: "PARK", country: "IR", city: "بیرجند", latitude: HOME.latitude + dLat, longitude: HOME.longitude + 0.0001, status: "VERIFIED", isPubliclyListed: true } });
      await prisma.$executeRaw`UPDATE pet_friendly_places SET location = ST_SetSRID(ST_MakePoint(${place.longitude}, ${place.latitude}), 4326)::geography WHERE id = ${place.id}::uuid`;
      placeIds.push(place.id);
    }
    const places = await member.c.get(`/places/nearby?near=home&radiusMeters=20000&pageSize=50`).expect(200);
    const ours = places.body.items.filter((p: { id: string }) => placeIds.includes(p.id));
    expect(ours.map((p: { id: string }) => p.id)).toEqual([placeIds[1], placeIds[2], placeIds[0]]);
    expect(ours.map((p: { distanceMeters: number }) => p.distanceMeters)).toEqual([0, 3000, 11000]);
    expect(leaks(places.body)).toEqual([]);
    expect((await request(server).get(`/places/nearby?near=home`).expect(400)).body.error.details.reason).toBe("HOME_PIN_MISSING");
    expect((await pinless.c.get(`/places/nearby?near=home`).expect(400)).body.error.details.reason).toBe("HOME_PIN_MISSING");
  });

  it("never shows a member's pin to a provider, another member or the public", async () => {
    const member = await memberWithHome();
    const other = await signedIn("pin-other");
    const { org, location, service } = await provider(`Pinsitter${unique().replace(/[^a-z0-9]/gi, "")}`, ProviderType.SITTER, { lat: 0.02, lng: 0.02 }, "SITTING");
    const staff = await signedIn("pin-provider");
    await prisma.providerUser.create({ data: { userId: staff.user.id, providerOrganizationId: org.id, role: ProviderUserRole.OWNER } });
    const pet = await prisma.pet.create({ data: { householdId: member.householdId, name: "Pishi", species: "CAT" } });
    const startAt = new Date(Date.now() + 3 * 86400_000);
    const booking = await prisma.booking.create({
      data: { householdId: member.householdId, petId: pet.id, userId: member.user.id, providerOrganizationId: org.id, providerLocationId: location.id, providerServiceId: service.id, category: "SITTING", locationMode: "AT_CUSTOMER", customerAddressId: member.addressId, startAt, endAt: new Date(startAt.getTime() + 3600_000), timezone: "Asia/Tehran" },
    });

    // The member sees their own pin on their booking.
    const own = await member.c.get(`/bookings/${booking.id}`).expect(200);
    expect(own.body.customerAddress).toMatchObject(HOME);

    // The provider's booking list and detail carry no member coordinates.
    const providerList = await staff.c.get("/provider/bookings").expect(200);
    expect(JSON.stringify(providerList.body)).toContain(booking.id);
    expect(leaks(providerList.body)).toEqual([]);
    expect(leaks((await staff.c.get(`/provider/bookings/${booking.id}`).expect(200)).body)).toEqual([]);

    // Another member and the public: nothing anywhere they can reach.
    for (const res of [
      await other.c.get(`/addresses/${member.addressId}`),
      await other.c.get(`/bookings/${booking.id}`),
      await other.c.get(`/discovery/providers?near=home&sort=NEAREST`),
      await request(server).get(`/discovery/providers/${org.id}`),
      await request(server).get(`/discovery/providers?category=SITTING&lat=32.9&lng=59.2&sort=NEAREST`),
      await request(server).get(`/provider-services/${service.id}`),
    ]) {
      expect(res.status).toBeLessThan(500);
      expect(leaks(res.body)).toEqual([]);
    }
    expect((await other.c.get(`/addresses/${member.addressId}`)).status).toBe(404);
  });

  it("shows home-based providers at a ~1 km point until they opt in; clinics at their exact pin", async () => {
    const token = `Pinhome${unique().replace(/[^a-z0-9]/gi, "")}`;
    const sitter = await provider(token, ProviderType.SITTER, { lat: 0.004321, lng: 0.006789 }, "SITTING");
    const clinic = await provider(token, ProviderType.VET_CLINIC, { lat: 0.012345, lng: 0.023456 });
    const exactSitter = { latitude: HOME.latitude + 0.004321, longitude: HOME.longitude + 0.006789 };
    const exactClinic = { latitude: HOME.latitude + 0.012345, longitude: HOME.longitude + 0.023456 };

    const sitterProfile = (await request(server).get(`/discovery/providers/${sitter.org.id}`).expect(200)).body;
    expect(sitterProfile.locations[0]).toMatchObject({ latitude: Math.round(exactSitter.latitude * 100) / 100, longitude: Math.round(exactSitter.longitude * 100) / 100, pinPrecision: "APPROXIMATE" });
    expect(sitterProfile.locations[0].pinPublicExact).toBeUndefined();
    const sitterService = (await request(server).get(`/provider-services/${sitter.service.id}`).expect(200)).body;
    expect(JSON.stringify(sitterService)).not.toContain(String(exactSitter.latitude).slice(0, 7));
    const clinicProfile = (await request(server).get(`/discovery/providers/${clinic.org.id}`).expect(200)).body;
    expect(clinicProfile.locations[0]).toMatchObject({ ...exactClinic, pinPrecision: "EXACT" });

    // The sitter's owner opts in to the exact spot (same pin rules: inside Iran, with consent).
    const owner = await signedIn("pin-sitter-owner");
    await prisma.providerUser.create({ data: { userId: owner.user.id, providerOrganizationId: sitter.org.id, role: ProviderUserRole.OWNER } });
    await owner.c.put(`/provider/clinic/branches/${sitter.location.id}/pin`).send({ latitude: 45.1, longitude: 59.2, locationConsent: true }).expect(400);
    await owner.c.put(`/provider/clinic/branches/${clinic.location.id}/pin`).send({ exactPinPublic: true }).expect(404);
    const branches = (await owner.c.put(`/provider/clinic/branches/${sitter.location.id}/pin`).send({ exactPinPublic: true }).expect(200)).body;
    expect(branches.items[0]).toMatchObject({ ...exactSitter, pinPublicExact: true });
    const optedIn = (await request(server).get(`/discovery/providers/${sitter.org.id}`).expect(200)).body;
    expect(optedIn.locations[0]).toMatchObject({ ...exactSitter, pinPrecision: "EXACT" });
  });
});
