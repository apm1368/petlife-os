import { Injectable } from "@nestjs/common";
import { AdminRefundApprovalStatus, AdminTaskStatus, DisputeStatus, SupportCaseStatus, TrustCaseStatus } from "@prisma/client";
import type { AdminDashboardSummaryDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { adminHasPermission } from "../auth/admin-permissions";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

/** Backs the /admin shell landing view — small counts only, never a list (spec: "avoid disconnected tables"; each count links into its own paginated list view in the frontend). */
@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(admin: ResolvedAdminContext): Promise<AdminDashboardSummaryDto> {
    const [openSupportCases, openDisputes, openTrustCases, pendingRefundApprovals, openTasks] = await Promise.all([
      adminHasPermission(admin, "support.view") ? this.prisma.supportCase.count({ where: { status: { notIn: [SupportCaseStatus.RESOLVED, SupportCaseStatus.CLOSED] } } }) : null,
      adminHasPermission(admin, "dispute.view") ? this.prisma.dispute.count({ where: { status: { notIn: [DisputeStatus.CLOSED] } } }) : null,
      adminHasPermission(admin, "trust.view") ? this.prisma.trustCase.count({ where: { status: { notIn: [TrustCaseStatus.CLOSED] } } }) : null,
      adminHasPermission(admin, "finance.view") ? this.prisma.adminRefundApproval.count({ where: { status: { in: [AdminRefundApprovalStatus.REQUESTED, AdminRefundApprovalStatus.APPROVED] } } }) : null,
      adminHasPermission(admin, "task.manage") ? this.prisma.adminTask.count({ where: { status: { notIn: [AdminTaskStatus.DONE, AdminTaskStatus.CANCELLED] } } }) : null,
    ]);
    return { openSupportCases, openDisputes, openTrustCases, pendingRefundApprovals, openTasks };
  }
}
