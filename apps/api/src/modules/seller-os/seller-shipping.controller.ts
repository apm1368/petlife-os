import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { SellerMembershipRole, ShippingProvider } from "@prisma/client";
import { ArrayMaxSize, IsArray, IsIn, IsLatitude, IsLongitude, IsOptional, IsString, Length, Matches } from "class-validator";
import type { SellerShippingProfileDto } from "@petlife/types";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ShippingMethodSettingsService } from "../commerce/logistics/shipping-method-settings.service";
import { SellerAuthGuard } from "./auth/seller-auth.guard";
import { RequireSellerRole } from "./auth/require-seller-role.decorator";
import { CurrentSellerContext } from "./auth/current-seller-context.decorator";
import type { ResolvedSellerContext } from "./auth/seller-context.types";

const SELLABLE = [ShippingProvider.OPETLIFE_COURIER, ShippingProvider.SNAPPBOX, ShippingProvider.ALOPEYK, ShippingProvider.POST_PISHTAZ];

class UpdateSellerShippingDto {
  @IsArray() @ArrayMaxSize(8) @IsIn(SELLABLE, { each: true }) offeredProviders!: ShippingProvider[];
  @IsOptional() @IsString() @Length(1, 120) contactName?: string;
  @IsOptional() @IsString() @Length(4, 40) phone?: string;
  @IsOptional() @IsString() @Length(3, 300) addressLine?: string;
  @IsOptional() @IsString() @Length(1, 120) city?: string;
  @IsOptional() @IsString() @Length(1, 120) region?: string;
  @IsOptional() @IsString() @Length(1, 120) area?: string;
  @IsOptional() @Matches(/^[0-9]{10}$/) postalCode?: string;
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
  @IsOptional() @IsString() @Length(1, 500) instructions?: string;
}

/** A seller's shipping settings: which platform methods it offers and the pickup address couriers come to. */
@Controller("seller-organizations/:sellerId/shipping-profile")
@UseGuards(SessionAuthGuard, SellerAuthGuard)
export class SellerShippingController {
  constructor(private readonly prisma: PrismaService, private readonly methods: ShippingMethodSettingsService) {}

  private async dto(sellerOrganizationId: string): Promise<SellerShippingProfileDto> {
    const [profile, active] = await Promise.all([this.prisma.sellerShippingProfile.findUnique({ where: { sellerOrganizationId } }), this.methods.activeProviders()]);
    return {
      sellerOrganizationId,
      offeredProviders: (profile?.offeredProviders ?? []) as unknown as SellerShippingProfileDto["offeredProviders"],
      availableProviders: SELLABLE.filter((p) => active.has(p)) as unknown as SellerShippingProfileDto["availableProviders"],
      pickup: {
        contactName: profile?.pickupContactName ?? null,
        phone: profile?.pickupPhone ?? null,
        addressLine: profile?.pickupAddressLine ?? null,
        city: profile?.pickupCity ?? null,
        region: profile?.pickupRegion ?? null,
        area: profile?.pickupArea ?? null,
        postalCode: profile?.pickupPostalCode ?? null,
        latitude: profile?.pickupLatitude ?? null,
        longitude: profile?.pickupLongitude ?? null,
        instructions: profile?.pickupInstructions ?? null,
      },
      updatedAt: profile?.updatedAt.toISOString() ?? null,
    };
  }

  @Get()
  get(@CurrentSellerContext() ctx: ResolvedSellerContext) {
    return this.dto(ctx.sellerOrganizationId);
  }

  @Put()
  @RequireSellerRole(SellerMembershipRole.ADMIN)
  async update(@CurrentSellerContext() ctx: ResolvedSellerContext, @Body() dto: UpdateSellerShippingDto) {
    const data = {
      offeredProviders: [...new Set(dto.offeredProviders)],
      pickupContactName: dto.contactName?.trim() || null,
      pickupPhone: dto.phone?.trim() || null,
      pickupAddressLine: dto.addressLine?.trim() || null,
      pickupCity: dto.city?.trim() || null,
      pickupRegion: dto.region?.trim() || null,
      pickupArea: dto.area?.trim() || null,
      pickupPostalCode: dto.postalCode ?? null,
      pickupLatitude: dto.latitude ?? null,
      pickupLongitude: dto.longitude ?? null,
      pickupInstructions: dto.instructions?.trim() || null,
    };
    await this.prisma.sellerShippingProfile.upsert({ where: { sellerOrganizationId: ctx.sellerOrganizationId }, create: { sellerOrganizationId: ctx.sellerOrganizationId, ...data }, update: data });
    return this.dto(ctx.sellerOrganizationId);
  }
}
