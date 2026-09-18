import { Injectable } from "@nestjs/common";
import type { ProviderClinicalAlertDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProviderClinicalAlertNotFoundException } from "../../common/errors/api-exception";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { toProviderClinicalAlertDto } from "./vet-panel.mapper";
import type { CreateClinicalAlertDto } from "./dto/clinical-alert.dto";

/**
 * Staff-safety banners ("muzzle required", "prior anaphylaxis to
 * cephalosporins"). Scoped to the authoring organisation and never returned
 * by a consumer endpoint — a handling note written so a nurse does not get
 * bitten is an internal operational record, not an owner-facing assertion
 * about their animal. Resolving keeps the row.
 */
@Injectable()
export class ProviderClinicalAlertService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: ResolvedProviderContext, petId: string, includeResolved = false): Promise<ProviderClinicalAlertDto[]> {
    const rows = await this.prisma.providerClinicalAlert.findMany({
      where: { petId, providerOrganizationId: ctx.organizationId, ...(includeResolved ? {} : { resolvedAt: null }) },
      orderBy: [{ resolvedAt: "asc" }, { createdAt: "desc" }],
    });
    return rows.map(toProviderClinicalAlertDto);
  }

  async create(ctx: ResolvedProviderContext, dto: CreateClinicalAlertDto): Promise<ProviderClinicalAlertDto> {
    const row = await this.prisma.providerClinicalAlert.create({
      data: {
        petId: dto.petId,
        providerOrganizationId: ctx.organizationId,
        createdByProviderUserId: ctx.providerUserId,
        type: dto.type,
        severity: dto.severity,
        message: dto.message,
      },
    });
    return toProviderClinicalAlertDto(row);
  }

  async resolve(ctx: ResolvedProviderContext, petId: string, alertId: string): Promise<ProviderClinicalAlertDto> {
    const existing = await this.prisma.providerClinicalAlert.findUnique({ where: { id: alertId } });
    if (!existing || existing.petId !== petId || existing.providerOrganizationId !== ctx.organizationId) {
      throw new ProviderClinicalAlertNotFoundException({ alertId });
    }
    const row = await this.prisma.providerClinicalAlert.update({
      where: { id: alertId },
      // Re-resolving is a no-op rather than an error: the outcome the caller wanted is already true.
      data: { resolvedAt: existing.resolvedAt ?? new Date(), resolvedByProviderUserId: existing.resolvedByProviderUserId ?? ctx.providerUserId },
    });
    return toProviderClinicalAlertDto(row);
  }
}
