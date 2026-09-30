import { Injectable } from "@nestjs/common";
import { AdminRefundApprovalStatus, AdminTaskStatus, ArticleLifecycleStatus, DisputeStatus, ProviderVerificationStatus, SupportCaseStatus, TrustCaseStatus } from "@prisma/client";
import type { AdminDashboardSummaryDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";

/** Backs the /admin shell landing view — small counts only, never a list (spec: "avoid disconnected tables"; each count links into its own paginated list view in the frontend). */
@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(): Promise<AdminDashboardSummaryDto> {
    const [openSupportCases, openDisputes, openTrustCases, pendingRefundApprovals, openTasks, pendingProviderVerifications, contentDrafts, recentActivity] = await Promise.all([
      this.prisma.supportCase.count({ where: { status: { notIn: [SupportCaseStatus.RESOLVED, SupportCaseStatus.CLOSED] } } }),
      this.prisma.dispute.count({ where: { status: { notIn: [DisputeStatus.CLOSED] } } }),
      this.prisma.trustCase.count({ where: { status: { notIn: [TrustCaseStatus.CLOSED] } } }),
      this.prisma.adminRefundApproval.count({ where: { status: { in: [AdminRefundApprovalStatus.REQUESTED, AdminRefundApprovalStatus.APPROVED] } } }),
      this.prisma.adminTask.count({ where: { status: { notIn: [AdminTaskStatus.DONE, AdminTaskStatus.CANCELLED] } } }),
      this.prisma.providerOrganization.count({ where: { verificationStatus: { in: [ProviderVerificationStatus.SUBMITTED, ProviderVerificationStatus.UNDER_REVIEW, ProviderVerificationStatus.NEEDS_INFORMATION] } } }),
      this.prisma.articleLocale.count({ where: { status: ArticleLifecycleStatus.DRAFT } }),
      this.prisma.adminAuditLog.findMany({ take: 8, orderBy: { createdAt: "desc" }, select: { id: true, action: true, entityType: true, entityId: true, createdAt: true, adminUser: { select: { user: { select: { displayName: true } } } } } }),
    ]);
    const needsAttention = [
      { id: "providerVerification", count: pendingProviderVerifications, href: "/providers", tone: "warning" as const },
      { id: "refunds", count: pendingRefundApprovals, href: "/transactions", tone: "urgent" as const },
      { id: "support", count: openSupportCases, href: "/support", tone: "warning" as const },
      { id: "disputes", count: openDisputes, href: "/disputes", tone: "urgent" as const },
      { id: "tasks", count: openTasks, href: "/tasks", tone: "neutral" as const },
      { id: "contentDrafts", count: contentDrafts, href: "/content", tone: "neutral" as const },
    ].filter((item) => item.count > 0);
    return { openSupportCases, openDisputes, openTrustCases, pendingRefundApprovals, openTasks, pendingProviderVerifications, contentDrafts, needsAttention, recentActivity: recentActivity.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), actorName: item.adminUser.user.displayName })) };
  }
}
