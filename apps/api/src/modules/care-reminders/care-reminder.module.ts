import { Module } from "@nestjs/common";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { CareReminderController } from "./care-reminder.controller";
import { CareReminderService } from "./care-reminder.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { CareReminderWorker } from "./care-reminder.worker";
import { CareSourceListener } from "./care-source.listener";
@Module({ imports: [PetAccessModule, NotificationsModule], controllers: [CareReminderController], providers: [CareReminderService, CareReminderWorker, CareSourceListener], exports: [CareReminderService, CareSourceListener] })
export class CareReminderModule {}
