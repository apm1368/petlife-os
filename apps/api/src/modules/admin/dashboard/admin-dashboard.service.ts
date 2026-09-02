import { Injectable } from "@nestjs/common";
import { AdminRefundApprovalStatus, AdminTaskStatus, DisputeStatus, SupportCaseStatus, TrustCaseStatus } from "@prisma/client";
import type { AdminDashboardSummaryDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";

/** Backs the /admin shell landing view — small counts only, never a list (spec: "avoid disconnected tables"; each count links into its own paginated list view in the frontend). */
@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(): Promise<AdminDashboardSummaryDto> {
    const [openSupportCases, openDisputes, openTrustCases, pendingRefundApprovals, openTasks] = await Promise.all([
      this.prisma.supportCase.count({ where: { status: { notIn: [SupportCaseStatus.RESOLVED, SupportCaseStatus.CLOSED] } } }),
      this.prisma.dispute.count({ where: { status: { notIn: [DisputeStatus.CLOSED] } } }),
      this.prisma.trustCase.count({ where: { status: { notIn: [TrustCaseStatus.CLOSED] } } }),
      this.prisma.adminRefundApproval.count({ where: { status: { in: [AdminRefundApprovalStatus.REQUESTED, AdminRefundApprovalStatus.APPROVED] } } }),
      this.prisma.adminTask.count({ where: { status: { notIn: [AdminTaskStatus.DONE, AdminTaskStatus.CANCELLED] } } }),
    ]);
    return { openSupportCases, openDisputes, openTrustCases, pendingRefundApprovals, openTasks };
  }
}
