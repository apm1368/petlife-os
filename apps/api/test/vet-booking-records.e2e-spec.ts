import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { LocationMode, PetAccessSource, ProviderUserRole, ServiceCategory } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { SlotGeneratorService } from "../src/modules/providers/slot-generator.service";

type Actor = { id: string; cookie: string; csrf: string };

/**
 * What a vet sees of a pet because of a booking, and nothing more: the owner's decision in the booking flow
 * (basic identity only, or health basics plus the documents they tick) follows the booking to whoever the
 * clinic assigns, moves on reassignment, and ends with the booking's access window.
 */
describe("Vet access to a pet's records through a booking", () => {
  let app: INestApplication;
  let db: PrismaService;
  const server = () => app.getHttpServer();

  async function actor(name: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `vr-${randomUUID()}@example.com` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  const get = (a: Actor, url: string) => request(server()).get(url).set("Cookie", a.cookie);
  const post = (a: Actor, url: string) => request(server()).post(url).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const del = (a: Actor, url: string) => request(server()).delete(url).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  const FULL = { canViewIdentity: true, canEditIdentity: true, canViewHealth: true, canEditHealth: true, canBookCare: true, canViewCareProfile: true, canEditCareProfile: true, canManageAccess: true };

  async function ownerWithPet() {
    const owner = await actor("owner");
    const hh = await db.household.create({ data: { name: `hh ${randomUUID().slice(0, 6)}` } });
    await db.householdMember.create({ data: { householdId: hh.id, userId: owner.id, role: "OWNER" } });
    const pet = await db.pet.create({
      data: { householdId: hh.id, name: "Biscuit", species: "DOG", breed: "Beagle", sex: "FEMALE", approximateAgeMonths: 30, latestWeightValue: 12.5, latestWeightUnit: "KG", microchipNumber: "985112003456789" },
    });
    await db.petAccessGrant.create({ data: { petId: pet.id, userId: owner.id, source: PetAccessSource.HOUSEHOLD, ...FULL } });
    await db.allergy.create({ data: { petId: pet.id, name: "Chicken", status: "ACTIVE" } });
    await db.medication.create({ data: { petId: pet.id, name: "Apoquel", status: "ACTIVE", frequencyText: "daily" } });
    await db.condition.create({ data: { petId: pet.id, name: "Atopic dermatitis", status: "ACTIVE" } });
    await db.vaccinationSummary.create({ data: { petId: pet.id, status: "UP_TO_DATE", lastKnownDate: new Date("2026-05-01"), nextDueDate: new Date("2027-05-01") } });
    const doc = (title: string) =>
      db.medicalDocument.create({ data: { petId: pet.id, householdId: hh.id, documentType: "OTHER", title, sourceType: "OWNER", fileObjectKey: `health-documents/${pet.id}/${randomUUID()}.pdf`, mimeType: "application/pdf", fileSizeBytes: 12 } });
    const [labReport, privateNote] = [await doc("Last year's blood work"), await doc("Private note")];
    return { owner, householdId: hh.id, petId: pet.id, labReport: labReport.id, privateNote: privateNote.id };
  }

  /** A verified clinic whose availability is not tied to any staff member, so a booking can be "any staff". */
  async function clinic() {
    const org = await db.providerOrganization.create({ data: { name: `Clinic ${randomUUID().slice(0, 6)}`, type: "VET_CLINIC", verificationStatus: "VERIFIED" } });
    const location = await db.providerLocation.create({ data: { providerOrganizationId: org.id, addressLine: "Valiasr 1", city: "Tehran", countryCode: "IR", timezone: "UTC" } });
    const service = await db.providerService.create({
      data: { providerOrganizationId: org.id, locationId: location.id, name: "Checkup", type: "GENERAL_VET_VISIT", category: ServiceCategory.VET, locationMode: LocationMode.AT_PROVIDER, durationMinutes: 30, priceAmount: 1_500_000, currency: "IRR" },
    });
    await db.providerAvailabilityRule.createMany({
      data: Array.from({ length: 7 }, (_, dayOfWeek) => ({ providerOrganizationId: org.id, locationId: location.id, dayOfWeek, startLocalTime: "00:00", endLocalTime: "23:30", timezone: "UTC" })),
    });
    const member = async (name: string, role: ProviderUserRole) => {
      const a = await actor(name);
      const row = await db.providerUser.create({ data: { userId: a.id, providerOrganizationId: org.id, role } });
      return { ...a, providerUserId: row.id };
    };
    return { org, location, service, frontDesk: await member("front desk", ProviderUserRole.OWNER), vetA: await member("vet A", ProviderUserRole.VET), vetB: await member("vet B", ProviderUserRole.VET), member };
  }

  let dayOffset = 2;
  async function hold(owner: Actor, petId: string, c: Awaited<ReturnType<typeof clinic>>, providerUserId?: string) {
    const from = new Date(Date.now() + dayOffset++ * 86400_000);
    const slots = await app.get(SlotGeneratorService).generate({ providerOrganizationId: c.org.id, locationId: c.location.id, serviceId: c.service.id, providerUserId, from, to: new Date(from.getTime() + 86400_000) });
    const slot = slots.find((s) => s.state === "AVAILABLE")!;
    const res = await post(owner, "/booking-holds").send({ petId, providerId: c.org.id, locationId: c.location.id, serviceId: c.service.id, ...(providerUserId ? { providerUserId } : {}), slotStart: slot.startAt.toISOString() }).expect(201);
    return res.body.holdId as string;
  }
  async function book(owner: Actor, petId: string, c: Awaited<ReturnType<typeof clinic>>, body: Record<string, unknown>, providerUserId?: string) {
    const holdId = await hold(owner, petId, c, providerUserId);
    const res = await post(owner, "/bookings").set("Idempotency-Key", randomUUID()).send({ holdId, petId, ...body }).expect(201);
    return res.body as { id: string; providerUserId: string | null };
  }
  const assign = (c: Awaited<ReturnType<typeof clinic>>, bookingId: string, providerUserId: string | null) =>
    post(c.frontDesk, `/provider/clinic/appointments/${bookingId}/assign`).send({ providerUserId }).expect(201);
  const link = (bookingId: string) => db.bookingPetAccess.findUniqueOrThrow({ where: { bookingId }, include: { petAccessGrant: true } });

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
  });
  afterAll(async () => { await app?.close(); });

  it("an \"any staff\" booking keeps the owner's choice and gives it to the vet the clinic assigns; reassigning moves it", async () => {
    const pet = await ownerWithPet();
    const c = await clinic();
    const booking = await book(pet.owner, pet.petId, c, { accessSelection: "HEALTH_BASICS", sharedDocumentIds: [pet.labReport], reasonForVisit: "Itchy paws" });
    expect(booking.providerUserId).toBeNull();

    // Recorded, but nobody holds it yet: the front desk sees the booking, not the pet's details.
    const waiting = await link(booking.id);
    expect(waiting).toMatchObject({ petAccessGrantId: null, scopePreset: "HEALTH_BASICS", healthConsented: true, sharedDocumentIds: [pet.labReport] });
    const desk = (await get(c.frontDesk, `/provider/bookings/${booking.id}`).expect(200)).body;
    expect(desk.access.state).toBe("NO_GRANT");
    expect(desk.pet).toMatchObject({ name: "Biscuit", species: "DOG", breed: "Beagle", identity: null });
    expect(desk.booking.reasonForVisit).toBe("Itchy paws");
    expect(desk.healthDetails).toBeNull();
    await get(c.vetA, `/provider/clinical/patients/${pet.petId}`).expect(403);

    await assign(c, booking.id, c.vetA.providerUserId);
    const first = await link(booking.id);
    expect(first.petAccessGrant).toMatchObject({ userId: c.vetA.id, canViewHealth: true, canRecordClinicalData: true, reason: "VET_BOOKING_HEALTH_CONSENT", revokedAt: null });
    const detail = (await get(c.vetA, `/provider/bookings/${booking.id}`).expect(200)).body;
    expect(detail.access).toMatchObject({ state: "GRANTED", canViewHealth: true, scopePreset: "HEALTH_BASICS" });
    expect(detail.pet.identity).toEqual({ sex: "FEMALE", birthDate: null, approximateAgeMonths: 30, latestWeightValue: 12.5, latestWeightUnit: "KG", hasMicrochip: true });
    expect(JSON.stringify(detail.pet)).not.toContain("985112003456789");
    expect(detail.healthDetails.allergies.map((a: { name: string }) => a.name)).toEqual(["Chicken"]);
    expect(detail.healthDetails.medications.map((m: { name: string }) => m.name)).toEqual(["Apoquel"]);
    expect(detail.healthDetails.conditions.map((m: { name: string }) => m.name)).toEqual(["Atopic dermatitis"]);
    expect(detail.healthDetails.vaccination).toMatchObject({ status: "UP_TO_DATE", nextDueDate: expect.stringContaining("2027-05-01") });
    expect(detail.healthDetails.sharedDocuments.map((d: { id: string }) => d.id)).toEqual([pet.labReport]);
    const record = (await get(c.vetA, `/provider/clinical/patients/${pet.petId}`).expect(200)).body;
    expect(record.vaccination).toMatchObject({ status: "UP_TO_DATE", lastKnownDate: expect.stringContaining("2026-05-01") });
    expect(record.documents.map((d: { id: string }) => d.id)).toEqual([pet.labReport]);

    await assign(c, booking.id, c.vetB.providerUserId);
    const moved = await link(booking.id);
    expect(moved.petAccessGrant).toMatchObject({ userId: c.vetB.id, canViewHealth: true, reason: "VET_BOOKING_HEALTH_CONSENT", expiresAt: first.petAccessGrant!.expiresAt });
    expect((await db.petAccessGrant.findUniqueOrThrow({ where: { id: first.petAccessGrantId! } })).revokedAt).toBeInstanceOf(Date);
    expect((await get(c.vetA, `/provider/bookings/${booking.id}`).expect(200)).body.access.state).toBe("NO_GRANT");
    await get(c.vetA, `/provider/clinical/patients/${pet.petId}`).expect(403);
    await get(c.vetA, `/pets/${pet.petId}/health/documents/${pet.labReport}/download`).expect(403);
    expect((await get(c.vetB, `/provider/bookings/${booking.id}`).expect(200)).body.access.state).toBe("GRANTED");
    await get(c.vetB, `/provider/clinical/patients/${pet.petId}`).expect(200);

    // Unassigning ends it too; the next assignee gets the same consent again.
    await assign(c, booking.id, null);
    await get(c.vetB, `/provider/clinical/patients/${pet.petId}`).expect(403);
    await assign(c, booking.id, c.vetA.providerUserId);
    await get(c.vetA, `/provider/clinical/patients/${pet.petId}`).expect(200);
  });

  it("the previous assignee keeps only access of their own: another booking's grant, without the moved booking's documents", async () => {
    const pet = await ownerWithPet();
    const c = await clinic();
    const shared = await book(pet.owner, pet.petId, c, { accessSelection: "HEALTH_BASICS", sharedDocumentIds: [pet.labReport] }, c.vetA.providerUserId);
    await book(pet.owner, pet.petId, c, { accessSelection: "HEALTH_BASICS" }, c.vetA.providerUserId);
    expect((await get(c.vetA, `/provider/clinical/patients/${pet.petId}`).expect(200)).body.documents.map((d: { id: string }) => d.id)).toEqual([pet.labReport]);

    await assign(c, shared.id, c.vetB.providerUserId);
    const record = (await get(c.vetA, `/provider/clinical/patients/${pet.petId}`).expect(200)).body;
    expect(record.documents).toEqual([]);
    await get(c.vetA, `/pets/${pet.petId}/health/documents/${pet.labReport}/download`).expect(404);
    await get(c.vetB, `/pets/${pet.petId}/health/documents/${pet.labReport}/download`).expect(200);
  });

  it("MINIMAL_VET_CONTEXT never exposes health, however the booking is assigned", async () => {
    const pet = await ownerWithPet();
    const c = await clinic();
    // Documents can't ride along with an identity-only choice; the slot is kept for a corrected request.
    const holdId = await hold(pet.owner, pet.petId, c, c.vetA.providerUserId);
    const refused = await post(pet.owner, "/bookings").set("Idempotency-Key", randomUUID()).send({ holdId, petId: pet.petId, accessSelection: "MINIMAL_VET_CONTEXT", sharedDocumentIds: [pet.labReport] }).expect(400);
    expect(refused.body.error.details).toMatchObject({ field: "sharedDocumentIds", reason: "REQUIRES_HEALTH_SHARING" });
    const booking = (await post(pet.owner, "/bookings").set("Idempotency-Key", randomUUID()).send({ holdId, petId: pet.petId, accessSelection: "MINIMAL_VET_CONTEXT" }).expect(201)).body;

    const checkMinimal = async (vet: Actor) => {
      const detail = (await get(vet, `/provider/bookings/${booking.id}`).expect(200)).body;
      expect(detail.access).toMatchObject({ state: "GRANTED", canViewHealth: false, canViewCareProfile: false, scopePreset: "MINIMAL_VET_CONTEXT" });
      expect(detail.pet.identity).toMatchObject({ sex: "FEMALE", hasMicrochip: true });
      expect(detail.healthSummary).toBeNull();
      expect(detail.healthDetails).toBeNull();
      expect(JSON.stringify(detail)).not.toContain("Chicken");
      await get(vet, `/provider/clinical/patients/${pet.petId}`).expect(403);
      await get(vet, `/pets/${pet.petId}/health/documents`).expect(403);
      await get(vet, `/pets/${pet.petId}/health/documents/${pet.labReport}/download`).expect(403);
      await get(vet, `/pets/${pet.petId}/health/allergies`).expect(403);
    };
    await checkMinimal(c.vetA);
    expect((await link(booking.id)).petAccessGrant).toMatchObject({ canViewHealth: false, reason: "VET_BOOKING" });
    await assign(c, booking.id, c.vetB.providerUserId);
    await checkMinimal(c.vetB);

    // A category default is not consent either: no explicit choice reads no health.
    const unchosen = await book(pet.owner, pet.petId, c, {}, c.vetA.providerUserId);
    expect((await link(unchosen.id)).petAccessGrant).toMatchObject({ canViewHealth: false, reason: "VET_BOOKING" });
    expect((await get(c.vetA, `/provider/bookings/${unchosen.id}`).expect(200)).body.healthDetails).toBeNull();
  });

  it("shared documents reach only the booking's vet, only while its grant is active; strangers get nothing", async () => {
    const pet = await ownerWithPet();
    const c = await clinic();
    const other = await clinic();
    const booking = await book(pet.owner, pet.petId, c, { accessSelection: "HEALTH_BASICS", sharedDocumentIds: [pet.labReport] }, c.vetA.providerUserId);

    // The booking's vet: exactly the ticked document, through the pet's signed download.
    const list = (await get(c.vetA, `/pets/${pet.petId}/health/documents`).expect(200)).body;
    expect(list.map((d: { id: string }) => d.id)).toEqual([pet.labReport]);
    const signed = (await get(c.vetA, `/pets/${pet.petId}/health/documents/${pet.labReport}/download`).expect(200)).body;
    expect(signed.expiresInSeconds).toBeGreaterThan(0);
    await get(c.vetA, `/pets/${pet.petId}/health/documents/${pet.privateNote}`).expect(404);
    await get(c.vetA, `/pets/${pet.petId}/health/documents/${pet.privateNote}/download`).expect(404);
    expect((await get(c.vetA, `/provider/clinical/patients/${pet.petId}`).expect(200)).body.documents.map((d: { id: string }) => d.id)).not.toContain(pet.privateNote);
    const overview = (await get(c.vetA, `/pets/${pet.petId}/health`).expect(200)).body;
    expect(overview.recentDocuments.map((d: { id: string }) => d.id)).toEqual([pet.labReport]);
    expect(JSON.stringify((await get(c.vetA, `/pets/${pet.petId}/health/timeline`).expect(200)).body)).not.toContain("Private note");
    // The owner still sees everything, and the documents' own visibility never changed.
    expect((await get(pet.owner, `/pets/${pet.petId}/health/documents`).expect(200)).body).toHaveLength(2);
    expect((await db.medicalDocument.findMany({ where: { id: { in: [pet.labReport, pet.privateNote] } } })).every((d) => d.visibility === "HOUSEHOLD_ONLY")).toBe(true);

    // Strangers: an unassigned colleague, a vet of another clinic, an unrelated account.
    const colleague = c.vetB;
    expect((await get(colleague, `/provider/bookings/${booking.id}`).expect(200)).body).toMatchObject({ access: { state: "NO_GRANT" }, healthDetails: null, pet: { identity: null } });
    await get(other.vetA, `/provider/bookings/${booking.id}`).expect(403);
    const stranger = await actor("stranger");
    for (const outsider of [colleague, other.vetA, stranger]) {
      await get(outsider, `/provider/clinical/patients/${pet.petId}`).expect((res) => expect([403, 404]).toContain(res.status));
      await get(outsider, `/pets/${pet.petId}/health/documents/${pet.labReport}/download`).expect(403);
    }

    // A document from another pet can't be ticked.
    const elsewhere = await ownerWithPet();
    const holdId = await hold(pet.owner, pet.petId, c);
    const foreign = await post(pet.owner, "/bookings").set("Idempotency-Key", randomUUID()).send({ holdId, petId: pet.petId, accessSelection: "HEALTH_BASICS", sharedDocumentIds: [elsewhere.labReport] }).expect(400);
    expect(foreign.body.error.details).toMatchObject({ field: "sharedDocumentIds", reason: "DOCUMENT_NOT_FOUND" });

    // Once the booking's access window is over, the documents go with it.
    const grantId = (await link(booking.id)).petAccessGrantId!;
    await db.petAccessGrant.update({ where: { id: grantId }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    expect((await get(c.vetA, `/provider/bookings/${booking.id}`).expect(200)).body).toMatchObject({ access: { state: "EXPIRED" }, healthDetails: null });
    await get(c.vetA, `/provider/clinical/patients/${pet.petId}`).expect(403);
    await get(c.vetA, `/pets/${pet.petId}/health/documents/${pet.labReport}/download`).expect(403);
  });

  it("once the owner withdraws a booking's access, reassigning it gives no one access", async () => {
    const pet = await ownerWithPet();
    const c = await clinic();
    const booking = await book(pet.owner, pet.petId, c, { accessSelection: "HEALTH_BASICS", sharedDocumentIds: [pet.labReport] }, c.vetA.providerUserId);
    const grantId = (await link(booking.id)).petAccessGrantId!;
    await del(pet.owner, `/pets/${pet.petId}/access-grants/${grantId}`).expect(200);

    await assign(c, booking.id, c.vetB.providerUserId);
    expect((await link(booking.id)).petAccessGrantId).toBe(grantId);
    expect(await db.petAccessGrant.count({ where: { petId: pet.petId, userId: c.vetB.id } })).toBe(0);
    await get(c.vetB, `/provider/clinical/patients/${pet.petId}`).expect(403);
  });
});
