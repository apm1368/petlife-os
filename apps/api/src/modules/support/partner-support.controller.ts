import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { PartnerSubjectType, ProviderUserRole, SellerMembershipRole, SupportCaseCategory } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { SupportCaseService, type SupportRequesterScope } from "../admin/support/support-case.service";
import { ProviderAuthGuard } from "../provider-os/auth/provider-auth.guard";
import { CurrentProviderContext } from "../provider-os/auth/current-provider-context.decorator";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { SellerAuthGuard } from "../seller-os/auth/seller-auth.guard";
import { CurrentSellerContext } from "../seller-os/auth/current-seller-context.decorator";
import type { ResolvedSellerContext } from "../seller-os/auth/seller-context.types";
import { CreatePartnerSupportCaseDto, ListMySupportCasesQueryDto, PostPartnerSupportMessageDto } from "./dto/user-support-case.dto";

type PartnerScope = Extract<SupportRequesterScope, { kind: "PARTNER" }>;

/** The provider owner follows every case of the clinic or business; vets and staff follow the ones they opened. */
export function providerSupportScope(ctx: ResolvedProviderContext): PartnerScope {
  return { kind: "PARTNER", userId: ctx.userId, orgType: PartnerSubjectType.PROVIDER, orgId: ctx.organizationId, orgName: ctx.organizationName, seesWholeTeam: ctx.role === ProviderUserRole.OWNER };
}

const SELLER_SUPPORT_MANAGERS: SellerMembershipRole[] = [SellerMembershipRole.OWNER, SellerMembershipRole.ADMIN, SellerMembershipRole.SUPPORT];

/** Shop owner, admins and the support role follow every case of the shop; the rest of the team follows their own. */
export function sellerSupportScope(ctx: ResolvedSellerContext): PartnerScope {
  return { kind: "PARTNER", userId: ctx.userId, orgType: PartnerSubjectType.SELLER, orgId: ctx.sellerOrganizationId, orgName: ctx.sellerOrganizationName, seesWholeTeam: SELLER_SUPPORT_MANAGERS.includes(ctx.role) };
}

/**
 * Support from the provider panel. Open to every member and to businesses
 * still in verification (no @RequireVerifiedPartner): a partner stuck in KYC
 * is exactly who needs to reach support. Same SupportCase rows as the admin
 * queue, where these cases sit under Partners.
 */
@Controller("provider/support/cases")
@UseGuards(SessionAuthGuard, ProviderAuthGuard)
export class ProviderSupportController {
  constructor(private readonly cases: SupportCaseService) {}

  @Get()
  list(@CurrentProviderContext() ctx: ResolvedProviderContext, @Query() query: ListMySupportCasesQueryDto) {
    return this.cases.listForPartner(providerSupportScope(ctx), query);
  }

  @Post()
  create(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: CreatePartnerSupportCaseDto) {
    return this.cases.createAsPartner(providerSupportScope(ctx), { ...dto, category: dto.category as SupportCaseCategory });
  }

  @Get(":id")
  get(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.cases.getForPartner(providerSupportScope(ctx), id);
  }

  @Post(":id/messages")
  postMessage(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: PostPartnerSupportMessageDto) {
    return this.cases.postMessageAsPartner(providerSupportScope(ctx), id, dto.body);
  }

  @Post(":id/reopen")
  reopen(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.cases.reopenAsPartner(providerSupportScope(ctx), id);
  }
}

/** Support from the shop panel; `:sellerId` picks the shop, and SellerAuthGuard checks membership. Any shop status may ask (a suspended shop most of all). */
@Controller("seller-organizations/:sellerId/support/cases")
@UseGuards(SessionAuthGuard, SellerAuthGuard)
export class SellerSupportController {
  constructor(private readonly cases: SupportCaseService) {}

  @Get()
  list(@CurrentSellerContext() ctx: ResolvedSellerContext, @Query() query: ListMySupportCasesQueryDto) {
    return this.cases.listForPartner(sellerSupportScope(ctx), query);
  }

  @Post()
  create(@CurrentSellerContext() ctx: ResolvedSellerContext, @Body() dto: CreatePartnerSupportCaseDto) {
    return this.cases.createAsPartner(sellerSupportScope(ctx), { ...dto, category: dto.category as SupportCaseCategory });
  }

  @Get(":id")
  get(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.cases.getForPartner(sellerSupportScope(ctx), id);
  }

  @Post(":id/messages")
  postMessage(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("id", ParseUUIDPipe) id: string, @Body() dto: PostPartnerSupportMessageDto) {
    return this.cases.postMessageAsPartner(sellerSupportScope(ctx), id, dto.body);
  }

  @Post(":id/reopen")
  reopen(@CurrentSellerContext() ctx: ResolvedSellerContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.cases.reopenAsPartner(sellerSupportScope(ctx), id);
  }
}
