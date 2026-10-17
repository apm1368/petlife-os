import { Injectable } from "@nestjs/common";
import { BookingStatus, DisputeStatus, PartnerDocumentStatus, PartnerSubjectType, Prisma, ProviderType, SellerOfferStatus, SellerStatus, SubscriptionEntitlementType, TrustCaseStatus } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { NotFoundApiException, ValidationApiException } from "../../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto } from "../../../common/pagination/pagination.dto";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { roleHasPermission } from "../auth/admin-permissions";

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const DAY = 86400e3;
export const CLINIC_TYPES: ProviderType[] = [ProviderType.VET_CLINIC, ProviderType.VET_HOSPITAL];
const OPEN_DISPUTES: DisputeStatus[] = [DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW, DisputeStatus.AWAITING_EVIDENCE];
const OPEN_TRUST: TrustCaseStatus[] = [TrustCaseStatus.OPEN, TrustCaseStatus.UNDER_REVIEW];
const CANCELLED: BookingStatus[] = [BookingStatus.CANCELLED_BY_PROVIDER, BookingStatus.CANCELLED_BY_USER, BookingStatus.NO_SHOW];
/** Operational seller status changes staff may make (verification is separate, see PartnerVerificationService). */
const SELLER_TRANSITIONS: Record<SellerStatus, SellerStatus[]> = {
  PENDING: [SellerStatus.ACTIVE, SellerStatus.CLOSED],
  ACTIVE: [SellerStatus.SUSPENDED, SellerStatus.RESTRICTED, SellerStatus.INACTIVE],
  RESTRICTED: [SellerStatus.ACTIVE, SellerStatus.SUSPENDED],
  SUSPENDED: [SellerStatus.ACTIVE, SellerStatus.CLOSED],
  INACTIVE: [SellerStatus.ACTIVE],
  CLOSED: [],
};
const OFFER_TRANSITIONS: Record<SellerOfferStatus, SellerOfferStatus[]> = {
  ACTIVE: [SellerOfferStatus.SUSPENDED],
  PAUSED: [SellerOfferStatus.SUSPENDED],
  OUT_OF_STOCK: [SellerOfferStatus.SUSPENDED],
  SUSPENDED: [SellerOfferStatus.PAUSED],
};

type Flag = { code: string; severity: "HIGH" | "MEDIUM" | "LOW"; detail?: Record<string, unknown> };

/**
 * ERP-C partner 360s: providers (every type), clinic operations, sellers. Read models are counts/states over
 * source-of-truth tables plus deterministic risk flags; medical record bodies are never read here. Finance blocks
 * need finance.view / sellerFinance.view. Mutations: clinic entitlement overrides, seller status, offer suspension.
 */
