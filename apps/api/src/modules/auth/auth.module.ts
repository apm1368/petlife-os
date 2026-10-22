import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../../common/redis/redis.module";
import type { AppEnv } from "../../config/env";
import { NotificationsModule } from "../notifications/notifications.module";
import { FarazSmsClient } from "../notifications/messaging/faraz-sms.client";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { DevOtpProvider } from "./otp/dev-otp.provider";
import { FarazOtpProvider } from "./otp/faraz-otp.provider";
import { OtpGateService } from "./otp/otp-gate.service";
import { OTP_PROVIDER } from "./otp/otp-provider.interface";
import { AuthPasswordService } from "./password/auth-password.service";
import { AuthPasswordResetService } from "./password/auth-password-reset.service";
import { ContactChangeController } from "./contact-change.controller";
import { ContactChangeService } from "./contact-change.service";

@Module({
  imports: [NotificationsModule],
  controllers: [AuthController, ContactChangeController],
  providers: [
    AuthService,
    {
      provide: OTP_PROVIDER,
      inject: [REDIS_CLIENT, ConfigService, FarazSmsClient],
      useFactory: (redis: Redis, config: ConfigService<AppEnv, true>, faraz: FarazSmsClient) =>
        config.get("OTP_PROVIDER", { infer: true }) === "faraz" ? new FarazOtpProvider(redis, config, faraz) : new DevOtpProvider(redis, config),
    },
    OtpGateService,
    AuthPasswordService,
    AuthPasswordResetService,
    ContactChangeService,
  ],
  exports: [AuthService, OTP_PROVIDER],
})
export class AuthModule {}
