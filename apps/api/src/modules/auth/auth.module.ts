import { Module } from "@nestjs/common";
import { EmailModule } from "../../common/email/email.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { DevOtpProvider } from "./otp/dev-otp.provider";
import { FarazOtpProvider } from "./otp/faraz-otp.provider";
import { OTP_PROVIDER } from "./otp/otp-provider.interface";
import { OtpCodeStore } from "./otp/otp-code-store";
import { OtpService } from "./otp/otp.service";
import { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../config/env";
import { AuthPasswordService } from "./password/auth-password.service";
import { AuthPasswordResetService } from "./password/auth-password-reset.service";
import { GoogleOAuthClient } from "./google/google-oauth.client";
import { AuthGoogleService } from "./google/auth-google.service";
import { AuthGoogleController } from "./google/auth-google.controller";
import { AuthGoogleDevController } from "./google/auth-google-dev.controller";
import { ContactChangeController } from "./contact-change.controller";
import { ContactChangeService } from "./contact-change.service";

@Module({
  imports: [EmailModule],
  controllers: [AuthController, AuthGoogleController, AuthGoogleDevController, ContactChangeController],
  providers: [
    AuthService,
    DevOtpProvider,
    FarazOtpProvider,
    {
      provide: OTP_PROVIDER,
      inject: [ConfigService, DevOtpProvider, FarazOtpProvider],
      useFactory: (config: ConfigService<AppEnv, true>, dev: DevOtpProvider, faraz: FarazOtpProvider) =>
        config.get("OTP_PROVIDER", { infer: true }) === "faraz" ? faraz : dev,
    },
    OtpCodeStore,
    OtpService,
    AuthPasswordService,
    AuthPasswordResetService,
    GoogleOAuthClient,
    AuthGoogleService,
    ContactChangeService,
  ],
  exports: [AuthService, OtpService],
})
export class AuthModule {}
