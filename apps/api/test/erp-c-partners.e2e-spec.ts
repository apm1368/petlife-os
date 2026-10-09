import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { PartnerVerificationService } from "../src/modules/partner-verification/partner-verification.service";
import { AutomaticTaskService } from "../src/modules/admin/task/automatic-task.service";

type Actor = { id: string; cookie: string; csrf: string };
const DAY = 86400e3;

/** ERP-C: partner verification workflow, documents, expiry, automatic tasks, provider/clinic/seller 360, suspension effect. */
describe("ERP-C partners", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor | null, u: string) => (a ? request(server()).get(u).set("Cookie", a.cookie) : request(server()).get(u));
  const post = (a: Actor, u: string) => request(server()).post(u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const patch = (a: Actor, u: string) => request(server()).patch(u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const tag = () => randomUUID().slice(0, 8);

  async function actor(name: string, role?: AdminRole): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `erpc-${randomUUID()}@example.com` } });
    if (role) await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + DAY) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  async function provider(type: "GROOMER" | "VET_CLINIC" | "TRAVEL_ACCOMMODATION" = "GROOMER", status: "NOT_STARTED" | "VERIFIED" = "NOT_STARTED") {
    const owner = await actor("owner");
    const org = await db.providerOrganization.create({ data: { name: `ERP-C ${tag()}`, type, verificationStatus: status } });
    await db.providerUser.create({ data: { providerOrganizationId: org.id, userId: owner.id, role: "OWNER" } });
    return { owner, orgId: org.id };
  }
  const doc = (subjectType: "PROVIDER" | "SELLER", subjectId: string, status: "PENDING" | "ACCEPTED", expiresAt?: Date) =>
    db.partnerVerificationDocument.create({ data: { subjectType, subjectId, kind: "LICENSE", objectKey: `partner-verification/${subjectType === "PROVIDER" ? "provider" : "seller"}/${subjectId}/${randomUUID()}.pdf`, mimeType: "application/pdf", fileSizeBytes: 100, status, expiresAt, uploadedByUserId: randomUUID() } });

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("partner submits evidence; staff review it under an explicit state machine; evidence required to verify; audited, notified, tasked", async () => {
    const p = await provider();
    const other = await provider();
    const ops = await actor("ops", AdminRole.PARTNER_OPERATIONS);
    const ro = await actor("ro", AdminRole.READ_ONLY);
    const member = await actor("member");

    expect((await get(p.owner, "/provider/verification").expect(200)).body).toMatchObject({ status: "NOT_STARTED", lifecycle: "NOT_SUBMITTED", canSubmit: false });
    await post(p.owner, "/provider/verification/submit").expect(400); // no document yet
    const upload = (await post(p.owner, "/provider/verification/uploads").send({ contentType: "application/pdf", fileSizeBytes: 1000 }).expect(201)).body;
    expect(upload.key).toMatch(new RegExp(`^partner-verification/provider/${p.orgId}/`));
    // A key issued for another organisation can't be registered here (cross-org).
    const foreign = (await post(other.owner, "/provider/verification/uploads").send({ contentType: "application/pdf", fileSizeBytes: 1000 }).expect(201)).body.key;
    expect((await post(p.owner, "/provider/verification/documents").send({ objectKey: foreign, kind: "LICENSE", contentType: "application/pdf", fileSizeBytes: 1000 }).expect(400)).body.error.details.reason).toBe("NOT_ISSUED_FOR_THIS_ORGANIZATION");
    await post(p.owner, "/provider/verification/documents").send({ objectKey: upload.key, kind: "LICENSE", contentType: "application/pdf", fileSizeBytes: 1000, expiresAt: new Date(Date.now() + 400 * DAY).toISOString() }).expect(201);
    const submitted = (await post(p.owner, "/provider/verification/submit").expect(201)).body;
    expect(submitted).toMatchObject({ status: "SUBMITTED", lifecycle: "PENDING" });
    expect((await post(p.owner, "/provider/verification/submit").expect(400)).body.error.details.reason).toBe("NOT_SUBMITTABLE");
    expect(await db.adminTask.count({ where: { relatedEntityId: p.orgId, source: "PARTNER_VERIFICATION", team: "PARTNER_OPERATIONS" } })).toBe(1);

    await get(member, "/admin/verification/queue").expect(403);
    expect((await get(ops, "/admin/verification/queue?subjectType=PROVIDER").expect(200)).body.map((r: { id: string }) => r.id)).toContain(p.orgId);
    const t = (to: string, a: Actor = ops, reason?: string) => post(a, `/admin/verification/provider/${p.orgId}/transition`).send({ to, ...(reason ? { reason } : {}) });
    await t("UNDER_REVIEW", ro).expect(403);
    expect((await t("VERIFIED").expect(400)).body.error.details.reason).toBe("VERIFICATION_EVIDENCE_REQUIRED");
    await t("UNDER_REVIEW").expect(201);
    expect((await t("UNDER_REVIEW").expect(400)).body.error.details.reason).toBe("UNCHANGED");
    expect((await t("SUBMITTED").expect(400)).body.error.details.reason).toBe("INVALID_TRANSITION");
    expect((await t("NEEDS_INFORMATION").expect(400)).body.error.details).toMatchObject({ field: "reason", reason: "REQUIRED" });

    const detail = (await get(ops, `/admin/verification/provider/${p.orgId}`).expect(200)).body;
    const docId = detail.documents[0].id;
    expect(detail.documents[0]).toMatchObject({ kind: "LICENSE", status: "PENDING", expiryState: "VALID" });
    expect(JSON.stringify(detail)).not.toContain("partner-verification/"); // no raw storage path
    await post(ops, `/admin/verification/documents/${randomUUID()}/download`).send({ reason: "checking licence" }).expect(404);
    await post(ro, `/admin/verification/documents/${docId}/download`).send({ reason: "checking licence" }).expect(403);
    expect((await post(ops, `/admin/verification/documents/${docId}/download`).send({ reason: "checking licence" }).expect(201)).body).toHaveProperty("documentId", docId);
    await post(ops, `/admin/verification/documents/${docId}/review`).send({ decision: "REJECTED" }).expect(400); // rejection needs a reason
    await post(ops, `/admin/verification/documents/${docId}/review`).send({ decision: "ACCEPTED" }).expect(201);
    expect((await post(ops, `/admin/verification/documents/${docId}/review`).send({ decision: "ACCEPTED" }).expect(400)).body.error.details.reason).toBe("NOT_PENDING");
    await t("VERIFIED").expect(201);
    expect((await get(p.owner, "/provider/verification").expect(200)).body.lifecycle).toBe("APPROVED");
    expect(await db.notification.count({ where: { userId: p.owner.id, type: "partner.verification_updated" } })).toBe(2);
    expect(await db.adminAuditLog.count({ where: { entityId: p.orgId, action: { in: ["verification.status_changed", "verification.document_reviewed", "verification.document_opened"] } } })).toBe(4);
    // Legacy PATCH contract obeys the same rules.
    expect((await patch(ops, `/admin/providers/${p.orgId}/verification`).send({ status: "NOT_STARTED", reason: "jump back" }).expect(400)).body.error.details.reason).toBe("INVALID_TRANSITION");
    await patch(ops, `/admin/providers/${p.orgId}/verification`).send({ status: "SUSPENDED", reason: "complaints under review" }).expect(200);
    await t("VERIFIED", ops).expect(201); // reinstating a previously verified partner
  });

  it("expiry: accepted evidence past expiry becomes EXPIRED (task, no suspension); 30-day alert once; lifecycle reflects it", async () => {
    const p = await provider("GROOMER", "VERIFIED");
    const expired = await doc("PROVIDER", p.orgId, "ACCEPTED", new Date(Date.now() - DAY));
    const soon = await doc("PROVIDER", p.orgId, "ACCEPTED", new Date(Date.now() + 10 * DAY));
    const sweep = app.get(PartnerVerificationService);
    await sweep.sweepExpiry();
    await sweep.sweepExpiry();
    expect((await db.partnerVerificationDocument.findUniqueOrThrow({ where: { id: expired.id } })).status).toBe("EXPIRED");
    expect(await db.adminTask.count({ where: { dedupeKey: { in: [`verification-document-expired:${expired.id}`, `verification-document-expiring:${soon.id}`] } } })).toBe(2);
    expect(await db.notification.count({ where: { userId: p.owner.id, type: "partner.document_expiring" } })).toBe(1);
    expect((await db.providerOrganization.findUniqueOrThrow({ where: { id: p.orgId } })).verificationStatus).toBe("VERIFIED"); // never auto-suspended
    const status = (await get(p.owner, "/provider/verification").expect(200)).body;
    expect(status.documents.map((d: { expiryState: string }) => d.expiryState).sort()).toEqual(["EXPIRED", "EXPIRING_SOON"]);
    expect(status.lifecycle).toBe("APPROVED"); // one still-valid document
    await db.partnerVerificationDocument.update({ where: { id: soon.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await get(p.owner, "/provider/verification").expect(200)).body.lifecycle).toBe("EXPIRED");
  });

  it("automatic tasks are deduplicated under concurrency; privacy and high-severity rules raise one task each", async () => {
    const tasks = app.get(AutomaticTaskService);
    const key = `erpc-concurrency:${tag()}`;
    const results = await Promise.all(Array.from({ length: 6 }, () => tasks.raise({ dedupeKey: key, title: "race", source: "DATA_QUALITY", team: "OPS" })));
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await db.adminTask.count({ where: { dedupeKey: key } })).toBe(1);
    const reqId = randomUUID();
    const events = app.get((await import("../src/common/events/domain-events.service")).DomainEventsService);
    await events.publish("AccountDeletionRequested", { userId: randomUUID(), requestId: reqId });
    await events.publish("AccountDeletionRequested", { userId: randomUUID(), requestId: reqId });
    expect(await db.adminTask.count({ where: { dedupeKey: `privacy-deletion-request:${reqId}`, source: "PRIVACY_REQUEST" } })).toBe(1);
    const reportId = randomUUID();
    await events.publish("ContentReportSubmitted", { reportId, reason: "ANIMAL_WELFARE", targetType: "X", targetId: "y" });
    await events.publish("ContentReportSubmitted", { reportId: randomUUID(), reason: "SPAM", targetType: "X", targetId: "y" });
    expect(await db.adminTask.count({ where: { dedupeKey: `high-severity-report:${reportId}`, priority: "URGENT" } })).toBe(1);
    const admin = await actor("admin", AdminRole.SUPPORT);
    expect((await get(admin, "/admin/tasks?source=PRIVACY_REQUEST").expect(200)).body.items.every((t: { source: string }) => t.source === "PRIVACY_REQUEST")).toBe(true);
  });

  it("Provider 360, Clinic operations with entitlement overrides, Seller 360 with status and offer moderation", async () => {
    const root = await actor("root", AdminRole.SUPER_ADMIN);
    const ops = await actor("ops", AdminRole.PARTNER_OPERATIONS);
    const commerce = await actor("commerce", AdminRole.COMMERCE_OPERATIONS);
    const ro = await actor("ro", AdminRole.READ_ONLY);
    const member = await actor("member");
    const clinic = await provider("VET_CLINIC", "VERIFIED");

    const p360 = (await get(ops, `/admin/providers/${clinic.orgId}/overview`).expect(200)).body;
    expect(p360.organization).toMatchObject({ isClinic: true });
    expect(p360.finance).toEqual({ restricted: true });
    expect(p360.riskFlags.map((f: { code: string }) => f.code)).toContain("NO_ACTIVE_SERVICES");
    await get(member, `/admin/providers/${clinic.orgId}/overview`).expect(403);
    await get(ops, "/admin/providers/not-a-uuid/overview").expect(400);

    expect((await get(ops, `/admin/clinics?q=${encodeURIComponent("ERP-C")}`).expect(200)).body.items.map((c: { id: string }) => c.id)).toContain(clinic.orgId);
    const before = (await get(ops, `/admin/clinics/${clinic.orgId}/operations`).expect(200)).body;
    const staffMax = before.entitlements.find((e: { key: string }) => e.key === "clinic.staff.max");
    expect(before.subscription.pricing).toBe("PRODUCT_DECISION_LATER");
    await post(ops, `/admin/clinics/${clinic.orgId}/entitlement-overrides`).send({ key: "clinic.staff.max", limitValue: 40, reason: "pilot clinic" }).expect(403);
    await post(root, `/admin/clinics/${clinic.orgId}/entitlement-overrides`).send({ key: "clinic.nonexistent", boolValue: true, reason: "nope nope" }).expect(400);
    await post(root, `/admin/clinics/${clinic.orgId}/entitlement-overrides`).send({ key: "clinic.staff.max", boolValue: true, reason: "wrong type" }).expect(400);
    const ov = (await post(root, `/admin/clinics/${clinic.orgId}/entitlement-overrides`).send({ key: "clinic.staff.max", limitValue: 40, reason: "pilot clinic" }).expect(201)).body;
    const after = (await get(ops, `/admin/clinics/${clinic.orgId}/operations`).expect(200)).body;
    expect(after.entitlements.find((e: { key: string }) => e.key === "clinic.staff.max")).toMatchObject({ effectiveValue: 40, overridden: true, planValue: staffMax.planValue });
    expect(after.usage.staff.limit).toBe(40);
    const { ClinicEntitlementService } = await import("../src/modules/clinic-os/clinic-entitlement.service");
    expect((await app.get(ClinicEntitlementService).resolve(clinic.orgId)).entitlements["clinic.staff.max"]?.limit).toBe(40);
    await post(root, `/admin/clinics/${clinic.orgId}/entitlement-overrides/${ov.id}/revoke`).send({ reason: "pilot ended" }).expect(201);
    await post(root, `/admin/clinics/${clinic.orgId}/entitlement-overrides/${ov.id}/revoke`).send({ reason: "pilot ended" }).expect(404);
    expect((await app.get(ClinicEntitlementService).resolve(clinic.orgId)).entitlements["clinic.staff.max"]?.limit).toBe(staffMax.planValue);
    await get(ops, `/admin/clinics/${(await provider()).orgId}/operations`).expect(404); // a groomer is not a clinic

    // Seller 360 + operational status + offer moderation; the seller can't lift a staff suspension.
    const owner = await actor("seller-owner");
    const seller = await db.sellerOrganization.create({ data: { name: `ERP-C Seller ${tag()}`, verificationStatus: "VERIFIED", status: "ACTIVE", countryCode: "IR" } });
    await db.sellerMembership.create({ data: { sellerOrganizationId: seller.id, userId: owner.id, role: "OWNER" } });
    const cat = await db.productCategory.create({ data: { name: `Cat ${tag()}`, slug: `cat-${tag()}` } });
    const product = await db.product.create({ data: { categoryId: cat.id, title: `P ${tag()}`, slug: `p-${tag()}` } });
    const variant = await db.productVariant.create({ data: { productId: product.id, sku: `SKU-${tag()}` } });
    const offer = await db.sellerOffer.create({ data: { sellerOrganizationId: seller.id, productVariantId: variant.id, priceAmount: 100000, currency: "IRR" } });
    const s360 = (await get(commerce, `/admin/sellers/${seller.id}/overview`).expect(200)).body;
    expect(s360.seller).toMatchObject({ status: "ACTIVE", allowedStatusTransitions: ["SUSPENDED", "RESTRICTED", "INACTIVE"] });
    expect(s360.offers).toMatchObject({ ACTIVE: 1 });
    expect(Array.isArray(s360.settlements)).toBe(true); // COMMERCE_OPERATIONS holds sellerFinance.view
    expect((await get(ops, `/admin/sellers/${seller.id}/overview`).expect(200)).body.settlements).toEqual({ restricted: true });
    await post(ro, `/admin/commerce/offers/${offer.id}/status`).send({ status: "SUSPENDED", reason: "counterfeit" }).expect(403);
    await post(commerce, `/admin/commerce/offers/${offer.id}/status`).send({ status: "SUSPENDED", reason: "counterfeit report" }).expect(201);
    expect((await patch(owner, `/seller-organizations/${seller.id}/offers/${offer.id}`).send({ status: "ACTIVE" }).expect(403)).body.error.details.reason).toBe("OFFER_SUSPENDED_BY_STAFF");
    expect((await post(commerce, `/admin/sellers/${seller.id}/status`).send({ status: "CLOSED", reason: "skip ahead" }).expect(400)).body.error.details.reason).toBe("INVALID_TRANSITION");
    await post(commerce, `/admin/sellers/${seller.id}/status`).send({ status: "SUSPENDED", reason: "chargebacks" }).expect(201);
    expect((await patch(owner, `/seller-organizations/${seller.id}/offers/${offer.id}`).send({ priceAmount: 90000 }).expect(403)).body.error.details.reason).toBe("SELLER_SUSPENDED");
    await get(owner, `/seller-organizations/${seller.id}/verification`).expect(200); // history stays readable
    expect(await db.adminAuditLog.count({ where: { entityId: { in: [seller.id, offer.id] }, action: { in: ["seller.status_changed", "commerce.offer_status_changed"] } } })).toBe(2);
  });

  it("suspended providers disappear from booking and travel surfaces", async () => {
    const ops = await actor("ops", AdminRole.PARTNER_OPERATIONS);
    const hotel = await provider("TRAVEL_ACCOMMODATION", "VERIFIED");
    const listing = await db.travelListing.create({ data: { organizationId: hotel.orgId, type: "HOTEL", title: `ERP-C stay ${tag()}`, description: "x", country: "IR", city: `City-${tag()}`, latitude: 35.7, longitude: 51.4, bookingMode: "INSTANT_BOOKING", status: "PUBLISHED", isPubliclyListed: true, amenities: [], cancellationPolicy: "x" } });
    await get(null, `/travel/listings/${listing.id}`).expect(200);
    await post(ops, `/admin/verification/provider/${hotel.orgId}/transition`).send({ to: "SUSPENDED", reason: "safety complaint" }).expect(201);
    await get(null, `/travel/listings/${listing.id}`).expect(404);
    const groomer = await provider("GROOMER", "VERIFIED");
    const loc = await db.providerLocation.create({ data: { providerOrganizationId: groomer.orgId, addressLine: "x", city: "Tehran", countryCode: "IR", timezone: "UTC" } });
    const svc = await db.providerService.create({ data: { providerOrganizationId: groomer.orgId, locationId: loc.id, name: "Bath", type: "GROOMING_SESSION", category: "GROOMING", locationMode: "AT_PROVIDER", durationMinutes: 30 } });
    await get(null, `/provider-services/${svc.id}`).expect(200);
    await post(ops, `/admin/verification/provider/${groomer.orgId}/transition`).send({ to: "SUSPENDED", reason: "safety complaint" }).expect(201);
    await get(null, `/provider-services/${svc.id}`).expect(404);
    await get(null, "/provider-services/not-a-uuid").expect(400);
  });
});
