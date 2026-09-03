import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { UserSupportController } from "./user-support.controller";

/**
 * The consumer-facing User Support Center's API surface. Deliberately holds
 * no SupportCase state of its own — it imports AdminModule purely to reach
 * the SupportCaseService instance it exports, so admin and consumer routes
 * always read/write the same rows (spec: "the two sides must operate on the
 * SAME SupportCase source of truth"). One-directional dependency
 * (SupportModule -> AdminModule); AdminModule imports nothing back from
 * here, so there is no circularity.
 */
@Module({
  imports: [AdminModule],
  controllers: [UserSupportController],
})
export class SupportModule {}
