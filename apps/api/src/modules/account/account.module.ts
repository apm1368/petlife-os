import { Module } from "@nestjs/common";
import { SessionModule } from "../../common/session/session.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { AccountSecurityNotificationListener } from "./account-security-notification.listener";
import { AccountController } from "./account.controller";
import { AccountService } from "./account.service";

@Module({
  imports: [SessionModule, NotificationsModule],
  controllers: [AccountController],
  providers: [AccountService, AccountSecurityNotificationListener],
})
export class AccountModule {}
