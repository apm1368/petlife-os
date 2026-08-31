import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { DevOtpProvider } from "./otp/dev-otp.provider";
import { OTP_PROVIDER } from "./otp/otp-provider.interface";

@Module({
  controllers: [AuthController],
  providers: [AuthService, { provide: OTP_PROVIDER, useClass: DevOtpProvider }],
  exports: [AuthService],
})
export class AuthModule {}
