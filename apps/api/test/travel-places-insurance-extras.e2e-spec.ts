import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole, LocationMode, ProviderServiceType, ServiceCategory } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { id: string; cookie: string; csrf: string };

/** Places attributes and member suggestions, trip checklist and participants, insurance claim-prep vault. */
describe("Travel, places and insurance — functional depth", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor | null, u: string) => (a ? request(server()).get(u).set("Cookie", a.cookie) : request(server()).get(u));
  const send = (m: "post" | "patch" | "delete", a: Actor, u: string) => request(server())[m](u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(name: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `g6-${randomUUID()}@example.com` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  const FULL = { canViewIdentity: true, canEditIdentity: true, canViewHealth: true, canEditHealth: true, canBookCare: true, canViewCareProfile: true, canEditCareProfile: true, canManageAccess: true };
  async function household() {
    const owner = await actor("owner");
    const hh = await db.household.create({ data: { name: "hh", members: { create: { userId: owner.id, role: "OWNER" } } } });
    const pet = await db.pet.create({ data: { householdId: hh.id, name: "Primary", species: "DOG", approximateAgeMonths: 30 } });
    const second = await db.pet.create({ data: { householdId: hh.id, name: "Second", species: "CAT", approximateAgeMonths: 20 } });
    for (const p of [pet, second]) await db.petAccessGrant.create({ data: { petId: p.id, userId: owner.id, ...FULL } });
    return { owner, householdId: hh.id, petId: pet.id, secondPetId: second.id };
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("places: structured attributes and filters; suggestions stay private until an admin approves them", async () => {
    const place = await db.petFriendlyPlace.create({ data: { name: `Park ${randomUUID().slice(0, 6)}`, category: "PARK", country: "IR", city: `G6City-${randomUUID().slice(0, 4)}`, latitude: 35.7, longitude: 51.4, status: "VERIFIED", isPubliclyListed: true, fencedArea: true, smallDogArea: true, entryFeeIrr: 0, shadeAvailable: true, petFriendlyLevel: "FULL" } });
    await db.petFriendlyPlace.create({ data: { name: "Paid park", category: "PARK", country: "IR", city: place.city, latitude: 35.7, longitude: 51.4, status: "VERIFIED", isPubliclyListed: true, entryFeeIrr: 50_000 } });
    const read = (await get(null, `/places/${place.id}`).expect(200)).body;
    expect(read).toMatchObject({ fencedArea: true, smallDogArea: true, entryFeeIrr: 0, shadeAvailable: true, petFriendlyLevel: "FULL", wasteBins: null });
    const free = (await get(null, `/places?city=${encodeURIComponent(place.city)}&free=true&fencedArea=true`).expect(200)).body;
    expect(free.items.map((p: { id: string }) => p.id)).toEqual([place.id]);

    const member = await actor("suggester");
    const s = (await send("post", member, "/place-suggestions").send({ name: "Dog beach", category: "PARK", city: "Rasht", latitude: 37.3, longitude: 49.6, notes: "Fenced, shaded" }).expect(201)).body;
    expect(s.status).toBe("PENDING");
    await send("post", member, "/place-suggestions").send({ name: "x", category: "PARK", city: "Rasht", latitude: 37.3 }).expect(400);
    expect((await get(member, "/place-suggestions/mine").expect(200)).body.map((x: { id: string }) => x.id)).toEqual([s.id]);
    await send("post", member, `/admin/place-suggestions/${s.id}/approve`).send({}).expect(403);
    const adminUser = await actor("admin");
    await db.adminUser.create({ data: { userId: adminUser.id, role: AdminRole.SUPER_ADMIN, status: AdminMembershipStatus.ACTIVE } });
    expect((await get(adminUser, "/admin/place-suggestions").expect(200)).body.some((x: { id: string }) => x.id === s.id)).toBe(true);
    const approved = (await send("post", adminUser, `/admin/place-suggestions/${s.id}/approve`).send({ note: "Looks right" }).expect(201)).body;
    expect(approved.status).toBe("APPROVED");
    const created = await db.petFriendlyPlace.findUniqueOrThrow({ where: { id: approved.createdPlaceId } });
    // Approval never publishes: the place is unverified and unlisted until an admin completes it.
    expect(created).toMatchObject({ status: "UNVERIFIED", isPubliclyListed: false, name: "Dog beach" });
    await get(null, `/places/${created.id}`).expect(404);
    await send("post", adminUser, `/admin/place-suggestions/${s.id}/reject`).send({}).expect(404);
    expect(await db.adminAuditLog.count({ where: { action: "place_suggestion.approved", entityId: s.id } })).toBe(1);
  });

  it("trip checklist and participants: household-only, editable, defaults once", async () => {
    const h = await household();
    const trip = (await send("post", h.owner, `/pets/${h.petId}/trips`).send({ originCountry: "IR", destinationCountry: "TR", departAt: new Date(Date.now() + 20 * 86400e3).toISOString() }).expect(201)).body;
    const base = `/pets/${h.petId}/trips/${trip.id}`;
    const d1 = (await send("post", h.owner, `${base}/checklist/defaults`).expect(201)).body;
    expect(d1.total).toBe(6);
    expect((await send("post", h.owner, `${base}/checklist/defaults`).expect(201)).body.total).toBe(6);
    const added = (await send("post", h.owner, `${base}/checklist`).send({ label: "Favourite toy", category: "OTHER" }).expect(201)).body;
    const toy = added.items.find((i: { label: string }) => i.label === "Favourite toy");
    expect((await send("patch", h.owner, `${base}/checklist/${toy.id}`).send({ done: true }).expect(200)).body.done).toBe(1);
    await send("post", h.owner, `${base}/checklist`).send({ label: "x", category: "WEAPONS" }).expect(400);

    const withPet = (await send("post", h.owner, `${base}/participants`).send({ petId: h.secondPetId }).expect(201)).body;
    expect(withPet.pets.map((p: { name: string }) => p.name)).toEqual(["Second"]);
    expect(withPet.primaryPet.name).toBe("Primary");
    await send("post", h.owner, `${base}/participants`).send({ petId: h.secondPetId }).expect(400);
    await send("post", h.owner, `${base}/participants`).send({ petId: h.petId }).expect(400);
    const outsider = await household();
    await send("post", h.owner, `${base}/participants`).send({ petId: outsider.petId }).expect(404);
    await send("post", h.owner, `${base}/participants`).send({ userId: outsider.owner.id }).expect(404);
    // Someone else's trip looks missing; a stranger can't read the checklist.
    await get(outsider.owner, `${base}/checklist`).expect(403);
    await get(h.owner, `/pets/${h.petId}/trips/${randomUUID()}/checklist`).expect(404);
  });

  it("claim-prep vault: same-pet documents and bookings only; never submitted", async () => {
    const h = await household();
    const prep = (await send("post", h.owner, `/pets/${h.petId}/claim-preps`).send({ title: "Knee surgery", incidentDate: "2026-09-20" }).expect(201)).body;
    expect(prep).toMatchObject({ status: "DRAFT", submission: "NOT_AVAILABLE", items: [] });
    const doc = await db.medicalDocument.create({ data: { petId: h.petId, householdId: h.householdId, documentType: "LAB_REPORT", title: "Blood panel", sourceType: "OWNER", fileObjectKey: `health-documents/${h.petId}/${randomUUID()}.pdf`, mimeType: "application/pdf", fileSizeBytes: 100 } });
    const org = await db.providerOrganization.create({ data: { name: "Vet", type: "VET_CLINIC", verificationStatus: "VERIFIED" } });
    const loc = await db.providerLocation.create({ data: { providerOrganizationId: org.id, addressLine: "x", city: "x", countryCode: "IR", timezone: "UTC" } });
    const svc = await db.providerService.create({ data: { providerOrganizationId: org.id, locationId: loc.id, name: "Surgery", type: ProviderServiceType.GENERAL_VET_VISIT, category: ServiceCategory.VET, locationMode: LocationMode.AT_PROVIDER, durationMinutes: 60, priceAmount: 5_000_000, currency: "IRR" } });
    const b = await db.booking.create({ data: { householdId: h.householdId, petId: h.petId, userId: h.owner.id, providerOrganizationId: org.id, providerLocationId: loc.id, providerServiceId: svc.id, category: "VET", locationMode: "AT_PROVIDER", startAt: new Date(), endAt: new Date(Date.now() + 3600e3), timezone: "UTC", bookingStatus: "COMPLETED", priceAmount: 5_000_000, currency: "IRR", serviceNameSnapshot: "Surgery" } });
    await send("post", h.owner, `/pets/${h.petId}/claim-preps/${prep.id}/items`).send({ kind: "MEDICAL_DOCUMENT", refId: doc.id }).expect(201);
    const full = (await send("post", h.owner, `/pets/${h.petId}/claim-preps/${prep.id}/items`).send({ kind: "BOOKING", refId: b.id }).expect(201)).body;
    expect(full.items.map((i: { kind: string }) => i.kind)).toEqual(["MEDICAL_DOCUMENT", "BOOKING"]);
    expect(full.items[1].booking).toMatchObject({ serviceName: "Surgery", amount: "5000000" });
    await send("post", h.owner, `/pets/${h.petId}/claim-preps/${prep.id}/items`).send({ kind: "BOOKING", refId: b.id }).expect(400);
    // Another pet's document can't be filed here, even from the same household.
    const otherDoc = await db.medicalDocument.create({ data: { petId: h.secondPetId, householdId: h.householdId, documentType: "LAB_REPORT", title: "Other", sourceType: "OWNER", fileObjectKey: `health-documents/${h.secondPetId}/${randomUUID()}.pdf`, mimeType: "application/pdf", fileSizeBytes: 100 } });
    await send("post", h.owner, `/pets/${h.petId}/claim-preps/${prep.id}/items`).send({ kind: "MEDICAL_DOCUMENT", refId: otherDoc.id }).expect(404);
    expect((await send("patch", h.owner, `/pets/${h.petId}/claim-preps/${prep.id}`).send({ status: "READY" }).expect(200)).body.status).toBe("READY");
    const stranger = await household();
    await get(stranger.owner, `/pets/${h.petId}/claim-preps/${prep.id}`).expect(403);
    await get(h.owner, `/pets/${h.secondPetId}/claim-preps/${prep.id}`).expect(404);
  });
});
