import { Module } from "@nestjs/common";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { StorageModule } from "../storage/storage.module";
import { CommunityPostService } from "./community-post.service";
import { CommunityReportService } from "./community-report.service";
import { CommunityController } from "./community.controller";
import { ContentReportController } from "./content-report.controller";
import { ChatController } from "./chat/chat.controller";
import { ChatService } from "./chat/chat.service";
import { ChatNotificationListener } from "./chat/chat-notification.listener";
import { NotificationsModule } from "../notifications/notifications.module";

/**
 * The consumer-facing half of the Handoff 18 Community domain — browsing,
 * posting, commenting, reacting, and report submission. The admin-mutating
 * moderation half (CommunityModerationService — escalate a report into the
 * existing Trust & Safety queue, dismiss/resolve) lives directly in
 * AdminModule since it needs AdminAuditLogService + TrustCaseService — the
 * same public/admin split ContentModule/AdminModule and
 * AnimalSupportModule/AdminModule already established.
 */
@Module({
  imports: [PetAccessModule, StorageModule, NotificationsModule],
  controllers: [CommunityController, ContentReportController, ChatController],
  providers: [CommunityPostService, CommunityReportService, ChatService, ChatNotificationListener],
  exports: [CommunityPostService],
})
export class CommunityModule {}