@Injectable()
export class AdminPartner360Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
    private readonly events: DomainEventsService,
  ) {}

  private async verificationSummary(type: PartnerSubjectType, id: string) {
    const docs = await this.prisma.partnerVerificationDocument.groupBy({ by: ["status"], where: { subjectType: type, subjectId: id }, _count: { _all: true } });
    const expiringSoon = await this.prisma.partnerVerificationDocument.count({ where: { subjectType: type, subjectId: id, status: PartnerDocumentStatus.ACCEPTED, expiresAt: { gt: new Date(), lte: new Date(Date.now() + 30 * DAY) } } });
    return { documents: Object.fromEntries(docs.map((d) => [d.status, d._count._all])), expiringWithin30Days: expiringSoon };
  }

  private async recentAudit(entityTypes: string[], id: string) {
    const rows = await this.prisma.adminAuditLog.findMany({ where: { entityType: { in: entityTypes }, entityId: id }, orderBy: { createdAt: "desc" }, take: 10, include: { adminUser: { select: { role: true, user: { select: { displayName: true } } } } } });
    return rows.map((a) => ({ id: a.id, action: a.action, reason: a.reason, at: a.createdAt.toISOString(), admin: { displayName: a.adminUser.user.displayName, role: a.adminUser.role } }));
  }

  // ------------------------------------------------------------------ Provider 360
  async providerOverview(admin: ResolvedAdminContext, id: string) {
    const org = await this.prisma.providerOrganization.findUnique({ where: { id } });
    if (!org) throw new NotFoundApiException("Provider organization");
    const since = new Date(Date.now() - 30 * DAY);
    const [locations, staff, services, availabilityRules, bookingsAll, bookings30, reviews, hiddenReviews, disputes, trust, verification, clinicSub, audit] = await Promise.all([
      this.prisma.providerLocation.findMany({ where: { providerOrganizationId: id }, select: { id: true, city: true, addressLine: true } }),
      this.prisma.providerUser.findMany({ where: { providerOrganizationId: id, removedAt: null }, select: { id: true, role: true, displayTitle: true, user: { select: { displayName: true } } } }),
      this.prisma.providerService.groupBy({ by: ["isActive", "category"], where: { providerOrganizationId: id }, _count: { _all: true } }),
      this.prisma.providerAvailabilityRule.count({ where: { providerOrganizationId: id } }),
      this.prisma.booking.groupBy({ by: ["bookingStatus"], where: { providerOrganizationId: id }, _count: { _all: true } }),
      this.prisma.booking.groupBy({ by: ["bookingStatus"], where: { providerOrganizationId: id, startAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.providerReview.aggregate({ where: { providerOrganizationId: id, status: "PUBLISHED" }, _count: { _all: true }, _avg: { rating: true } }),
      this.prisma.providerReview.count({ where: { providerOrganizationId: id, status: "HIDDEN" } }),
      this.prisma.dispute.groupBy({ by: ["status"], where: { subjectType: "PROVIDER", subjectId: id }, _count: { _all: true } }),
      this.prisma.trustCase.groupBy({ by: ["status"], where: { subjectType: "PROVIDER", subjectId: id }, _count: { _all: true } }),
      this.verificationSummary(PartnerSubjectType.PROVIDER, id),
      this.prisma.clinicSubscription.findUnique({ where: { providerOrganizationId: id }, include: { plan: { select: { code: true } } } }),
      this.recentAudit(["PROVIDER_ORGANIZATION", "ProviderOrganization"], id),
    ]);
    const by = (rows: { bookingStatus: BookingStatus; _count: { _all: number } }[]) => Object.fromEntries(rows.map((r) => [r.bookingStatus, r._count._all]));
    const total = (rows: { _count: { _all: number } }[], pick: (r: never) => boolean = () => true) => rows.filter(pick as never).reduce((n, r) => n + r._count._all, 0);
    const completed = bookingsAll.find((b) => b.bookingStatus === BookingStatus.COMPLETED)?._count._all ?? 0;
    const cancelled = total(bookingsAll.filter((b) => CANCELLED.includes(b.bookingStatus)));
    const settled = completed + cancelled;
    const openDisputes = total(disputes.filter((d) => OPEN_DISPUTES.includes(d.status)));
    const openTrust = total(trust.filter((t) => OPEN_TRUST.includes(t.status)));
    const flags: Flag[] = [];
    if (org.verificationStatus === "SUSPENDED" || org.verificationStatus === "REJECTED") flags.push({ code: `VERIFICATION_${org.verificationStatus}`, severity: "HIGH" });
    if ((verification.documents.EXPIRED ?? 0) > 0) flags.push({ code: "EXPIRED_VERIFICATION_DOCUMENT", severity: "MEDIUM", detail: { count: verification.documents.EXPIRED } });
    if (verification.expiringWithin30Days > 0) flags.push({ code: "DOCUMENT_EXPIRING_SOON", severity: "LOW", detail: { count: verification.expiringWithin30Days } });
    if (settled >= 10 && cancelled / settled > 0.3) flags.push({ code: "HIGH_CANCELLATION_RATE", severity: "MEDIUM", detail: { rate: Math.round((cancelled / settled) * 100) / 100 } });
    if (reviews._count._all >= 5 && (reviews._avg.rating ?? 5) < 3) flags.push({ code: "LOW_RATING", severity: "MEDIUM", detail: { average: reviews._avg.rating } });
    if (openDisputes) flags.push({ code: "OPEN_DISPUTES", severity: "MEDIUM", detail: { count: openDisputes } });
    if (openTrust) flags.push({ code: "OPEN_TRUST_CASES", severity: "HIGH", detail: { count: openTrust } });
    if (org.verificationStatus === "VERIFIED" && !total(services.filter((s) => s.isActive))) flags.push({ code: "NO_ACTIVE_SERVICES", severity: "LOW" });
    return {
      organization: { id: org.id, name: org.name, type: org.type, isClinic: CLINIC_TYPES.includes(org.type), createdAt: org.createdAt.toISOString() },
      verification: { status: org.verificationStatus, submittedAt: iso(org.verificationSubmittedAt), note: org.verificationNote, ...verification },
      branches: locations,
      staff: { total: staff.length, byRole: staff.reduce<Record<string, number>>((m, s) => ({ ...m, [s.role]: (m[s.role] ?? 0) + 1 }), {}), members: staff.map((s) => ({ id: s.id, role: s.role, displayTitle: s.displayTitle, displayName: s.user.displayName })) },
      services: { active: total(services.filter((s) => s.isActive)), inactive: total(services.filter((s) => !s.isActive)), byCategory: services.reduce<Record<string, number>>((m, s) => ({ ...m, [s.category]: (m[s.category] ?? 0) + s._count._all }), {}) },
      availability: { rules: availabilityRules },
      bookings: { allTime: by(bookingsAll), last30Days: by(bookings30), completionRate: settled ? Math.round((completed / settled) * 100) / 100 : null },
      reviews: { published: reviews._count._all, averageRating: reviews._avg.rating, hidden: hiddenReviews },
      complaints: { disputes: Object.fromEntries(disputes.map((d) => [d.status, d._count._all])), trustCases: Object.fromEntries(trust.map((t) => [t.status, t._count._all])) },
      finance: roleHasPermission(admin.role, "finance.view") ? { settlement: "PRODUCT_DECISION_REQUIRED", note: "Provider/clinic settlement economics are not decided; no provider payouts exist." } : { restricted: true },
      subscription: clinicSub ? { context: "CLINIC", planCode: clinicSub.plan.code, status: clinicSub.status, currentPeriodEndsAt: iso(clinicSub.currentPeriodEndsAt) } : null,
      riskFlags: flags,
      recentAdminActions: audit,
    };
  }

  // ------------------------------------------------------------------ Clinic operations
  async clinics(q: { q?: string; page?: number; pageSize?: number }) {
    const { page, pageSize, skip, take } = resolvePagination(q);
    const where: Prisma.ProviderOrganizationWhereInput = { type: { in: CLINIC_TYPES }, ...(q.q ? { name: { contains: q.q, mode: "insensitive" } } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.providerOrganization.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { _count: { select: { locations: true } } } }),
      this.prisma.providerOrganization.count({ where }),
    ]);
    const ids = rows.map((r) => r.id);
    const [subs, staff] = await Promise.all([
      this.prisma.clinicSubscription.findMany({ where: { providerOrganizationId: { in: ids } }, include: { plan: { select: { code: true } } } }),
      this.prisma.providerUser.groupBy({ by: ["providerOrganizationId"], where: { providerOrganizationId: { in: ids }, removedAt: null }, _count: { _all: true } }),
    ]);
    return toPaginatedDto(rows.map((r) => {
      const sub = subs.find((s) => s.providerOrganizationId === r.id);
      return { id: r.id, name: r.name, type: r.type, verificationStatus: r.verificationStatus, planCode: sub?.plan.code ?? null, subscriptionStatus: sub?.status ?? null, staffCount: staff.find((s) => s.providerOrganizationId === r.id)?._count._all ?? 0, branchCount: r._count.locations, createdAt: r.createdAt.toISOString() };
    }), total, page, pageSize);
  }

  /** Effective clinic entitlements without side effects (ClinicEntitlementService.resolve lazily creates rows). */
  private async clinicEntitlements(orgId: string) {
    const sub = await this.prisma.clinicSubscription.findUnique({ where: { providerOrganizationId: orgId }, include: { plan: { include: { entitlements: true } }, changes: { orderBy: { createdAt: "desc" }, take: 10 } } });
    const plan = sub?.plan ?? (await this.prisma.clinicPlan.findFirst({ where: { isDefault: true }, include: { entitlements: true } }));
    const overrides = await this.prisma.clinicEntitlementOverride.findMany({ where: { providerOrganizationId: orgId }, orderBy: { createdAt: "desc" } });
    const now = new Date();
    const live = overrides.filter((o) => o.active && (!o.expiresAt || o.expiresAt > now));
    const entitlements = (plan?.entitlements ?? []).map((e) => {
      const o = live.filter((x) => x.key === e.key).at(-1) ?? live.find((x) => x.key === e.key);
      const planValue = e.type === SubscriptionEntitlementType.BOOLEAN ? e.boolValue === true : e.limitValue;
      const effective = o ? (e.type === SubscriptionEntitlementType.BOOLEAN ? o.boolValue === true : o.unlimited ? null : o.limitValue) : planValue;
      return { key: e.key, type: e.type, planValue, effectiveValue: effective, overridden: Boolean(o) };
    });
    return { sub, plan, overrides, entitlements };
  }

  async clinicOperations(admin: ResolvedAdminContext, orgId: string) {
    const org = await this.prisma.providerOrganization.findUnique({ where: { id: orgId } });
    if (!org || !CLINIC_TYPES.includes(org.type)) throw new NotFoundApiException("Clinic");
    const since = new Date(Date.now() - 30 * DAY);
    const [{ sub, plan, overrides, entitlements }, staff, branches, bookingPets, contacts, importBatches, appts, visits, vitals, reminders, failedReminders] = await Promise.all([
      this.clinicEntitlements(orgId),
      this.prisma.providerUser.count({ where: { providerOrganizationId: orgId, removedAt: null } }),
      this.prisma.providerLocation.count({ where: { providerOrganizationId: orgId } }),
      this.prisma.booking.findMany({ where: { providerOrganizationId: orgId }, distinct: ["petId"], select: { petId: true } }),
      this.prisma.clinicImportedContact.count({ where: { providerOrganizationId: orgId } }),
      this.prisma.clinicImportedContact.groupBy({ by: ["importBatchId"], where: { providerOrganizationId: orgId }, _count: { _all: true }, _min: { createdAt: true } }),
      this.prisma.booking.groupBy({ by: ["bookingStatus"], where: { providerOrganizationId: orgId, startAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.clinicalVisit.count({ where: { providerOrganizationId: orgId } }),
      this.prisma.patientVitalsRecord.count({ where: { providerOrganizationId: orgId } }),
      this.prisma.clinicReminder.groupBy({ by: ["status"], where: { providerOrganizationId: orgId }, _count: { _all: true } }),
      this.prisma.clinicReminder.findMany({ where: { providerOrganizationId: orgId, status: "FAILED" }, orderBy: { updatedAt: "desc" }, take: 10, select: { id: true, kind: true, updatedAt: true } }),
    ]);
    const limitOf = (key: string) => entitlements.find((e) => e.key === key)?.effectiveValue ?? null;
    return {
      clinic: { id: org.id, name: org.name, type: org.type, verificationStatus: org.verificationStatus },
      subscription: { planCode: plan?.code ?? null, assigned: Boolean(sub), status: sub?.status ?? "DEFAULT_PLAN", currentPeriodEndsAt: iso(sub?.currentPeriodEndsAt), history: (sub?.changes ?? []).map((c) => ({ type: c.type, fromPlanCode: c.fromPlanCode, toPlanCode: c.toPlanCode, reason: c.reason, actorAdminUserId: c.actorAdminUserId, at: c.createdAt.toISOString() })), pricing: "PRODUCT_DECISION_LATER" },
      entitlements,
      overrides: overrides.map((o) => ({ id: o.id, key: o.key, boolValue: o.boolValue, limitValue: o.limitValue, unlimited: o.unlimited, reason: o.reason, expiresAt: iso(o.expiresAt), active: o.active && (!o.expiresAt || o.expiresAt > new Date()), revokedAt: iso(o.revokedAt), createdByAdminId: o.createdByAdminId, createdAt: o.createdAt.toISOString() })),
      usage: { staff: { used: staff, limit: limitOf("clinic.staff.max") }, branches: { used: branches, limit: limitOf("clinic.branches.max") } },
      customers: { petsWithBookings: bookingPets.length, importedContacts: contacts },
      appointmentsLast30Days: Object.fromEntries(appts.map((a) => [a.bookingStatus, a._count._all])),
      medicalActivity: { clinicalVisits: visits, vitalsRecords: vitals },
      reminders: Object.fromEntries(reminders.map((r) => [r.status, r._count._all])),
      imports: importBatches.filter((b) => b.importBatchId).map((b) => ({ batchId: b.importBatchId, contacts: b._count._all, importedAt: iso(b._min.createdAt) })),
      operationalErrors: { failedReminders: failedReminders.map((r) => ({ id: r.id, kind: r.kind, at: r.updatedAt.toISOString() })) },
      finance: roleHasPermission(admin.role, "finance.view") ? { settlement: "PRODUCT_DECISION_REQUIRED" } : { restricted: true },
      recentAdminActions: await this.recentAudit(["PROVIDER_ORGANIZATION", "ProviderOrganization", "ClinicSubscription"], orgId),
    };
  }

  async createClinicOverride(admin: ResolvedAdminContext, orgId: string, input: { key: string; boolValue?: boolean; limitValue?: number; unlimited?: boolean; reason: string; expiresAt?: string }) {
    const org = await this.prisma.providerOrganization.findUnique({ where: { id: orgId } });
    if (!org || !CLINIC_TYPES.includes(org.type)) throw new NotFoundApiException("Clinic");
    const def = await this.prisma.clinicPlanEntitlement.findFirst({ where: { key: input.key }, select: { type: true } });
    if (!def) throw new ValidationApiException({ field: "key", reason: "UNKNOWN_ENTITLEMENT" });
    const isBool = def.type === SubscriptionEntitlementType.BOOLEAN;
    if (isBool ? typeof input.boolValue !== "boolean" : !(input.unlimited || (Number.isInteger(input.limitValue) && (input.limitValue as number) >= 0))) throw new ValidationApiException({ field: isBool ? "boolValue" : "limitValue", reason: "VALUE_REQUIRED_FOR_TYPE", type: def.type });
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) throw new ValidationApiException({ field: "expiresAt", reason: "IN_THE_PAST" });
    return this.prisma.$transaction(async (tx) => {
      // One live override per key: a new one replaces the previous.
      await tx.clinicEntitlementOverride.updateMany({ where: { providerOrganizationId: orgId, key: input.key, active: true }, data: { active: false, revokedAt: new Date(), revokedByAdminId: admin.adminUserId } });
      const row = await tx.clinicEntitlementOverride.create({ data: { providerOrganizationId: orgId, key: input.key, boolValue: isBool ? input.boolValue : null, limitValue: isBool || input.unlimited ? null : input.limitValue, unlimited: !isBool && Boolean(input.unlimited), reason: input.reason, createdByAdminId: admin.adminUserId, expiresAt } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "clinic.entitlement_overridden", entityType: "PROVIDER_ORGANIZATION", entityId: orgId, reason: input.reason, afterSummary: { key: input.key, boolValue: row.boolValue, limitValue: row.limitValue, unlimited: row.unlimited, expiresAt: iso(expiresAt) }, tx });
      await this.events.publish("ClinicEntitlementOverridden", { providerOrganizationId: orgId, key: input.key, overrideId: row.id }, { tx, aggregateType: "ProviderOrganization", aggregateId: orgId });
      return { id: row.id, key: row.key, active: true };
    });
  }

  async revokeClinicOverride(admin: ResolvedAdminContext, orgId: string, overrideId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const done = await tx.clinicEntitlementOverride.updateMany({ where: { id: overrideId, providerOrganizationId: orgId, active: true }, data: { active: false, revokedAt: new Date(), revokedByAdminId: admin.adminUserId } });
      if (!done.count) throw new NotFoundApiException("Active clinic override");
      await this.audit.record({ adminUserId: admin.adminUserId, action: "clinic.entitlement_override_revoked", entityType: "PROVIDER_ORGANIZATION", entityId: orgId, reason, afterSummary: { overrideId }, tx });
      return { id: overrideId, active: false };
    });
  }

  // ------------------------------------------------------------------ Seller 360
  async sellerOverview(admin: ResolvedAdminContext, id: string) {
    const seller = await this.prisma.sellerOrganization.findUnique({ where: { id } });
    if (!seller) throw new NotFoundApiException("Seller organization");
    const offerScope = { sellerOffer: { sellerOrganizationId: id } };
    const [members, offers, products, outOfStock, lowStock, orders, refunds, settlements, reviews, disputes, trust, verification, audit] = await Promise.all([
      this.prisma.sellerMembership.findMany({ where: { sellerOrganizationId: id }, select: { id: true, role: true, status: true, user: { select: { displayName: true } } } }),
      this.prisma.sellerOffer.groupBy({ by: ["status"], where: { sellerOrganizationId: id }, _count: { _all: true } }),
      this.prisma.product.count({ where: { variants: { some: { offers: { some: { sellerOrganizationId: id } } } } } }),
      this.prisma.inventoryItem.count({ where: { ...offerScope, onHand: { lte: 0 } } }),
      this.prisma.inventoryItem.count({ where: { ...offerScope, onHand: { gt: 0, lte: 5 } } }),
      this.prisma.order.groupBy({ by: ["status"], where: { items: { some: offerScope } }, _count: { _all: true } }),
      this.prisma.refund.groupBy({ by: ["status"], where: { order: { items: { some: offerScope } } }, _count: { _all: true }, _sum: { amount: true } }),
      this.prisma.sellerSettlement.groupBy({ by: ["status"], where: { sellerOrganizationId: id }, _count: { _all: true }, _sum: { netIrr: true } }),
      this.prisma.productReview.aggregate({ where: { product: { variants: { some: { offers: { some: { sellerOrganizationId: id } } } } } }, _count: { _all: true }, _avg: { rating: true } }),
      this.prisma.dispute.groupBy({ by: ["status"], where: { subjectType: "SELLER", subjectId: id }, _count: { _all: true } }),
      this.prisma.trustCase.groupBy({ by: ["status"], where: { subjectType: "SELLER", subjectId: id }, _count: { _all: true } }),
      this.verificationSummary(PartnerSubjectType.SELLER, id),
      this.recentAudit(["SELLER_ORGANIZATION", "SellerOrganization"], id),
    ]);
    const financeAllowed = roleHasPermission(admin.role, "sellerFinance.view");
    const flags: Flag[] = [];
    if (seller.status === SellerStatus.SUSPENDED || seller.status === SellerStatus.RESTRICTED) flags.push({ code: `SELLER_${seller.status}`, severity: "HIGH" });
    if (seller.verificationStatus !== "VERIFIED") flags.push({ code: "NOT_VERIFIED", severity: "MEDIUM", detail: { status: seller.verificationStatus } });
    if (outOfStock) flags.push({ code: "OUT_OF_STOCK_OFFERS", severity: "LOW", detail: { count: outOfStock } });
    const recon = settlements.find((s) => s.status === "RECONCILIATION_REQUIRED" || s.status === "FAILED");
    if (recon) flags.push({ code: "SETTLEMENT_NEEDS_ATTENTION", severity: "HIGH" });
    const openTrust = trust.filter((t) => OPEN_TRUST.includes(t.status)).reduce((n, t) => n + t._count._all, 0);
    if (openTrust) flags.push({ code: "OPEN_TRUST_CASES", severity: "HIGH", detail: { count: openTrust } });
    return {
      seller: { id: seller.id, name: seller.name, status: seller.status, allowedStatusTransitions: SELLER_TRANSITIONS[seller.status], createdAt: seller.createdAt.toISOString() },
      verification: { status: seller.verificationStatus, submittedAt: iso(seller.verificationSubmittedAt), note: seller.verificationNote, ...verification },
      members: members.map((m) => ({ id: m.id, role: m.role, status: m.status, displayName: m.user.displayName })),
      offers: Object.fromEntries(offers.map((o) => [o.status, o._count._all])),
      products,
      inventory: { outOfStock, lowStock },
      orders: Object.fromEntries(orders.map((o) => [o.status, o._count._all])),
      refunds: financeAllowed ? refunds.map((r) => ({ status: r.status, count: r._count._all, amountIrr: r._sum.amount ?? 0 })) : { restricted: true },
      settlements: financeAllowed ? settlements.map((s) => ({ status: s.status, count: s._count._all, netIrr: s._sum.netIrr ?? 0 })) : { restricted: true },
      reviews: { count: reviews._count._all, averageRating: reviews._avg.rating },
      violations: { disputes: Object.fromEntries(disputes.map((d) => [d.status, d._count._all])), trustCases: Object.fromEntries(trust.map((t) => [t.status, t._count._all])) },
      riskFlags: flags,
      recentAdminActions: audit,
    };
  }

  async setSellerStatus(admin: ResolvedAdminContext, id: string, to: SellerStatus, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const seller = await tx.sellerOrganization.findUnique({ where: { id } });
      if (!seller) throw new NotFoundApiException("Seller organization");
      if (!SELLER_TRANSITIONS[seller.status].includes(to)) throw new ValidationApiException({ field: "status", reason: "INVALID_TRANSITION", from: seller.status, to, allowed: SELLER_TRANSITIONS[seller.status] });
      const done = await tx.sellerOrganization.updateMany({ where: { id, status: seller.status }, data: { status: to } });
      if (!done.count) throw new ValidationApiException({ field: "status", reason: "CHANGED_CONCURRENTLY" });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "seller.status_changed", entityType: "SELLER_ORGANIZATION", entityId: id, reason, beforeSummary: { status: seller.status }, afterSummary: { status: to }, tx });
      await this.events.publish("SellerStatusChanged", { sellerOrganizationId: id, from: seller.status, to }, { tx, aggregateType: "SellerOrganization", aggregateId: id });
      return { id, status: to };
    });
  }

  async setOfferStatus(admin: ResolvedAdminContext, offerId: string, to: SellerOfferStatus, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const offer = await tx.sellerOffer.findUnique({ where: { id: offerId } });
      if (!offer) throw new NotFoundApiException("Seller offer");
      if (!OFFER_TRANSITIONS[offer.status].includes(to)) throw new ValidationApiException({ field: "status", reason: "INVALID_TRANSITION", from: offer.status, to });
      const done = await tx.sellerOffer.updateMany({ where: { id: offerId, status: offer.status }, data: { status: to } });
      if (!done.count) throw new ValidationApiException({ field: "status", reason: "CHANGED_CONCURRENTLY" });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "commerce.offer_status_changed", entityType: "SELLER_OFFER", entityId: offerId, reason, beforeSummary: { status: offer.status }, afterSummary: { status: to, sellerOrganizationId: offer.sellerOrganizationId }, tx });
      return { id: offerId, status: to };
    });
  }
}
