import { Body, Controller, ForbiddenException, Get, Injectable, Param, ParseUUIDPipe, Post, Query, UseGuards, type CanActivate, type ExecutionContext, createParamDecorator } from "@nestjs/common";
import { InsuranceApplicationStatus, InsurerRole } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser, type AuthedRequest } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { InsuranceApplicationService } from "./insurance-application.service";

interface InsurerContext {
  providerId: string;
  providerName: string;
  role: InsurerRole;
}

/**
 * An insurer's staff act only for their own provider: the membership is
 * resolved on every request from the session (one active membership), never
 * from a client-supplied provider id.
 */
@Injectable()
export class InsurerAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest & { insurerContext?: InsurerContext }>();
    if (!req.user) return false;
    const membership = await this.prisma.insurerMembership.findFirst({ where: { userId: req.user.id, isActive: true }, include: { provider: { select: { name: true } } }, orderBy: { createdAt: "asc" } });
    if (!membership) throw new ForbiddenException({ error: { code: "INSURER_ACCESS_DENIED", message: "You are not a member of an insurer on PET LIFE." } });
    req.insurerContext = { providerId: membership.providerId, providerName: membership.provider.name, role: membership.role };
    return true;
  }
}

const CurrentInsurer = createParamDecorator((_: unknown, ctx: ExecutionContext): InsurerContext => ctx.switchToHttp().getRequest<{ insurerContext: InsurerContext }>().insurerContext);

class ApplicationQueryDto {
  @IsOptional() @IsEnum(InsuranceApplicationStatus) status?: InsuranceApplicationStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) page?: number;
}

class InsurerDecisionDto {
  @IsIn([InsuranceApplicationStatus.UNDER_REVIEW, InsuranceApplicationStatus.NEEDS_INFORMATION, InsuranceApplicationStatus.APPROVED, InsuranceApplicationStatus.DECLINED])
  status!: InsuranceApplicationStatus;
  @IsOptional() @IsString() @MaxLength(2000) message?: string;
  @IsOptional() @IsString() @MaxLength(120) externalReference?: string;
}

/** Minimum insurer portal: own products, own applications (consented only), decisions, team. No claims. */
@Controller("insurer")
@UseGuards(SessionAuthGuard, InsurerAuthGuard)
export class InsurerPortalController {
  constructor(
    private readonly applications: InsuranceApplicationService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("me")
  me(@CurrentInsurer() ctx: InsurerContext) {
    return ctx;
  }

  @Get("products")
  products(@CurrentInsurer() ctx: InsurerContext) {
    return this.prisma.insuranceProduct.findMany({
      where: { providerId: ctx.providerId },
      select: { id: true, name: true, status: true, isPubliclyListed: true, coverageTypes: true, speciesEligibility: true, minAgeMonths: true, maxAgeMonths: true, _count: { select: { applications: true } } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
  }

  @Get("applications")
  list(@CurrentInsurer() ctx: InsurerContext, @Query() query: ApplicationQueryDto) {
    return this.applications.listForInsurer(ctx.providerId, query);
  }

  @Get("applications/:id")
  get(@CurrentInsurer() ctx: InsurerContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.applications.getForInsurer(ctx.providerId, id);
  }

  @Post("applications/:id/decision")
  decide(@CurrentInsurer() ctx: InsurerContext, @CurrentUser() user: SessionUser, @Param("id", ParseUUIDPipe) id: string, @Body() dto: InsurerDecisionDto) {
    if (ctx.role === InsurerRole.VIEWER) throw new ForbiddenException({ error: { code: "INSURER_ROLE_REQUIRED", message: "Viewers cannot change applications." } });
    return this.applications.transitionAsInsurer(ctx.providerId, user.id, id, dto.status, dto.message, dto.externalReference);
  }

  @Get("team")
  async team(@CurrentInsurer() ctx: InsurerContext) {
    const rows = await this.prisma.insurerMembership.findMany({ where: { providerId: ctx.providerId }, orderBy: { createdAt: "asc" } });
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } }, select: { id: true, displayName: true } });
    const name = new Map(users.map((u) => [u.id, u.displayName]));
    return rows.map((r) => ({ id: r.id, displayName: name.get(r.userId) ?? null, role: r.role, isActive: r.isActive, createdAt: r.createdAt.toISOString() }));
  }
}
