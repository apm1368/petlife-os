import { Module } from "@nestjs/common";
import { PublicContentReadService } from "./public-content-read.service";
import { PublicContentPlacementReadService } from "./public-content-placement-read.service";
import { PublicBlogController } from "./public-blog.controller";
import { PublicContentPlacementController } from "./public-content-placement.controller";

/**
 * The public half of the Handoff 15 CMS domain — read-only, anonymous-
 * readable Blog + content-placement endpoints. The admin-mutating half
 * (article/category/tag/media/version/placement writes) lives directly in
 * AdminModule (`admin/content/`) since every mutation needs
 * AdminAuditLogService — the exact layering AdminSellerSettlementService
 * (Handoff 14) already established. The two halves share only pure
 * utility functions (content-mapper.ts, rich-text.util.ts, slug.util.ts),
 * never a service, so there is no import relationship between this module
 * and AdminModule in either direction.
 */
@Module({
  controllers: [PublicBlogController, PublicContentPlacementController],
  providers: [PublicContentReadService, PublicContentPlacementReadService],
})
export class ContentModule {}
