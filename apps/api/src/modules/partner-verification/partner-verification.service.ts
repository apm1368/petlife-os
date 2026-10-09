import { Injectable } from "@nestjs/common";
import { AdminPriority, AdminTaskSource, NotificationCategory, PartnerDocumentKind, PartnerDocumentStatus, PartnerSubjectType, ProviderUserRole, ProviderVerificationStatus as VS, SellerMembershipRole, SellerMembershipStatus, type Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { StorageService } from "../storage/storage.service";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";
import { AdminAuditLogService } from "../admin/audit/admin-audit-log.service";
import { AutomaticTaskService } from "../admin/task/automatic-task.service";
import type { ResolvedAdminContext } from "../admin/auth/admin-context.types";
import { DOC_KIND_FA } from "../admin/task/task-titles";

/** Provider and seller verification share one status vocabulary (identical enums). */
type Status = VS;
const SUBMITTABLE: Status[] = [VS.NOT_STARTED, VS.NEEDS_INFORMATION, VS.REJECTED];
/** Staff transitions. SUBMITTED is only ever reached by the partner's own submit. */
export const ADMIN_TRANSITIONS: Record<Status, Status[]> = {
  NOT_STARTED: [VS.NEEDS_INFORMATION],
  SUBMITTED: [VS.UNDER_REVIEW, VS.NEEDS_INFORMATION, VS.REJECTED, VS.VERIFIED],
  UNDER_REVIEW: [VS.VERIFIED, VS.REJECTED, VS.NEEDS_INFORMATION],
  NEEDS_INFORMATION: [VS.REJECTED],
  REJECTED: [],
  VERIFIED: [VS.SUSPENDED, VS.NEEDS_INFORMATION],
  SUSPENDED: [VS.VERIFIED, VS.REJECTED],
};
const NEEDS_REASON: Status[] = [VS.NEEDS_INFORMATION, VS.REJECTED, VS.SUSPENDED];
export const EXPIRY_ALERT_DAYS = 30;

/**
 * Product-facing lifecycle label over the stored status (the stored enum is shared with discovery/checkout and stays).
 * VERIFIED whose accepted evidence has all expired reads EXPIRED; NEEDS_INFORMATION = staff asked for resubmission.
 */
export type VerificationLifecycle = "NOT_SUBMITTED" | "PENDING" | "UNDER_REVIEW" | "RESUBMISSION_REQUESTED" | "APPROVED" | "REJECTED" | "EXPIRED" | "SUSPENDED";
export function lifecycleOf(status: Status, hasValidEvidence: boolean, hadExpiringEvidence: boolean): VerificationLifecycle {
  switch (status) {
    case VS.NOT_STARTED: return "NOT_SUBMITTED";
    case VS.SUBMITTED: return "PENDING";
    case VS.UNDER_REVIEW: return "UNDER_REVIEW";
    case VS.NEEDS_INFORMATION: return "RESUBMISSION_REQUESTED";
    case VS.REJECTED: return "REJECTED";
    case VS.SUSPENDED: return "SUSPENDED";
    default: return !hasValidEvidence && hadExpiringEvidence ? "EXPIRED" : "APPROVED";
  }
}

type Subject = { type: PartnerSubjectType; id: string };
const prefix = (s: Subject) => `partner-verification/${s.type === PartnerSubjectType.PROVIDER ? "provider" : "seller"}/${s.id}/`;
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

/**
 * ERP-C partner verification (providers + sellers): partners upload private evidence and submit; staff review each
 * document, then move the organisation through an explicit transition table. VERIFIED needs at least one ACCEPTED,
 * unexpired document (never "verified" without evidence) — except reinstating a SUSPENDED partner that was verified
 * before. Every staff step is audited, notifies the partner's owners, and submission raises a Partner Ops task.
 */
@Injectable()
export class PartnerVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly events: DomainEventsService,
    private readonly audit: AdminAuditLogService,
    private readonly tasks: AutomaticTaskService,
    private readonly notifications: NotificationOrchestratorService,
  ) {}

  // ------------------------------------------------------------------ shared reads
  private async org(s: Subject) {
    if (s.type === PartnerSubjectType.PROVIDER) {
      const o = await this.prisma.providerOrganization.findUnique({ where: { id: s.id }, select: { id: true, name: true, type: true, verificationStatus: true, verificationSubmittedAt: true, verificationNote: true } });
      if (!o) throw new NotFoundApiException("Provider organization");
      return { ...o, kind: o.type as string };
    }
    const o = await this.prisma.sellerOrganization.findUnique({ where: { id: s.id }, select: { id: true, name: true, verificationStatus: true, verificationSubmittedAt: true, verificationNote: true } });
    if (!o) throw new NotFoundApiException("Seller organization");
    return { ...o, verificationStatus: o.verificationStatus as unknown as Status, kind: "SELLER" };
  }

  private docDto(d: Prisma.PartnerVerificationDocumentGetPayload<object>, now = new Date()) {
    const expired = d.status === PartnerDocumentStatus.EXPIRED || (d.expiresAt !== null && d.expiresAt <= now);
    const soon = !expired && d.expiresAt !== null && d.expiresAt.getTime() - now.getTime() <= EXPIRY_ALERT_DAYS * 86400e3;
    return {
      id: d.id, kind: d.kind, status: expired && d.status === PartnerDocumentStatus.ACCEPTED ? PartnerDocumentStatus.EXPIRED : d.status, mimeType: d.mimeType, fileSizeBytes: d.fileSizeBytes,
      expiresAt: iso(d.expiresAt), expiryState: d.expiresAt === null ? "NO_EXPIRY" : expired ? "EXPIRED" : soon ? "EXPIRING_SOON" : "VALID",
      reviewNote: d.reviewNote, rejectionReason: d.status === PartnerDocumentStatus.REJECTED ? d.reviewNote : null,
      submittedAt: d.createdAt.toISOString(), createdAt: d.createdAt.toISOString(), reviewedAt: iso(d.reviewedAt), reviewedByAdminId: d.reviewedByAdminId,
    };
  }

  async status(s: Subject) {
    const [o, docs] = await Promise.all([this.org(s), this.prisma.partnerVerificationDocument.findMany({ where: { subjectType: s.type, subjectId: s.id }, orderBy: { createdAt: "desc" } })]);
    const now = new Date();
    const accepted = docs.filter((d) => d.status === PartnerDocumentStatus.ACCEPTED || d.status === PartnerDocumentStatus.EXPIRED);
    const valid = accepted.some((d) => d.status === PartnerDocumentStatus.ACCEPTED && (!d.expiresAt || d.expiresAt > now));
    return { status: o.verificationStatus, lifecycle: lifecycleOf(o.verificationStatus, valid, accepted.some((d) => d.expiresAt !== null)), submittedAt: iso(o.verificationSubmittedAt), note: o.verificationNote, canSubmit: SUBMITTABLE.includes(o.verificationStatus) && docs.some((d) => d.status === PartnerDocumentStatus.PENDING), documents: docs.map((d) => this.docDto(d)) };
  }

  // ------------------------------------------------------------------ partner side
  requestUpload(s: Subject, contentType: string, fileSizeBytes: number) {
    return this.storage.createPartnerVerificationUploadTarget(s.type === PartnerSubjectType.PROVIDER ? "provider" : "seller", s.id, contentType, fileSizeBytes);
  }

  async registerDocument(s: Subject, userId: string, input: { objectKey: string; kind: PartnerDocumentKind; mimeType: string; fileSizeBytes: number; expiresAt?: string }) {
    if (!input.objectKey.startsWith(prefix(s)) || input.objectKey.includes("..")) throw new ValidationApiException({ field: "objectKey", reason: "NOT_ISSUED_FOR_THIS_ORGANIZATION" });
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) throw new ValidationApiException({ field: "expiresAt", reason: "ALREADY_EXPIRED" });
    const o = await this.org(s);
    if (o.verificationStatus === VS.SUBMITTED || o.verificationStatus === VS.UNDER_REVIEW) throw new ValidationApiException({ field: "status", reason: "UNDER_REVIEW_LOCKED" });
    if ((await this.prisma.partnerVerificationDocument.count({ where: { subjectType: s.type, subjectId: s.id, status: PartnerDocumentStatus.PENDING } })) >= 10) throw new ValidationApiException({ field: "objectKey", reason: "TOO_MANY_PENDING" });
    await this.prisma.partnerVerificationDocument.create({ data: { subjectType: s.type, subjectId: s.id, kind: input.kind, objectKey: input.objectKey, mimeType: input.mimeType, fileSizeBytes: input.fileSizeBytes, expiresAt, uploadedByUserId: userId } });
    return this.status(s);
  }

  async submit(s: Subject, userId: string) {
    const submittedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const o = await this.org(s);
      if (!SUBMITTABLE.includes(o.verificationStatus)) throw new ValidationApiException({ field: "status", reason: "NOT_SUBMITTABLE", status: o.verificationStatus });
      if (!(await tx.partnerVerificationDocument.count({ where: { subjectType: s.type, subjectId: s.id, status: PartnerDocumentStatus.PENDING } }))) throw new ValidationApiException({ field: "documents", reason: "DOCUMENT_REQUIRED" });
      const data = { verificationStatus: VS.SUBMITTED, verificationSubmittedAt: submittedAt, verificationNote: null };
      const done = s.type === PartnerSubjectType.PROVIDER
        ? await tx.providerOrganization.updateMany({ where: { id: s.id, verificationStatus: o.verificationStatus }, data })
        : await tx.sellerOrganization.updateMany({ where: { id: s.id, verificationStatus: o.verificationStatus as never }, data: data as never });
      if (!done.count) throw new ValidationApiException({ field: "status", reason: "CHANGED_CONCURRENTLY" });
      await this.events.publish("PartnerVerificationSubmitted", { subjectType: s.type, subjectId: s.id, actorUserId: userId }, { tx, aggregateType: s.type === PartnerSubjectType.PROVIDER ? "ProviderOrganization" : "SellerOrganization", aggregateId: s.id });
      await this.tasks.raise({ dedupeKey: `verification-submitted:${s.type}:${s.id}:${submittedAt.toISOString()}`, title: `ارسال مدارک احراز: ${o.name}`, source: AdminTaskSource.PARTNER_VERIFICATION, team: "PARTNER_OPERATIONS", priority: AdminPriority.NORMAL, relatedEntityType: s.type === PartnerSubjectType.PROVIDER ? "PROVIDER_ORGANIZATION" : "SELLER_ORGANIZATION", relatedEntityId: s.id, dueAt: new Date(submittedAt.getTime() + 3 * 86400e3) }, tx);
    });
    return this.status(s);
  }

  // ------------------------------------------------------------------ staff side
  async queue(q: { subjectType?: PartnerSubjectType; status?: Status }) {
    const statuses = q.status ? [q.status] : [VS.SUBMITTED, VS.UNDER_REVIEW, VS.NEEDS_INFORMATION];
    const [providers, sellers] = await Promise.all([
      q.subjectType === PartnerSubjectType.SELLER ? [] : this.prisma.providerOrganization.findMany({ where: { verificationStatus: { in: statuses } }, select: { id: true, name: true, type: true, verificationStatus: true, verificationSubmittedAt: true }, take: 200 }),
      q.subjectType === PartnerSubjectType.PROVIDER ? [] : this.prisma.sellerOrganization.findMany({ where: { verificationStatus: { in: statuses as never } }, select: { id: true, name: true, verificationStatus: true, verificationSubmittedAt: true }, take: 200 }),
    ]);
    const ids = [...providers.map((p) => p.id), ...sellers.map((s) => s.id)];
    const counts = await this.prisma.partnerVerificationDocument.groupBy({ by: ["subjectId", "status"], where: { subjectId: { in: ids } }, _count: { _all: true } });
    const docCount = (id: string, st: PartnerDocumentStatus) => counts.find((c) => c.subjectId === id && c.status === st)?._count._all ?? 0;
    const now = Date.now();
    const rows = [
      ...providers.map((p) => ({ subjectType: PartnerSubjectType.PROVIDER, id: p.id, name: p.name, kind: p.type as string, status: p.verificationStatus as Status, submittedAt: p.verificationSubmittedAt })),
      ...sellers.map((s) => ({ subjectType: PartnerSubjectType.SELLER, id: s.id, name: s.name, kind: "SELLER", status: s.verificationStatus as unknown as Status, submittedAt: s.verificationSubmittedAt })),
    ];
    return rows
      .sort((a, b) => (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0))
      .map((r) => ({ ...r, submittedAt: iso(r.submittedAt), waitingHours: r.submittedAt ? Math.round((now - r.submittedAt.getTime()) / 3600e3) : null, documents: { pending: docCount(r.id, PartnerDocumentStatus.PENDING), accepted: docCount(r.id, PartnerDocumentStatus.ACCEPTED), rejected: docCount(r.id, PartnerDocumentStatus.REJECTED), expired: docCount(r.id, PartnerDocumentStatus.EXPIRED) } }));
  }

  async adminDetail(s: Subject) {
    const [o, st] = await Promise.all([this.org(s), this.status(s)]);
    return { subjectType: s.type, id: o.id, name: o.name, kind: o.kind, ...st, allowedTransitions: ADMIN_TRANSITIONS[o.verificationStatus] };
  }

  async documentDownload(admin: ResolvedAdminContext, documentId: string, reason: string) {
    const doc = await this.prisma.partnerVerificationDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw new NotFoundApiException("Verification document");
    const target = await this.storage.createPrivateDownloadTarget(doc.objectKey);
    await this.audit.record({ adminUserId: admin.adminUserId, action: "verification.document_opened", entityType: doc.subjectType === PartnerSubjectType.PROVIDER ? "PROVIDER_ORGANIZATION" : "SELLER_ORGANIZATION", entityId: doc.subjectId, reason, afterSummary: { documentId, kind: doc.kind } });
    return { documentId, ...target };
  }

  async reviewDocument(admin: ResolvedAdminContext, documentId: string, input: { decision: "ACCEPTED" | "REJECTED"; note?: string; expiresAt?: string }) {
    if (input.decision === "REJECTED" && !input.note) throw new ValidationApiException({ field: "note", reason: "REQUIRED_FOR_REJECTION" });
    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.partnerVerificationDocument.findUnique({ where: { id: documentId } });
      if (!doc) throw new NotFoundApiException("Verification document");
      if (doc.status !== PartnerDocumentStatus.PENDING) throw new ValidationApiException({ field: "documentId", reason: "NOT_PENDING", status: doc.status });
      const expiresAt = input.expiresAt ? new Date(input.expiresAt) : doc.expiresAt;
      if (input.decision === "ACCEPTED" && expiresAt && expiresAt <= new Date()) throw new ValidationApiException({ field: "expiresAt", reason: "ALREADY_EXPIRED" });
      const updated = await tx.partnerVerificationDocument.update({ where: { id: documentId }, data: { status: input.decision, reviewNote: input.note ?? null, expiresAt, reviewedByAdminId: admin.adminUserId, reviewedAt: new Date() } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "verification.document_reviewed", entityType: doc.subjectType === PartnerSubjectType.PROVIDER ? "PROVIDER_ORGANIZATION" : "SELLER_ORGANIZATION", entityId: doc.subjectId, reason: input.note, afterSummary: { documentId, kind: doc.kind, decision: input.decision }, tx });
      return this.docDto(updated);
    });
  }

  async transition(admin: ResolvedAdminContext, s: Subject, to: Status, reason?: string, requestId?: string) {
    const o = await this.org(s);
    const from = o.verificationStatus;
    if (from === to) throw new ValidationApiException({ field: "status", reason: "UNCHANGED" });
    if (!ADMIN_TRANSITIONS[from].includes(to)) throw new ValidationApiException({ field: "status", reason: "INVALID_TRANSITION", from, to, allowed: ADMIN_TRANSITIONS[from] });
    if (NEEDS_REASON.includes(to) && !reason?.trim()) throw new ValidationApiException({ field: "reason", reason: "REQUIRED" });
    if (to === VS.VERIFIED && from !== VS.SUSPENDED) {
      const evidence = await this.prisma.partnerVerificationDocument.count({ where: { subjectType: s.type, subjectId: s.id, status: PartnerDocumentStatus.ACCEPTED, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
      if (!evidence) throw new ValidationApiException({ field: "status", reason: "VERIFICATION_EVIDENCE_REQUIRED" });
    }
    const entityType = s.type === PartnerSubjectType.PROVIDER ? "PROVIDER_ORGANIZATION" : "SELLER_ORGANIZATION";
    await this.prisma.$transaction(async (tx) => {
      const note = to === VS.NEEDS_INFORMATION || to === VS.REJECTED ? (reason ?? null) : to === VS.VERIFIED ? null : undefined;
      const data = { verificationStatus: to, ...(note !== undefined ? { verificationNote: note } : {}) };
      const done = s.type === PartnerSubjectType.PROVIDER
        ? await tx.providerOrganization.updateMany({ where: { id: s.id, verificationStatus: from }, data })
        : await tx.sellerOrganization.updateMany({ where: { id: s.id, verificationStatus: from as never }, data: data as never });
      if (!done.count) throw new ValidationApiException({ field: "status", reason: "CHANGED_CONCURRENTLY" });
      await this.events.publish("AdminVerificationStatusChanged", { subjectType: s.type, subjectId: s.id, from, to }, { tx, aggregateType: s.type === PartnerSubjectType.PROVIDER ? "ProviderOrganization" : "SellerOrganization", aggregateId: s.id });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "verification.status_changed", entityType, entityId: s.id, reason, beforeSummary: { verificationStatus: from }, afterSummary: { verificationStatus: to }, requestId, tx });
    });
    await this.notifyOwners(s, o.name, to);
    return { id: s.id, verificationStatus: to };
  }

  /** Expiry sweep (worker): accepted documents past expiresAt become EXPIRED (a Partner Ops task, never an automatic suspension); documents within 30 days raise one alert task + partner notification. */
  async sweepExpiry(now = new Date()) {
    const expired = await this.prisma.partnerVerificationDocument.findMany({ where: { status: PartnerDocumentStatus.ACCEPTED, expiresAt: { lte: now } }, take: 200 });
    for (const d of expired) {
      const done = await this.prisma.partnerVerificationDocument.updateMany({ where: { id: d.id, status: PartnerDocumentStatus.ACCEPTED }, data: { status: PartnerDocumentStatus.EXPIRED } });
      if (!done.count) continue;
      await this.events.publish("PartnerVerificationDocumentExpired", { subjectType: d.subjectType, subjectId: d.subjectId, documentId: d.id, kind: d.kind }, { aggregateType: d.subjectType === PartnerSubjectType.PROVIDER ? "ProviderOrganization" : "SellerOrganization", aggregateId: d.subjectId });
      await this.tasks.raise({ dedupeKey: `verification-document-expired:${d.id}`, title: `مدرک احراز منقضی شد (${DOC_KIND_FA[d.kind] ?? d.kind})`, source: AdminTaskSource.PARTNER_VERIFICATION, team: "PARTNER_OPERATIONS", priority: AdminPriority.HIGH, relatedEntityType: d.subjectType === PartnerSubjectType.PROVIDER ? "PROVIDER_ORGANIZATION" : "SELLER_ORGANIZATION", relatedEntityId: d.subjectId });
    }
    const soon = await this.prisma.partnerVerificationDocument.findMany({ where: { status: PartnerDocumentStatus.ACCEPTED, expiryAlertedAt: null, expiresAt: { gt: now, lte: new Date(now.getTime() + EXPIRY_ALERT_DAYS * 86400e3) } }, take: 200 });
    for (const d of soon) {
      const done = await this.prisma.partnerVerificationDocument.updateMany({ where: { id: d.id, expiryAlertedAt: null }, data: { expiryAlertedAt: now } });
      if (!done.count) continue;
      await this.tasks.raise({ dedupeKey: `verification-document-expiring:${d.id}`, title: `مدرک احراز رو به انقضاست (${DOC_KIND_FA[d.kind] ?? d.kind})`, source: AdminTaskSource.PARTNER_VERIFICATION, team: "PARTNER_OPERATIONS", priority: AdminPriority.NORMAL, relatedEntityType: d.subjectType === PartnerSubjectType.PROVIDER ? "PROVIDER_ORGANIZATION" : "SELLER_ORGANIZATION", relatedEntityId: d.subjectId, dueAt: d.expiresAt ?? undefined });
      const o = await this.org({ type: d.subjectType, id: d.subjectId }).catch(() => null);
      if (o) await this.notifyOwners({ type: d.subjectType, id: d.subjectId }, o.name, null, Math.max(1, Math.ceil(((d.expiresAt?.getTime() ?? now.getTime()) - now.getTime()) / 86400e3)), d.id);
    }
    return { expired: expired.length, expiring: soon.length };
  }

  private async owners(s: Subject): Promise<string[]> {
    if (s.type === PartnerSubjectType.PROVIDER) return (await this.prisma.providerUser.findMany({ where: { providerOrganizationId: s.id, role: ProviderUserRole.OWNER, removedAt: null }, select: { userId: true } })).map((u) => u.userId);
    return (await this.prisma.sellerMembership.findMany({ where: { sellerOrganizationId: s.id, status: SellerMembershipStatus.ACTIVE, role: { in: [SellerMembershipRole.OWNER, SellerMembershipRole.ADMIN] } }, select: { userId: true } })).map((m) => m.userId);
  }

  private async notifyOwners(s: Subject, name: string, status: Status | null, days?: number, documentId?: string) {
    const recipients = await this.owners(s);
    for (const userId of recipients) {
      await this.notifications.notify({
        userId,
        type: status ? "partner.verification_updated" : "partner.document_expiring",
        category: s.type === PartnerSubjectType.PROVIDER ? NotificationCategory.SERVICE : NotificationCategory.SELLER,
        deepLink: s.type === PartnerSubjectType.PROVIDER ? NotificationDeepLinks.providerVerification() : NotificationDeepLinks.sellerVerification(),
        entityType: status ? (s.type === PartnerSubjectType.PROVIDER ? "ProviderOrganization" : "SellerOrganization") : "PartnerVerificationDocument",
        entityId: status ? `${s.id}:${status}:${Date.now()}` : documentId,
        templateParams: status ? { title: name, status } : { title: name, days: String(days ?? EXPIRY_ALERT_DAYS) },
      }).catch(() => undefined);
    }
  }
}
