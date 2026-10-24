import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole, HouseholdRole, PetAccessSource, SourceType } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";

type Client = { id: string; get: (u: string) => request.Test; post: (u: string) => request.Test };

/**
 * Access control by provenance and by real permission:
 *  - the household's canEditHealth path can't rewrite a clinician's end-of-life plan or void a clinician's document;
 *  - admin search returns each section only to a role that may see it on its own.
 */
describe("Provenance on household health edits, and permission-scoped admin search", () => {
  let app: INestApplication;
  let db: PrismaService;
  let csrf: string;
  const DAY = 86_400_000;

  async function client(userId: string): Promise<Client> {
    const session = await db.session.create({ data: { userId, expiresAt: new Date(Date.now() + DAY) } });
    const cookie = `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`;
    return {
      id: userId,
      get: (u) => request(app.getHttpServer()).get(u).set("Cookie", cookie),
      post: (u) => request(app.getHttpServer()).post(u).set("Cookie", cookie).set("x-csrf-token", csrf),
    };
  }
  const user = async (name: string) => (await db.user.create({ data: { displayName: name, email: `pv-${randomUUID()}@example.com` } })).id;

  /** Owner (full owner grant), an authorised member (canEditHealth) and a member without health edit. */
  async function household() {
    const hh = await db.household.create({ data: { name: "Provenance" } });
    const pet = await db.pet.create({ data: { householdId: hh.id, name: "Biscuit", species: "DOG", approximateAgeMonths: 30 } });
    const mk = async (name: string, role: HouseholdRole, flags: Record<string, boolean>) => {
      const id = await user(name);
      await db.householdMember.create({ data: { householdId: hh.id, userId: id, role } });
      await db.petAccessGrant.create({ data: { petId: pet.id, userId: id, source: role === "OWNER" ? PetAccessSource.HOUSEHOLD : PetAccessSource.MANUAL, canViewIdentity: true, canViewHealth: true, ...flags } });
      return client(id);
    };
    const owner = await mk("owner", HouseholdRole.OWNER, { canEditHealth: true, canManageAccess: true });
    const editor = await mk("editor", HouseholdRole.FAMILY, { canEditHealth: true });
    const viewer = await mk("viewer", HouseholdRole.FAMILY, {});
    return { petId: pet.id, owner, editor, viewer };
  }

  async function adminClient(role: AdminRole) {
    const id = await user(`admin-${role}`);
    await db.adminUser.create({ data: { userId: id, role, status: AdminMembershipStatus.ACTIVE } });
    return client(id);
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    csrf = extractCookie((await request(app.getHttpServer()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
  });
  afterAll(async () => { await app?.close(); });

  describe("end-of-life care plan", () => {
    it("a clinician's plan can't be rewritten from the household side, even with canEditHealth", async () => {
      const { petId, owner, editor } = await household();
      const org = await db.providerOrganization.create({ data: { name: `Clinic ${randomUUID().slice(0, 6)}`, type: "VET_CLINIC", verificationStatus: "VERIFIED" } });
      const vetUser = await user("vet");
      await db.endOfLifeCarePlan.create({ data: { petId, palliativeCareNotes: "Clinician plan", sourceType: SourceType.PROVIDER, recordedByUserId: vetUser, providerOrganizationId: org.id } });
      const lifecycleBefore = (await db.pet.findUniqueOrThrow({ where: { id: petId } })).lifecycleStatus;

      for (const c of [owner, editor]) {
        const res = await c.post(`/pets/${petId}/health/end-of-life`).send({ palliativeCareNotes: "Overwritten" }).expect(403);
        expect(res.body.error.code).toBe("PROVIDER_RECORD_NOT_OWNER_EDITABLE");
      }
      const row = await db.endOfLifeCarePlan.findUniqueOrThrow({ where: { petId } });
      expect(row).toMatchObject({ palliativeCareNotes: "Clinician plan", sourceType: SourceType.PROVIDER, recordedByUserId: vetUser, providerOrganizationId: org.id });
      expect((await db.pet.findUniqueOrThrow({ where: { id: petId } })).lifecycleStatus).toBe(lifecycleBefore);
    });

    it("the household's own plan stays editable by an authorised member; author and source are kept and every save is audited", async () => {
      const { petId, owner, editor, viewer } = await household();
      await owner.post(`/pets/${petId}/health/end-of-life`).send({ endOfLifePreferences: "At home" }).expect(200);
      await editor.post(`/pets/${petId}/health/end-of-life`).send({ endOfLifePreferences: "At home, with family" }).expect(200);
      await viewer.post(`/pets/${petId}/health/end-of-life`).send({ endOfLifePreferences: "Changed" }).expect(403);

      const row = await db.endOfLifeCarePlan.findUniqueOrThrow({ where: { petId } });
      expect(row).toMatchObject({ endOfLifePreferences: "At home, with family", sourceType: SourceType.OWNER, recordedByUserId: owner.id });
      const saves = await db.domainEvent.findMany({ where: { type: "EndOfLifeCarePlanSaved", aggregateId: petId }, orderBy: { occurredAt: "asc" } });
      expect(saves.map((e) => (e.payload as { actorUserId: string }).actorUserId)).toEqual([owner.id, editor.id]);
    });
  });

  describe("medical document void", () => {
    async function document(petId: string, sourceType: SourceType, sourceUserId?: string) {
      const { householdId } = await db.pet.findUniqueOrThrow({ where: { id: petId }, select: { householdId: true } });
      return db.medicalDocument.create({
        data: { petId, householdId, documentType: "OTHER", title: `${sourceType} doc`, fileObjectKey: `health-documents/${petId}/${randomUUID()}.pdf`, mimeType: "application/pdf", fileSizeBytes: 100, sourceType, sourceUserId },
      });
    }

    it("owner and an authorised member void household documents with a reason (audited, file kept); others can't", async () => {
      const { petId, owner, editor, viewer } = await household();
      const a = await document(petId, SourceType.OWNER, owner.id);
      const b = await document(petId, SourceType.HOUSEHOLD_MEMBER, editor.id);

      await viewer.post(`/pets/${petId}/health/documents/${a.id}/void`).send({ reason: "nope" }).expect(403);
      await owner.post(`/pets/${petId}/health/documents/${a.id}/void`).send({}).expect(400);
      await owner.post(`/pets/${petId}/health/documents/${a.id}/void`).send({ reason: "Wrong pet" }).expect(201);
      await editor.post(`/pets/${petId}/health/documents/${b.id}/void`).send({ reason: "Duplicate upload" }).expect(201);
      await owner.post(`/pets/${petId}/health/documents/${a.id}/void`).send({ reason: "again" }).expect(400);

      const voided = await db.medicalDocument.findUniqueOrThrow({ where: { id: a.id } });
      expect(voided).toMatchObject({ voidedReason: "Wrong pet", fileObjectKey: a.fileObjectKey, sourceType: SourceType.OWNER });
      expect(voided.voidedAt).not.toBeNull();
      const events = await db.domainEvent.findMany({ where: { type: "MedicalDocumentVoided", aggregateId: petId } });
      expect(events.map((e) => (e.payload as { actorUserId: string; reason: string }).actorUserId).sort()).toEqual([owner.id, editor.id].sort());
    });

    it("a clinician's document can't be voided from the household side, even by the owner", async () => {
      const { petId, owner, editor } = await household();
      const clinical = await document(petId, SourceType.PROVIDER);
      for (const c of [owner, editor]) {
        const res = await c.post(`/pets/${petId}/health/documents/${clinical.id}/void`).send({ reason: "Disagree" }).expect(403);
        expect(res.body.error.code).toBe("PROVIDER_RECORD_NOT_OWNER_EDITABLE");
      }
      expect((await db.medicalDocument.findUniqueOrThrow({ where: { id: clinical.id } })).voidedAt).toBeNull();
      // The correction path stays open for the household.
      await owner.post(`/pets/${petId}/health/corrections`).send({ targetType: "MEDICAL_DOCUMENT", targetId: clinical.id, correctionText: "This report belongs to another pet." }).expect((r) => expect([200, 201]).toContain(r.status));
    });
  });

  describe("admin search", () => {
    let customerEmail: string, orderId: string, caseNumber: string;

    beforeAll(async () => {
      customerEmail = `search-target-${randomUUID()}@example.com`;
      const customer = await db.user.create({ data: { displayName: "Search Target", email: customerEmail, phone: `+98912${Math.floor(1_000_000 + Math.random() * 8_999_999)}` } });
      const seller = await db.sellerOrganization.create({ data: { name: "Search Seller", countryCode: "IR" } });
      orderId = (await db.order.create({ data: { sellerOrganizationId: seller.id, userId: customer.id, subtotalAmount: 100_000, deliveryAmount: 0, discountAmount: 0, totalAmount: 100_000, currency: "IRR", shippingAddressSnapshot: {} } })).id;
      caseNumber = `SC-${randomUUID().slice(0, 8)}`;
      await db.supportCase.create({ data: { caseNumber, requesterUserId: customer.id, subject: "Search target case", description: "x", category: "ACCOUNT" } });
    });

    it("a single-permission role (customer.view only) gets customers, never orders or support cases", async () => {
      const verification = await adminClient(AdminRole.VERIFICATION);
      const byEmail = (await verification.get(`/admin/search?q=${encodeURIComponent(customerEmail)}`).expect(200)).body;
      expect(byEmail.searched).toEqual({ customers: true, orders: false, supportCases: false });
      expect(byEmail.customers).toHaveLength(1);
      const byOrder = (await verification.get(`/admin/search?q=${orderId}`).expect(200)).body;
      expect(byOrder.orders).toEqual([]);
      const byCase = (await verification.get(`/admin/search?q=${caseNumber}`).expect(200)).body;
      expect(byCase.supportCases).toEqual([]);
    });

    it("a combined role without commerce.view gets customers and support cases, but an order-id search returns no order", async () => {
      const clinicOps = await adminClient(AdminRole.CLINIC_OPERATIONS);
      const byOrder = (await clinicOps.get(`/admin/search?q=${orderId}`).expect(200)).body;
      expect(byOrder.searched).toEqual({ customers: true, orders: false, supportCases: true });
      expect(byOrder.orders).toEqual([]);
      expect(JSON.stringify(byOrder)).not.toContain(orderId);
      expect((await clinicOps.get(`/admin/search?q=${caseNumber}`).expect(200)).body.supportCases).toHaveLength(1);
    });

    it("a role with all three finds the order by id; a role with none is refused", async () => {
      const support = await adminClient(AdminRole.SUPPORT);
      const byOrder = (await support.get(`/admin/search?q=${orderId}`).expect(200)).body;
      expect(byOrder.searched).toEqual({ customers: true, orders: true, supportCases: true });
      expect(byOrder.orders.map((o: { id: string }) => o.id)).toEqual([orderId]);
      const content = await adminClient(AdminRole.CONTENT);
      await content.get(`/admin/search?q=${orderId}`).expect(403);
    });
  });
});
