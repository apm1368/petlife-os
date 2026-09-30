import { Module } from "@nestjs/common";
import { SessionModule } from "../../common/session/session.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AccountSecurityNotificationListener } from "./account-security-notification.listener";
import { AuthModule } from "../auth/auth.module";
import { StorageModule } from "../storage/storage.module";
import { PetAccessModule } from "../pet-access/pet-access.module";
import { AccountExportService } from "./account-export.service";
import { AccountPrivacyService } from "./account-privacy.service";
import { AccountController } from "./account.controller";
import { AccountService } from "./account.service";

@Module({
  imports: [SessionModule, NotificationsModule, AuthModule, StorageModule, PetAccessModule],
  controllers: [AccountController],
  providers: [AccountService, AccountSecurityNotificationListener, AccountExportService, AccountPrivacyService],
})
export class AccountModule {}
