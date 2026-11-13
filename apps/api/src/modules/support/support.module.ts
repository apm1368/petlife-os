import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { ProviderOsModule } from "../provider-os/provider-os.module";
import { SellerOsModule } from "../seller-os/seller-os.module";
import { ProviderSupportController, SellerSupportController } from "./partner-support.controller";
import { UserSupportController } from "./user-support.controller";

/**
 * The consumer-facing User Support Center's API surface. Deliberately holds
 * no SupportCase state of its own — it imports AdminModule purely to reach
 * the SupportCaseService instance it exports, so admin and consumer routes
 * always read/write the same rows (spec: "the two sides must operate on the
 * SAME SupportCase source of truth"). One-directional dependency
 * (SupportModule -> AdminModule); AdminModule imports nothing back from
 * here, so there is no circularity. ProviderOsModule and SellerOsModule are
 * imported only for their auth guards, so partner panels open cases on the
 * same rows.
 */
@Module({
  imports: [AdminModule, ProviderOsModule, SellerOsModule],
  controllers: [UserSupportController, ProviderSupportController, SellerSupportController],
})
export class SupportModule {}
