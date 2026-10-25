import { Injectable } from "@nestjs/common";
import { AdminRefundApprovalStatus, AdminTaskStatus, DisputeStatus, SupportCaseStatus, TrustCaseStatus } from "@prisma/client";
import type { AdminDashboardSummaryDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { roleHasPermission } from "../auth/admin-permissions";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

/** Backs the /admin shell landing view — small counts only, never a list (spec: "avoid disconnected tables"; each count links into its own paginated list view in the frontend). */
@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(admin: ResolvedAdminContext): Promise<AdminDashboardSummaryDto> {
    const [openSupportCases, openDisputes, openTrustCases, pendingRefundApprovals, openTasks] = await Promise.all([
      roleHasPermission(admin.role, "support.view") ? this.prisma.supportCase.count({ where: { status: { notIn: [SupportCaseStatus.RESOLVED, SupportCaseStatus.CLOSED] } } }) : null,
      roleHasPermission(admin.role, "dispute.view") ? this.prisma.dispute.count({ where: { status: { notIn: [DisputeStatus.CLOSED] } } }) : null,
      roleHasPermission(admin.role, "trust.view") ? this.prisma.trustCase.count({ where: { status: { notIn: [TrustCaseStatus.CLOSED] } } }) : null,
      roleHasPermission(admin.role, "finance.view") ? this.prisma.adminRefundApproval.count({ where: { status: { in: [AdminRefundApprovalStatus.REQUESTED, AdminRefundApprovalStatus.APPROVED] } } }) : null,
      roleHasPermission(admin.role, "task.manage") ? this.prisma.adminTask.count({ where: { status: { notIn: [AdminTaskStatus.DONE, AdminTaskStatus.CANCELLED] } } }) : null,
    ]);
    return { openSupportCases, openDisputes, openTrustCases, pendingRefundApprovals, openTasks };
  }
}
