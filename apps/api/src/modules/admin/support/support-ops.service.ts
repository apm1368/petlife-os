import { Injectable } from "@nestjs/common";
import { AdminTaskStatus, CommunityReportStatus, DisputeStatus, PartnerDocumentStatus, Prisma, ProviderVerificationStatus, SupportAttachmentVisibility, SupportCaseStatus, SupportLinkEntityType } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { NotFoundApiException, SupportCaseNotFoundException, ValidationApiException } from "../../../common/errors/api-exception";
import { StorageService } from "../../storage/storage.service";
import { PlatformSettingsService } from "../../platform-settings/platform-settings.service";
import { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

const OPEN: SupportCaseStatus[] = [SupportCaseStatus.OPEN, SupportCaseStatus.IN_PROGRESS, SupportCaseStatus.WAITING_ON_USER, SupportCaseStatus.WAITING_ON_INTERNAL];
const hours = (ms: number) => Math.round((ms / 3600e3) * 10) / 10;
const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

/**
 * ERP-F support depth on top of SupportCaseService: tags, linked entities (validated), private attachments (staff
 * INTERNAL or SHARED with the requester; requester uploads are SHARED), and SLA metrics for every operational queue.
 */
@Injectable()
export class SupportOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly settings: PlatformSettingsService,
    private readonly audit: AdminAuditLogService,
  ) {}

  private async caseOrThrow(caseId: string) {
    const c = await this.prisma.supportCase.findUnique({ where: { id: caseId }, select: { id: true, requesterUserId: true, tags: true } });
    if (!c) throw new SupportCaseNotFoundException({ caseId });
    return c;
  }

  async extras(caseId: string) {
    await this.caseOrThrow(caseId);
    const [c, links, attachments] = await Promise.all([
      this.prisma.supportCase.findUniqueOrThrow({ where: { id: caseId }, select: { tags: true, firstAssignedAt: true, firstResponseAt: true, reopenCount: true, createdAt: true, status: true } }),
      this.prisma.supportCaseLink.findMany({ where: { supportCaseId: caseId }, orderBy: { createdAt: "asc" } }),
      this.prisma.supportCaseAttachment.findMany({ where: { supportCaseId: caseId }, orderBy: { createdAt: "asc" } }),
    ]);
    const slaHours = this.settings.getInt("support.firstResponseSlaHours");
    const dueAt = new Date(c.createdAt.getTime() + slaHours * 3600e3);
    return {
      tags: c.tags,
      sla: { firstResponseTargetHours: slaHours, firstResponseDueAt: dueAt.toISOString(), firstAssignedAt: iso(c.firstAssignedAt), firstResponseAt: iso(c.firstResponseAt), reopenCount: c.reopenCount, breached: c.firstResponseAt ? c.firstResponseAt > dueAt : OPEN.includes(c.status) && Date.now() > dueAt.getTime() },
      links: links.map((l) => ({ id: l.id, entityType: l.entityType, entityId: l.entityId, createdAt: l.createdAt.toISOString() })),
      attachments: attachments.map((a) => this.attachmentDto(a)),
    };
  }

  private attachmentDto(a: Prisma.SupportCaseAttachmentGetPayload<object>) {
    return { id: a.id, mimeType: a.mimeType, fileSizeBytes: a.fileSizeBytes, visibility: a.visibility, uploadedBy: a.uploadedByAdminId ? "STAFF" : "REQUESTER", createdAt: a.createdAt.toISOString() };
  }

  async setTags(admin: ResolvedAdminContext, caseId: string, tags: string[]) {
    const c = await this.caseOrThrow(caseId);
    const clean = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
    await this.prisma.$transaction(async (tx) => {
      await tx.supportCase.update({ where: { id: caseId }, data: { tags: clean } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "support_case.tags_changed", entityType: "SUPPORT_CASE", entityId: caseId, beforeSummary: { tags: c.tags }, afterSummary: { tags: clean }, tx });
    });
    return { tags: clean };
  }

  private async assertEntityExists(type: SupportLinkEntityType, id: string) {
    const exists: Record<SupportLinkEntityType, () => Promise<number>> = {
      BOOKING: () => this.prisma.booking.count({ where: { id } }),
      TRAVEL_BOOKING: () => this.prisma.travelBooking.count({ where: { id } }),
      ORDER: () => this.prisma.order.count({ where: { id } }),
      PAYMENT_INTENT: () => this.prisma.paymentIntent.count({ where: { id } }),
      REFUND: () => this.prisma.refund.count({ where: { id } }),
      PROVIDER: () => this.prisma.providerOrganization.count({ where: { id } }),
      SELLER: () => this.prisma.sellerOrganization.count({ where: { id } }),
      PET: () => this.prisma.pet.count({ where: { id } }),
      HOUSEHOLD: () => this.prisma.household.count({ where: { id } }),
    };
    if (!(await exists[type]())) throw new NotFoundApiException("Linked entity", { entityType: type });
  }

  async addLink(admin: ResolvedAdminContext, caseId: string, entityType: SupportLinkEntityType, entityId: string) {
    await this.caseOrThrow(caseId);
    await this.assertEntityExists(entityType, entityId);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.supportCaseLink.createMany({ data: [{ supportCaseId: caseId, entityType, entityId, createdByAdminId: admin.adminUserId }], skipDuplicates: true });
      if (count) await this.audit.record({ adminUserId: admin.adminUserId, action: "support_case.linked", entityType: "SUPPORT_CASE", entityId: caseId, afterSummary: { linkedType: entityType, linkedId: entityId }, tx });
    });
    return this.extras(caseId);
  }

  async removeLink(admin: ResolvedAdminContext, caseId: string, linkId: string) {
    const link = await this.prisma.supportCaseLink.findFirst({ where: { id: linkId, supportCaseId: caseId } });
    if (!link) throw new NotFoundApiException("Support case link");
    await this.prisma.$transaction(async (tx) => {
      await tx.supportCaseLink.delete({ where: { id: linkId } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "support_case.unlinked", entityType: "SUPPORT_CASE", entityId: caseId, afterSummary: { linkedType: link.entityType, linkedId: link.entityId }, tx });
    });
    return this.extras(caseId);
  }

  // ------------------------------------------------------------------ attachments
  async uploadTarget(caseId: string, contentType: string, fileSizeBytes: number, requesterUserId?: string) {
    const c = await this.caseOrThrow(caseId);
    if (requesterUserId && c.requesterUserId !== requesterUserId) throw new SupportCaseNotFoundException({ caseId });
    return this.storage.createSupportAttachmentUploadTarget(caseId, contentType, fileSizeBytes);
  }

  async register(caseId: string, input: { objectKey: string; mimeType: string; fileSizeBytes: number; visibility?: SupportAttachmentVisibility }, by: { adminUserId?: string; requesterUserId?: string }) {
    const c = await this.caseOrThrow(caseId);
    if (by.requesterUserId && c.requesterUserId !== by.requesterUserId) throw new SupportCaseNotFoundException({ caseId });
    if (!input.objectKey.startsWith(`support-attachments/${caseId}/`) || input.objectKey.includes("..")) throw new ValidationApiException({ field: "objectKey", reason: "NOT_ISSUED_FOR_THIS_CASE" });
    if ((await this.prisma.supportCaseAttachment.count({ where: { supportCaseId: caseId } })) >= 20) throw new ValidationApiException({ field: "objectKey", reason: "TOO_MANY_ATTACHMENTS" });
    const row = await this.prisma.supportCaseAttachment.create({ data: { supportCaseId: caseId, objectKey: input.objectKey, mimeType: input.mimeType, fileSizeBytes: input.fileSizeBytes, visibility: by.requesterUserId ? SupportAttachmentVisibility.SHARED : (input.visibility ?? SupportAttachmentVisibility.INTERNAL), uploadedByAdminId: by.adminUserId ?? null, uploadedByUserId: by.requesterUserId ?? null } });
    if (by.adminUserId) await this.audit.record({ adminUserId: by.adminUserId, action: "support_case.attachment_added", entityType: "SUPPORT_CASE", entityId: caseId, afterSummary: { attachmentId: row.id, visibility: row.visibility } });
    return this.attachmentDto(row);
  }

  async download(caseId: string, attachmentId: string, by: { admin?: ResolvedAdminContext; requesterUserId?: string }) {
    const c = await this.caseOrThrow(caseId);
    const a = await this.prisma.supportCaseAttachment.findFirst({ where: { id: attachmentId, supportCaseId: caseId } });
    // A requester sees only SHARED files on their own case; anything else is "not found", never "forbidden".
    if (!a || (by.requesterUserId && (c.requesterUserId !== by.requesterUserId || a.visibility !== SupportAttachmentVisibility.SHARED))) throw new NotFoundApiException("Attachment");
    if (by.admin) await this.audit.record({ adminUserId: by.admin.adminUserId, action: "support_case.attachment_opened", entityType: "SUPPORT_CASE", entityId: caseId, afterSummary: { attachmentId } });
    return { attachmentId, ...(await this.storage.createPrivateDownloadTarget(a.objectKey)) };
  }

  async requesterAttachments(caseId: string, userId: string) {
    const c = await this.caseOrThrow(caseId);
    if (c.requesterUserId !== userId) throw new SupportCaseNotFoundException({ caseId });
    return (await this.prisma.supportCaseAttachment.findMany({ where: { supportCaseId: caseId, visibility: SupportAttachmentVisibility.SHARED }, orderBy: { createdAt: "asc" } })).map((a) => this.attachmentDto(a));
  }

  // ------------------------------------------------------------------ SLA metrics (ERP §49)
  async queueSla(days: number) {
    const since = new Date(Date.now() - days * 86400e3);
    const now = Date.now();
    const slaHours = this.settings.getInt("support.firstResponseSlaHours");
    const [cases, openCases, verifQueue, verifReviewed, deletions, tasks, overdueTasks, reports] = await Promise.all([
      this.prisma.supportCase.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true, firstAssignedAt: true, firstResponseAt: true, resolvedAt: true, reopenCount: true, status: true } }),
      this.prisma.supportCase.findMany({ where: { status: { in: OPEN } }, select: { createdAt: true, firstResponseAt: true } }),
      this.prisma.providerOrganization.findMany({ where: { verificationStatus: { in: [ProviderVerificationStatus.SUBMITTED, ProviderVerificationStatus.UNDER_REVIEW] } }, select: { verificationSubmittedAt: true } }),
      this.prisma.partnerVerificationDocument.findMany({ where: { reviewedAt: { gte: since }, status: { in: [PartnerDocumentStatus.ACCEPTED, PartnerDocumentStatus.REJECTED] } }, select: { createdAt: true, reviewedAt: true } }),
      this.prisma.accountDeletionRequest.groupBy({ by: ["state"], _count: { _all: true }, _min: { requestedAt: true } }),
      this.prisma.adminTask.groupBy({ by: ["team", "status"], where: { status: { in: [AdminTaskStatus.OPEN, AdminTaskStatus.IN_PROGRESS, AdminTaskStatus.BLOCKED] } }, _count: { _all: true } }),
      this.prisma.adminTask.count({ where: { status: { in: [AdminTaskStatus.OPEN, AdminTaskStatus.IN_PROGRESS, AdminTaskStatus.BLOCKED] }, dueAt: { lt: new Date() } } }),
      this.prisma.communityReport.aggregate({ where: { status: CommunityReportStatus.OPEN }, _count: { _all: true }, _min: { createdAt: true } }),
    ]);
    const firstResponse = cases.filter((c) => c.firstResponseAt).map((c) => c.firstResponseAt!.getTime() - c.createdAt.getTime());
    const firstAssign = cases.filter((c) => c.firstAssignedAt).map((c) => c.firstAssignedAt!.getTime() - c.createdAt.getTime());
    const resolution = cases.filter((c) => c.resolvedAt).map((c) => c.resolvedAt!.getTime() - c.createdAt.getTime());
    const resolved = cases.filter((c) => c.resolvedAt);
    return {
      windowDays: days,
      support: {
        createdInWindow: cases.length,
        open: openCases.length,
        firstResponseTargetHours: slaHours,
        openBreachingFirstResponse: openCases.filter((c) => !c.firstResponseAt && now - c.createdAt.getTime() > slaHours * 3600e3).length,
        medianHoursToFirstAssignment: firstAssign.length ? hours(median(firstAssign)!) : null,
        medianHoursToFirstResponse: firstResponse.length ? hours(median(firstResponse)!) : null,
        medianHoursToResolution: resolution.length ? hours(median(resolution)!) : null,
        reopenRate: resolved.length ? Math.round((resolved.filter((c) => c.reopenCount > 0).length / resolved.length) * 100) / 100 : null,
      },
      verification: {
        pending: verifQueue.length,
        oldestWaitingHours: verifQueue.length ? hours(now - Math.min(...verifQueue.map((v) => v.verificationSubmittedAt?.getTime() ?? now))) : null,
        medianHoursToDocumentReview: verifReviewed.length ? hours(median(verifReviewed.map((d) => d.reviewedAt!.getTime() - d.createdAt.getTime()))!) : null,
      },
      privacy: { deletionRequestsByState: Object.fromEntries(deletions.map((d) => [d.state, d._count._all])), oldestDeletionRequestAt: iso(deletions.map((d) => d._min.requestedAt).filter((x): x is Date => Boolean(x)).sort((a, b) => a.getTime() - b.getTime())[0]) },
      moderation: { openCommunityReports: reports._count._all, oldestOpenReportAt: iso(reports._min.createdAt) },
      tasks: { openByTeam: tasks.reduce<Record<string, number>>((m, t) => ({ ...m, [t.team ?? "UNASSIGNED_TEAM"]: (m[t.team ?? "UNASSIGNED_TEAM"] ?? 0) + t._count._all }), {}), overdue: overdueTasks },
    };
  }
}

export const DISPUTE_LIFECYCLE = (status: DisputeStatus, refundExecuted: boolean) => {
  switch (status) {
    case DisputeStatus.AWAITING_EVIDENCE: return "WAITING_PARTY";
    case DisputeStatus.RESOLVED_CUSTOMER: return refundExecuted ? "REFUNDED" : "RESOLVED_USER";
    case DisputeStatus.RESOLVED_SELLER: return "RESOLVED_PROVIDER";
    default: return status;
  }
};
