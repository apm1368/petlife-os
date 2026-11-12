import { Controller, Get, Header, Req, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { CurrentUser } from "../../../common/auth/current-user.decorator";
import { SessionService, type SessionUser } from "../../../common/session/session.service";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { evaluateTwoStep } from "../two-step/two-step-gate";
import { AdminAccessService } from "./admin-access.service";
import { AdminAuthGuard } from "./admin-auth.guard";
import { CurrentAdmin } from "./current-admin.decorator";
import type { ResolvedAdminContext } from "./admin-context.types";
import { effectivePermissions } from "./admin-permissions";
import { allowedVerticals } from "./admin-verticals";
import type { AdminCapabilitiesDto, AdminSessionContextDto } from "@petlife/types";

/**
 * Deliberately behind SessionAuthGuard only, never AdminAuthGuard — a
 * non-admin authenticated user must get a normal 200 response with
 * `isAdmin: false`, not a 403, so the Admin Shell can render a friendly
 * "you are not an admin" screen instead of treating every ordinary
 * consumer session as an error case.
 */
@Controller("admin/me")
@UseGuards(SessionAuthGuard)
export class AdminMeController {
  constructor(private readonly adminAccess: AdminAccessService, private readonly prisma: PrismaService, private readonly sessions: SessionService) {}

  /** Also tells the shell whether this session still has to pass two-step sign-in (and which step), so it can show that screen. */
  @Get()
  @Header("Cache-Control", "no-store")
  async getMe(@CurrentUser() user: SessionUser, @Req() req: { cookies?: Record<string, string> }): Promise<AdminSessionContextDto> {
    const context = await this.adminAccess.getSessionContext(user.id);
    if (!context.isAdmin) return context;
    const gate = await evaluateTwoStep(this.prisma, user.id, this.sessions.getSessionId(this.sessions.readCookie(req)));
    return {
      ...context,
      twoStep: { enrolled: gate.enrolled, verified: gate.verified, enforced: gate.enforced, graceEndsAt: gate.graceEndsAt?.toISOString() ?? null, required: gate.required },
    };
  }

  @Get("capabilities")
  @Header("Cache-Control", "no-store")
  @UseGuards(AdminAuthGuard)
  getCapabilities(@CurrentAdmin() admin: ResolvedAdminContext): AdminCapabilitiesDto {
    return {
      role: admin.role as AdminCapabilitiesDto["role"],
      permissions: [...effectivePermissions(admin)],
      verticals: allowedVerticals(admin) as AdminCapabilitiesDto["verticals"],
    };
  }
}
