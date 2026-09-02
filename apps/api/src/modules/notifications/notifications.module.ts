import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationPreferenceController } from "./notification-preference.controller";
import { NotificationDevController } from "./notification-dev.controller";
import { NotificationsService } from "./notifications.service";
import { NotificationPreferenceService } from "./notification-preference.service";
import { NotificationOrchestratorService } from "./notification-orchestrator.service";
import { NotificationDeliveryService } from "./notification-delivery.service";
import { NotificationDeliveryWorkerService } from "./notification-delivery-worker.service";
import { NotificationEventsListener } from "./notification-events.listener";
import { MessagingProviderRegistry } from "./messaging/messaging-provider-registry.service";
import { DevMessagingAdapter } from "./messaging/dev-messaging.adapter";
import { FarazSmsAdapter } from "./messaging/faraz-sms.adapter";

@Module({
  controllers: [NotificationsController, NotificationPreferenceController, NotificationDevController],
  providers: [
    NotificationsService,
    NotificationPreferenceService,
    NotificationOrchestratorService,
    NotificationDeliveryService,
    NotificationDeliveryWorkerService,
    NotificationEventsListener,
    MessagingProviderRegistry,
    DevMessagingAdapter,
    FarazSmsAdapter,
  ],
  exports: [NotificationOrchestratorService],
})
export class NotificationsModule {}
