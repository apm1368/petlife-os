import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { SessionService, type SessionUser } from "../../common/session/session.service";
import { AuthService } from "./auth.service";
import { RequestOtpDto } from "./dto/request-otp.dto";
import { VerifyOtpDto } from "./dto/verify-otp.dto";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Post("request-otp")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async requestOtp(@Body() dto: RequestOtpDto): Promise<{ ok: true }> {
    await this.authService.requestOtp(dto.identifier);
    return { ok: true };
  }

  @Post("verify-otp")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = await this.authService.verifyOtp(dto.identifier, dto.code, res, {
      userAgent: req.headers["user-agent"],
      ipAddress: req.ip,
    });
    return { user: toUserDto(user) };
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
