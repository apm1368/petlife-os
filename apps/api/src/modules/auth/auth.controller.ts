import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Post, Put, Req, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { SessionService, type SessionUser } from "../../common/session/session.service";
import { AuthService } from "./auth.service";
import { RequestOtpDto } from "./dto/request-otp.dto";
import { VerifyOtpDto } from "./dto/verify-otp.dto";
import { RegisterDto, RequestRegisterOtpDto } from "./dto/register.dto";
import { LoginChallengeDto, LoginPasswordDto, LoginPhoneDto, LoginVerifyDto } from "./dto/login-password.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import type { AuthMethodsDto } from "./dto/get-auth-methods.dto";
import { AuthPasswordService } from "./password/auth-password.service";
import { AuthPasswordResetService } from "./password/auth-password-reset.service";
import type { AppEnv } from "../../config/env";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessions: SessionService,
    private readonly passwordAuth: AuthPasswordService,
    private readonly passwordReset: AuthPasswordResetService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  @Get("methods")
  getMethods(): AuthMethodsDto {
    return { phone: this.directOtpLoginEnabled(), password: true };
  }

  /** Code-only sign-in is a test fixture (see AuthService); on a real deployment the routes do not exist. */
  private directOtpLoginEnabled(): boolean {
    return this.config.get("AUTH_DIRECT_OTP_LOGIN_ENABLED", { infer: true }) && this.config.get("NODE_ENV", { infer: true }) !== "production";
  }

  private assertDirectOtpLogin(): void {
    if (!this.directOtpLoginEnabled()) throw new NotFoundException();
  }

  @Post("request-otp")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async requestOtp(@Body() dto: RequestOtpDto): Promise<{ ok: true }> {
    this.assertDirectOtpLogin();
    await this.authService.requestOtp(dto.identifier);
    return { ok: true };
  }

  @Post("verify-otp")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertDirectOtpLogin();
    const user = await this.authService.verifyOtp(dto.identifier, dto.code, res, {
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
    });
    return { user: toUserDto(user) };
  }

  @Post("register/request-otp")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  requestRegisterOtp(@Body() dto: RequestRegisterOtpDto) {
    return this.passwordAuth.requestRegisterOtp(dto.username, dto.phone);
  }

  @Post("register")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.passwordAuth.register(dto, res, { userAgent: req.headers["user-agent"], ipAddress: req.ip });
    return { user: toUserDto(user) };
  }

  @Post("login/password")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  loginPassword(@Body() dto: LoginPasswordDto) {
    return this.passwordAuth.startLogin(dto);
  }

  @Post("login/phone")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  loginPhone(@Body() dto: LoginPhoneDto) {
    return this.passwordAuth.setLoginPhone(dto.challengeId, dto.phone);
  }

  @Post("login/resend")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  loginResend(@Body() dto: LoginChallengeDto) {
    return this.passwordAuth.resendLoginCode(dto.challengeId);
  }

  @Post("login/verify")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async loginVerify(@Body() dto: LoginVerifyDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.passwordAuth.completeLogin(dto.challengeId, dto.code, res, { userAgent: req.headers["user-agent"], ipAddress: req.ip });
    return { user: toUserDto(user) };
  }

  @Put("password")
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async setOrChangePassword(@CurrentUser() user: SessionUser, @Body() dto: ChangePasswordDto, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ ok: true; otherSessionsSignedOut: number }> {
    const otherSessionsSignedOut = await this.passwordAuth.setOrChangePassword(user.id, dto);
    // Every session (including this one) was just revoked; this device continues on a fresh session id rather than being signed out.
    await this.sessions.issueSession(user.id, res, { userAgent: req.headers["user-agent"], ipAddress: req.ip });
    return { ok: true, otherSessionsSignedOut };
  }

  @Post("password/forgot")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ ok: true }> {
    await this.passwordReset.requestReset(dto.identifier);
    return { ok: true };
  }

  @Post("password/reset")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ ok: true }> {
    await this.passwordReset.resetPassword(dto.identifier, dto.code, dto.newPassword);
    return { ok: true };
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ ok: true }> {
    const cookieValue = this.sessions.readCookie(req);
    await this.authService.logout(cookieValue, res);
    return { ok: true };
  }

  @Get("session")
  @UseGuards(SessionAuthGuard)
  getSession(@CurrentUser() user: SessionUser) {
    return { user: toUserDto(user) };
  }
}

function toUserDto(user: SessionUser) {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    displayName: user.displayName,
    locale: user.locale,
    themePreference: user.themePreference,
  };
}
