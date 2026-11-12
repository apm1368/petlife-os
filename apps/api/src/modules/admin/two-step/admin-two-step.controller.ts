import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { IsBoolean, IsInt, IsOptional, IsString, Length, Matches, Max, Min, ValidateIf } from "class-validator";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import { SessionService, type SessionUser } from "../../../common/session/session.service";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { AllowBeforeTwoStep } from "./two-step-gate";
import { AdminTwoStepService } from "./admin-two-step.service";

class CodeDto {
  @IsString() @Matches(/^\s*\d{3}\s?\d{3}\s*$/) code!: string;
}
class VerifyDto {
  @ValidateIf((o: VerifyDto) => !o.recoveryCode) @IsString() @Matches(/^\s*\d{3}\s?\d{3}\s*$/) code?: string;
  @IsOptional() @IsString() @Length(16, 40) recoveryCode?: string;
}
class ReasonDto {
  @IsString() @Length(5, 500) reason!: string;
}
class PolicyDto extends ReasonDto {
  @IsBoolean() enforced!: boolean;
  @IsInt() @Min(0) @Max(30) graceDays!: number;
}

type CookieRequest = { cookies?: Record<string, string> };

/**
 * Admin two-step sign-in. Status, enrolment and the code check are reachable before the session has passed two-step
 * (otherwise nobody could pass it); recovery codes, turning it off, the team policy and resets sit behind it.
 */
@Controller("admin/two-step")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminTwoStepController {
  constructor(private readonly twoStep: AdminTwoStepService, private readonly sessions: SessionService) {}

  private sessionId(req: CookieRequest) {
    return this.sessions.getSessionId(this.sessions.readCookie(req));
  }

  @Get()
  @AllowBeforeTwoStep()
  status(@CurrentAdmin() admin: ResolvedAdminContext, @Req() req: CookieRequest) {
    return this.twoStep.status(admin, this.sessionId(req));
  }

  @Post("enrolment")
  @AllowBeforeTwoStep()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  start(@CurrentAdmin() admin: ResolvedAdminContext, @CurrentUser() user: SessionUser) {
    return this.twoStep.startEnrolment(admin, user);
  }

  @Post("enrolment/confirm")
  @AllowBeforeTwoStep()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  confirm(@CurrentAdmin() admin: ResolvedAdminContext, @Req() req: CookieRequest, @Body() dto: CodeDto) {
    return this.twoStep.confirmEnrolment(admin, this.sessionId(req), dto.code);
  }

  @Post("verify")
  @AllowBeforeTwoStep()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verify(@CurrentAdmin() admin: ResolvedAdminContext, @Req() req: CookieRequest, @Body() dto: VerifyDto) {
    return this.twoStep.verify(admin, this.sessionId(req), { code: dto.recoveryCode ? undefined : dto.code, recoveryCode: dto.recoveryCode });
  }

  @Post("recovery-codes")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  regenerate(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: CodeDto) {
    return this.twoStep.regenerateRecoveryCodes(admin, dto.code);
  }

  @Post("disable")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  disable(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: CodeDto) {
    return this.twoStep.disable(admin, dto.code);
  }

  @Get("policy")
  @RequireAdminPermission("access.view")
  policy() {
    return this.twoStep.policy();
  }

  @Put("policy")
  @RequireAdminPermission("admin.manage")
  setPolicy(@CurrentAdmin() admin: ResolvedAdminContext, @Body() dto: PolicyDto) {
    return this.twoStep.setPolicy(admin, dto);
  }

  @Post("members/:adminUserId/reset")
  @RequireAdminPermission("admin.manage")
  reset(@CurrentAdmin() admin: ResolvedAdminContext, @Param("adminUserId", ParseUUIDPipe) adminUserId: string, @Body() dto: ReasonDto) {
    return this.twoStep.reset(admin, adminUserId, dto.reason);
  }
}
