import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { BookingStatus, PaymentStatus, PetAccessSource, ProviderType, ProviderUserRole, ProviderVerificationStatus } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";

type Client = { id: string; get: (u: string) => request.Test; post: (u: string) => request.Test; patch: (u: string) => request.Test };

/**
 * Clinic OS must not turn caseload membership into health disclosure (VACCINES_DUE), and access to a pet lets a
 * clinic add its own clinical records, never rewrite or void another clinic's.
 */
describe("Clinic: health-gated campaigns and owning-organisation checks", () => {
  let app: INestApplication;
  let db: PrismaService;
  const DAY = 86_400_000;

  async function user(name: string): Promise<Client> {
    const u = await db.user.create({ data: { displayName: name, email: `cx-${randomUUID()}@example.com` } });
    const session = await db.session.create({ data: { userId: u.id, expiresAt: new Date(Date.now() + DAY) } });
    const csrf = extractCookie((await request(app.getHttpServer()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    const cookie = `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`;
    const s = () => app.getHttpServer();
    return {
      id: u.id,
      get: (url) => request(s()).get(url).set("Cookie", cookie),
      post: (url) => request(s()).post(url).set("Cookie", cookie).set("x-csrf-token", csrf),
      patch: (url) => request(s()).patch(url).set("Cookie", cookie).set("x-csrf-token", csrf),
    };
  }

  async function clinic(role: ProviderUserRole = ProviderUserRole.OWNER) {
    const org = await db.providerOrganization.create({ data: { name: `Clinic ${randomUUID().slice(0, 6)}`, type: ProviderType.VET_CLINIC, verificationStatus: ProviderVerificationStatus.VERIFIED } });
    const location = await db.providerLocation.create({ data: { providerOrganizationId: org.id, addressLine: "Valiasr 1", city: "Tehran", countryCode: "IR", timezone: "Asia/Tehran" } });
    const service = await db.providerService.create({ data: { providerOrganizationId: org.id, locationId: location.id, name: "Checkup", type: "GENERAL_VET_VISIT", category: "VET", durationMinutes: 30, priceAmount: 1_500_000 } });
    const staff = await user("vet");
    await db.providerUser.create({ data: { userId: staff.id, providerOrganizationId: org.id, role } });
    return { org, location, service, staff };
  }

  async function addStaff(c: Awaited<ReturnType<typeof clinic>>, role: ProviderUserRole) {
    const staff = await user("staff");
    await db.providerUser.create({ data: { userId: staff.id, providerOrganizationId: c.org.id, role } });
    return staff;
  }

  async function pet() {
    const owner = await user("owner");
    const hh = await db.household.create({ data: { name: "hh" } });
    await db.householdMember.create({ data: { householdId: hh.id, userId: owner.id, role: "OWNER" } });
    const p = await db.pet.create({ data: { householdId: hh.id, name: "Biscuit", species: "DOG", approximateAgeMonths: 30 } });
    await db.petAccessGrant.create({ data: { petId: p.id, userId: owner.id, source: PetAccessSource.HOUSEHOLD, canViewIdentity: true, canViewHealth: true, canEditHealth: true, canBookCare: true, canManageAccess: true } });
    return { owner, householdId: hh.id, petId: p.id };
  }

  async function inCaseload(c: Awaited<ReturnType<typeof clinic>>, p: Awaited<ReturnType<typeof pet>>) {
    const startAt = new Date(Date.now() - 2 * DAY);
    await db.booking.create({
      data: {
        householdId: p.householdId, petId: p.petId, userId: p.owner.id, providerOrganizationId: c.org.id, providerLocationId: c.location.id, providerServiceId: c.service.id,
        category: "VET", locationMode: "AT_PROVIDER", startAt, endAt: new Date(startAt.getTime() + 1800e3), timezone: "Asia/Tehran",
        bookingStatus: BookingStatus.COMPLETED, priceAmount: 1_500_000, discountAmount: 0, currency: "IRR", paymentMode: "PAY_AT_PROVIDER", paymentStatus: PaymentStatus.NOT_REQUIRED, serviceNameSnapshot: "Checkup",
      },
    });
  }

  const grant = (petId: string, userId: string, data: Record<string, unknown>) =>
    db.petAccessGrant.create({ data: { petId, userId, source: PetAccessSource.MANUAL, canViewIdentity: true, ...data } });

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
  });
  afterAll(async () => { await app?.close(); });

  it("VACCINES_DUE reaches only pets whose health is shared with the clinic, never discloses the date, and STAFF can't preview it", async () => {
    const c = await clinic();
    const plan = await db.clinicPlan.findUniqueOrThrow({ where: { code: "CLINIC_GROWTH" } });
    await db.clinicSubscription.create({ data: { providerOrganizationId: c.org.id, planId: plan.id } });
    const due = new Date(Date.now() + 5 * DAY);

    const shared = await pet();
    const bookingOnly = await pet();
    const notShared = await pet();
    for (const p of [shared, bookingOnly, notShared]) {
      await inCaseload(c, p);
      await db.vaccinationSummary.create({ data: { petId: p.petId, status: "DUE_SOON", nextDueDate: due, sourceType: "OWNER" } });
    }
    await grant(shared.petId, c.staff.id, { canViewHealth: true });
    // A booking grant without the owner's health consent never reads health.
    await grant(bookingOnly.petId, c.staff.id, { canViewHealth: true, reason: "VET_BOOKING" });

    const preview = (await c.staff.post("/provider/clinic/campaigns/preview").send({ segment: "VACCINES_DUE" }).expect(201)).body;
    expect(preview.count).toBe(1);
    expect(preview.sample).toEqual([{ petId: shared.petId, petName: "Biscuit", detail: "" }]);
    expect(JSON.stringify(preview)).not.toContain(due.toISOString().slice(0, 10));

    const staff = await addStaff(c, ProviderUserRole.STAFF);
    await staff.post("/provider/clinic/campaigns/preview").send({ segment: "VACCINES_DUE" }).expect(403);
  });

  it("a clinic can't amend, void or move along another clinic's clinical records", async () => {
    const a = await clinic(ProviderUserRole.VET);
    const b = await clinic(ProviderUserRole.VET);
    const p = await pet();
    for (const c of [a, b]) await grant(p.petId, c.staff.id, { canViewHealth: true, canRecordClinicalData: true });

    const lab = (await a.staff.post("/provider/labs").send({ petId: p.petId, testName: "CBC", value: "Normal", resultDate: new Date().toISOString() }).expect(201)).body;
    const study = (await a.staff.post("/provider/imaging").send({ petId: p.petId, studyType: "XRAY", report: "Clear" }).expect(201)).body;
    const referral = (await a.staff.post("/provider/referrals").send({ petId: p.petId, reason: "Ortho", externalProviderName: "Ortho Clinic" }).expect(201)).body;
    const carePlan = (await a.staff.post("/provider/care-plans").send({ petId: p.petId, title: "Recovery", items: [{ type: "FOLLOW_UP", title: "Recheck" }] }).expect(201)).body;
    const rehab = (await a.staff.post("/provider/rehab-plans").send({ petId: p.petId, goal: "Mobility" }).expect(201)).body;
    const itemId = carePlan.items[0].id as string;

    // Clinic B holds clinical access to the pet, but none of these records are its own.
    await b.staff.post(`/provider/labs/${lab.id}/amend`).send({ petId: p.petId, testName: "CBC", value: "Tampered", resultDate: new Date().toISOString() }).expect(403);
    await b.staff.post(`/provider/imaging/${study.id}/void`).send({ petId: p.petId, reason: "tampered" }).expect(403);
    await b.staff.patch(`/provider/referrals/${referral.id}/status`).send({ petId: p.petId, status: "SENT" }).expect(403);
    await b.staff.post(`/provider/patients/${p.petId}/care-plans/${carePlan.id}/items`).send({ type: "FOLLOW_UP", title: "Injected" }).expect(403);
    await b.staff.patch(`/provider/patients/${p.petId}/care-plans/${carePlan.id}/items/${itemId}/status`).send({ status: "CANCELLED" }).expect(403);
    await b.staff.post(`/provider/patients/${p.petId}/rehab-plans/${rehab.id}/sessions`).send({ sessionDate: new Date().toISOString(), observation: "x" }).expect(403);
    expect((await db.imagingStudy.findUniqueOrThrow({ where: { id: study.id } })).voidedAt).toBeNull();

    // The owning clinic still can, and voiding is audited.
    await a.staff.post(`/provider/labs/${lab.id}/amend`).send({ petId: p.petId, testName: "CBC", value: "Corrected", resultDate: new Date().toISOString() }).expect(201);
    await a.staff.patch(`/provider/referrals/${referral.id}/status`).send({ petId: p.petId, status: "SENT" }).expect(200);
    await a.staff.post(`/provider/patients/${p.petId}/care-plans/${carePlan.id}/items`).send({ type: "FOLLOW_UP", title: "Second recheck" }).expect(201);
    await a.staff.patch(`/provider/patients/${p.petId}/care-plans/${carePlan.id}/items/${itemId}/status`).send({ status: "COMPLETED" }).expect(200);
    await a.staff.post(`/provider/patients/${p.petId}/rehab-plans/${rehab.id}/sessions`).send({ sessionDate: new Date().toISOString(), observation: "Better" }).expect(201);
    await a.staff.post(`/provider/imaging/${study.id}/void`).send({ petId: p.petId, reason: "Wrong patient" }).expect(201);
    expect(await db.domainEvent.count({ where: { type: "ImagingStudyVoided", aggregateId: p.petId } })).toBe(1);
  });
});
