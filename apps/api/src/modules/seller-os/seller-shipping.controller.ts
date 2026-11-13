import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { SellerMembershipRole, ShippingProvider } from "@prisma/client";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Length, Matches } from "class-validator";
import { IsIranLatitude, IsIranLongitude, pinFromInput } from "../../common/geo/geo";
import type { SellerShippingProfileDto } from "@petlife/types";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { ShippingMethodSettingsService } from "../commerce/logistics/shipping-method-settings.service";
import { SellerAuthGuard } from "./auth/seller-auth.guard";
import { RequireSellerRole } from "./auth/require-seller-role.decorator";
import { CurrentSellerContext } from "./auth/current-seller-context.decorator";
import type { ResolvedSellerContext } from "./auth/seller-context.types";

const SELLABLE = [ShippingProvider.OPETLIFE_COURIER, ShippingProvider.SNAPPBOX, ShippingProvider.ALOPEYK, ShippingProvider.SNAPPBOX_APP, ShippingProvider.ALOPEYK_APP, ShippingProvider.POST_PISHTAZ];

class UpdateSellerShippingDto {
  @IsArray() @ArrayMaxSize(8) @IsIn(SELLABLE, { each: true }) offeredProviders!: ShippingProvider[];
  @IsOptional() @IsString() @Length(1, 120) contactName?: string;
  @IsOptional() @IsString() @Length(4, 40) phone?: string;
  @IsOptional() @IsString() @Length(3, 300) addressLine?: string;
  @IsOptional() @IsString() @Length(1, 120) city?: string;
  @IsOptional() @IsString() @Length(1, 120) region?: string;
  @IsOptional() @IsString() @Length(1, 120) area?: string;
  @IsOptional() @Matches(/^[0-9]{10}$/) postalCode?: string;
  /** The pickup pin couriers come to (inside Iran), with the seller's consent; omitted = the pin is removed. */
  @IsOptional() @IsIranLatitude() latitude?: number;
  @IsOptional() @IsIranLongitude() longitude?: number;
  @IsOptional() @IsBoolean() locationConsent?: boolean;
  @IsOptional() @IsString() @Length(1, 500) instructions?: string;
}

/** A seller's shipping settings: which platform methods it offers and the pickup address couriers come to. */
@Controller("seller-organizations/:sellerId/shipping-profile")
@UseGuards(SessionAuthGuard, SellerAuthGuard)
export class SellerShippingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly methods: ShippingMethodSettingsService,
    private readonly events: DomainEventsService,
  ) {}

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
        pinConsentAt: profile?.pickupPinConsentAt?.toISOString() ?? null,
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
    const pin = pinFromInput(dto);
    const current = pin ? await this.prisma.sellerShippingProfile.findUnique({ where: { sellerOrganizationId: ctx.sellerOrganizationId }, select: { pickupLatitude: true, pickupLongitude: true, pickupPinConsentAt: true } }) : null;
    const samePin = !!pin && current?.pickupLatitude === pin.latitude && current.pickupLongitude === pin.longitude;
    const data = {
      offeredProviders: [...new Set(dto.offeredProviders)],
      pickupContactName: dto.contactName?.trim() || null,
      pickupPhone: dto.phone?.trim() || null,
      pickupAddressLine: dto.addressLine?.trim() || null,
      pickupCity: dto.city?.trim() || null,
      pickupRegion: dto.region?.trim() || null,
      pickupArea: dto.area?.trim() || null,
      pickupPostalCode: dto.postalCode ?? null,
      pickupLatitude: pin?.latitude ?? null,
      pickupLongitude: pin?.longitude ?? null,
      pickupPinConsentAt: pin ? (samePin && current?.pickupPinConsentAt ? current.pickupPinConsentAt : new Date()) : null,
      pickupInstructions: dto.instructions?.trim() || null,
    };
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.sellerShippingProfile.findUnique({ where: { sellerOrganizationId: ctx.sellerOrganizationId } });
      await tx.sellerShippingProfile.upsert({ where: { sellerOrganizationId: ctx.sellerOrganizationId }, create: { sellerOrganizationId: ctx.sellerOrganizationId, ...data }, update: data });
      // Pickup points drive courier prices, so every change keeps who made it and what it was before.
      const pick = (p: typeof data | null) => (p ? { offeredProviders: p.offeredProviders, city: p.pickupCity, area: p.pickupArea, addressLine: p.pickupAddressLine, latitude: p.pickupLatitude, longitude: p.pickupLongitude } : null);
      await this.events.publish("SellerShippingProfileChanged", { sellerOrganizationId: ctx.sellerOrganizationId, changedByUserId: ctx.userId, before: pick(before), after: pick(data) }, { tx, aggregateType: "SellerOrganization", aggregateId: ctx.sellerOrganizationId });
    });
    return this.dto(ctx.sellerOrganizationId);
  }
}
