import { Injectable } from "@nestjs/common";
import type { SellerOrganization } from "@prisma/client";
import type { SellerOrganizationDetailDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { SellerOrganizationNotFoundException } from "../../common/errors/api-exception";
import type { ResolvedSellerContext } from "./auth/seller-context.types";

function toDetailDto(org: SellerOrganization): SellerOrganizationDetailDto {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    verificationStatus: org.verificationStatus as unknown as SellerOrganizationDetailDto["verificationStatus"],
    status: org.status as unknown as SellerOrganizationDetailDto["status"],
    countryCode: org.countryCode,
    city: org.city,
    logoUrl: org.logoUrl,
    description: org.description,
    supportContactEmail: org.supportContactEmail,
    supportContactPhone: org.supportContactPhone,
    defaultCurrency: org.defaultCurrency,
    timezone: org.timezone,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
}

/** Seller Settings backing service (spec section 49) — deliberately minimal: legal/verification fields are never editable here (owned by an admin/verification workflow this project doesn't build in H09). */
@Injectable()
export class SellerOrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  async getDetail(ctx: ResolvedSellerContext): Promise<SellerOrganizationDetailDto> {
    const org = await this.prisma.sellerOrganization.findUnique({ where: { id: ctx.sellerOrganizationId } });
    if (!org) throw new SellerOrganizationNotFoundException({ sellerOrganizationId: ctx.sellerOrganizationId });
    return toDetailDto(org);
  }

  async updateSettings(
    ctx: ResolvedSellerContext,
    input: { supportContactEmail?: string | null; supportContactPhone?: string | null; timezone?: string; city?: string | null; description?: string | null },
  ): Promise<SellerOrganizationDetailDto> {
    const org = await this.prisma.sellerOrganization.update({
      where: { id: ctx.sellerOrganizationId },
      data: {
        ...(input.supportContactEmail !== undefined ? { supportContactEmail: input.supportContactEmail } : {}),
        ...(input.supportContactPhone !== undefined ? { supportContactPhone: input.supportContactPhone } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });
    return toDetailDto(org);
  }
}
