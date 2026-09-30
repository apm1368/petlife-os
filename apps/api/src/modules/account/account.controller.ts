import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req, Res, UseGuards } from "@nestjs/common";
import { IsBoolean, IsIn, IsOptional, IsString, Length } from "class-validator";
import type { Request, Response } from "express";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { SessionService, type SessionUser } from "../../common/session/session.service";
import { AccountService } from "./account.service";

class ConsentDto {
  @IsIn(["TERMS", "PRIVACY", "MARKETING"])
  kind!: "TERMS" | "PRIVACY" | "MARKETING";

  @IsBoolean()
  granted!: boolean;
}

class DeleteAccountDto {
  @IsString()
  @Length(6, 6)
  confirmation!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;
}

@Controller("account")
@UseGuards(SessionAuthGuard)
export class AccountController {
  constructor(private readonly account: AccountService, private readonly sessions: SessionService) {}

  @Get("overview")
  overview(@CurrentUser() user: SessionUser) { return this.account.overview(user.id); }

  @Get("security")
  security(@CurrentUser() user: SessionUser, @Req() req: Request) {
    return this.account.security(user.id, this.sessions.getSessionId(this.sessions.readCookie(req)));
  }

  @Delete("security/sessions/:sessionId")
  async revokeSession(@CurrentUser() user: SessionUser, @Req() req: Request, @Param("sessionId", ParseUUIDPipe) sessionId: string) {
    await this.sessions.revokeForUser(user.id, sessionId, this.sessions.getSessionId(this.sessions.readCookie(req)));
    await this.account.recordSessionRevoked(user.id, sessionId);
    return { ok: true };
  }

  @Post("security/sessions/revoke-others")
  async revokeOtherSessions(@CurrentUser() user: SessionUser, @Req() req: Request) {
    const count = await this.sessions.revokeOthers(user.id, this.sessions.getSessionId(this.sessions.readCookie(req)));
    await this.account.recordOtherSessionsRevoked(user.id, count);
    return { ok: true, count };
  }

  /** Signs out every device, this one included. */
  @Post("security/sessions/revoke-all")
  @HttpCode(HttpStatus.OK)
  async revokeAllSessions(@CurrentUser() user: SessionUser, @Res({ passthrough: true }) res: Response) {
    const count = await this.sessions.revokeAllAndClear(user.id, res);
    await this.account.recordAllSessionsRevoked(user.id, count);
    return { ok: true, count };
  }

  @Get("privacy")
  privacy(@CurrentUser() user: SessionUser) { return this.account.privacy(user.id); }

  @Patch("privacy/consent")
  consent(@CurrentUser() user: SessionUser, @Body() dto: ConsentDto) {
    return this.account.setConsent(user.id, dto.kind, dto.granted);
  }

  @Post("privacy/exports")
  requestExport(@CurrentUser() user: SessionUser) { return this.account.requestExport(user.id); }

  @Post("privacy/deletion")
  requestDeletion(@CurrentUser() user: SessionUser, @Body() dto: DeleteAccountDto) {
    return this.account.requestDeletion(user.id, dto.confirmation, dto.reason);
  }

  @Get("activity")
  activity(@CurrentUser() user: SessionUser) { return this.account.activity(user.id); }
}
