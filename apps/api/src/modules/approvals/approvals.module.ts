import { Global, Module } from "@nestjs/common";
import { AutomaticTaskService } from "../admin/task/automatic-task.service";
import { ApprovalPolicyService } from "./approval-policy.service";
import { ApprovalTaskService } from "./approval-task.service";
import { ApprovalTaskListener } from "./approval-task.listener";

/**
 * Approval modes, shared by bookings, stays and orders. Global so those modules read the policy and raise follow-up
 * tasks without importing AdminModule (which imports them). AutomaticTaskService is stateless (Prisma + domain
 * events), so this module carries its own instance of it.
 */
@Global()
@Module({
  providers: [ApprovalPolicyService, ApprovalTaskService, AutomaticTaskService, ApprovalTaskListener],
  exports: [ApprovalPolicyService, ApprovalTaskService],
})
export class ApprovalsModule {}
