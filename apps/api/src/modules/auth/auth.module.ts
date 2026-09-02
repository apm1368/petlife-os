import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { DevOtpProvider } from "./otp/dev-otp.provider";
import { OTP_PROVIDER } from "./otp/otp-provider.interface";
import { AuthPasswordService } from "./password/auth-password.service";
import { AuthPasswordResetService } from "./password/auth-password-reset.service";
import { GoogleOAuthClient } from "./google/google-oauth.client";
import { AuthGoogleService } from "./google/auth-google.service";
import { AuthGoogleController } from "./google/auth-google.controller";
import { AuthGoogleDevController } from "./google/auth-google-dev.controller";

@Module({
  controllers: [AuthController, AuthGoogleController, AuthGoogleDevController],
  providers: [
    AuthService,
    { provide: OTP_PROVIDER, useClass: DevOtpProvider },
    AuthPasswordService,
    AuthPasswordResetService,
    GoogleOAuthClient,
    AuthGoogleService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
