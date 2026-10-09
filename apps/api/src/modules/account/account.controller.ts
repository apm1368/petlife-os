import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { Throttle } from "@nestjs/throttler";
import { AccountPrivacyService } from "./account-privacy.service";
import type { Request, Response } from "express";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { SessionService, type SessionUser } from "../../common/session/session.service";
import { AccountService, type ActivityGroup } from "./account.service";

class ConsentDto {
  @IsIn(["TERMS", "PRIVACY", "MARKETING"])
  kind!: "TERMS" | "PRIVACY" | "MARKETING";

  @IsBoolean()
  granted!: boolean;
}

class DeleteAccountDto {
  @IsString()
  @Length(1, 20)
  confirmation!: string;

  /** Re-authentication: the account password, or the code sent by POST privacy/deletion/code. */
  @IsOptional()
  @IsString()
  @Length(1, 200)
  password?: string;

  @IsOptional()
  @Matches(/^\d{4,8}$/)
  code?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;
}

class ActivityQueryDto {
  @IsOptional()
  @IsIn(["SECURITY", "PRIVACY", "HOUSEHOLD", "MEMBERSHIP"])
  group?: ActivityGroup;

  @IsOptional()
  @IsISO8601()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

@Controller("account")
@UseGuards(SessionAuthGuard)
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly privacyCenter: AccountPrivacyService,
    private readonly sessions: SessionService,
  ) {}

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
  privacy(@CurrentUser() user: SessionUser) { return this.privacyCenter.overview(user.id); }

  @Patch("privacy/consent")
  consent(@CurrentUser() user: SessionUser, @Body() dto: ConsentDto) {
    return this.privacyCenter.setConsent(user.id, dto.kind, dto.granted);
  }

  @Get("privacy/consents/history")
  consentHistory(@CurrentUser() user: SessionUser) { return this.privacyCenter.consentHistory(user.id); }

  @Get("privacy/sharing")
  sharing(@CurrentUser() user: SessionUser) { return this.privacyCenter.sharing(user.id); }

  @Post("privacy/exports")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  requestExport(@CurrentUser() user: SessionUser) { return this.privacyCenter.requestExport(user.id); }

  /** Mints a short-lived signed download for the caller's own ready export. */
  @Post("privacy/exports/:id/download")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  downloadExport(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.privacyCenter.downloadExport(user.id, id);
  }

  @Get("privacy/deletion/preview")
  deletionPreview(@CurrentUser() user: SessionUser) { return this.privacyCenter.deletionPreview(user.id); }

  @Post("privacy/deletion/code")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  sendDeletionCode(@CurrentUser() user: SessionUser) { return this.privacyCenter.sendDeletionCode(user.id); }

  @Post("privacy/deletion")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  requestDeletion(@CurrentUser() user: SessionUser, @Body() dto: DeleteAccountDto) {
    return this.privacyCenter.requestDeletion(user.id, dto);
  }

  @Post("privacy/deletion/:id/cancel")
  @HttpCode(HttpStatus.OK)
  cancelDeletion(@CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.privacyCenter.cancelDeletion(user.id, id);
  }

  @Get("activity")
  activity(@CurrentUser() user: SessionUser, @Query() query: ActivityQueryDto) {
    return this.account.activityPage(user.id, { group: query.group, before: query.before, limit: query.limit });
  }
}
