import { Module } from "@nestjs/common";
import { EmailModule } from "../../common/email/email.module";
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
import { KavenegarSmsAdapter } from "./messaging/kavenegar-sms.adapter";
import { SmsPatternTemplateService } from "./sms-pattern-template.service";

@Module({
  imports: [EmailModule],
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
    KavenegarSmsAdapter,
    SmsPatternTemplateService,
  ],
  exports: [NotificationOrchestratorService, SmsPatternTemplateService, NotificationDeliveryService, MessagingProviderRegistry],
})
export class NotificationsModule {}
