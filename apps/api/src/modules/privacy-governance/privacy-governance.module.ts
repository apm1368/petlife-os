import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { AdminPrivacyGovernanceController } from "./privacy-governance.controller";
import { PrivacyGovernanceService } from "./privacy-governance.service";

/** G19: account deletion lifecycle (no execution) and the real-user release gate. */
@Module({
  imports: [AdminModule],
  controllers: [AdminPrivacyGovernanceController],
  providers: [PrivacyGovernanceService],
})
export class PrivacyGovernanceModule {}
