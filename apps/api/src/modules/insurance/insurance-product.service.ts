import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AdminAuditLogService } from "../admin/audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../admin/auth/admin-context.types";
import { InsuranceProductNotFoundException, InsuranceProviderNotFoundException } from "../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto } from "../../common/pagination/pagination.dto";
import { toInsuranceProductDto } from "./insurance-mapper";
import type { CreateInsuranceProductDto, ListInsuranceProductsQueryDto, SetInsuranceListedDto, SetInsuranceVerificationStatusDto, UpdateInsuranceProductDto } from "./dto/insurance.dto";

const PRODUCT_INCLUDE = { provider: true } satisfies Prisma.InsuranceProductInclude;

/**
 * Admin CRUD for insurance products (spec: "do not over-normalize if
 * product terms vary substantially" — coverageTypes/exclusions stay
 * structured, coverageSummary/termsSource stay free text). exclusions is a
 * required field on create, never defaulted away, so a product can never be
 * published without the frontend having exclusion data to show.
 */
@Injectable()
export class InsuranceProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
  ) {}

  private async getRawOrThrow(id: string) {
    const row = await this.prisma.insuranceProduct.findUnique({ where: { id }, include: PRODUCT_INCLUDE });
    if (!row) throw new InsuranceProductNotFoundException({ productId: id });
    return row;
  }

  async adminList(query: ListInsuranceProductsQueryDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.InsuranceProductWhereInput = {
      country: query.country,
      providerId: query.providerId,
      speciesEligibility: query.species ? { has: query.species } : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.insuranceProduct.findMany({ where, include: PRODUCT_INCLUDE, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.insuranceProduct.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toInsuranceProductDto), total, page, pageSize);
  }

  async adminGet(id: string) {
    return toInsuranceProductDto(await this.getRawOrThrow(id));
  }

  async create(admin: ResolvedAdminContext, providerId: string, dto: CreateInsuranceProductDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const provider = await tx.insuranceProvider.findUnique({ where: { id: providerId } });
      if (!provider) throw new InsuranceProviderNotFoundException({ providerId });

      const created = await tx.insuranceProduct.create({
        data: {
          providerId,
          name: dto.name,
          country: dto.country,
          speciesEligibility: dto.speciesEligibility,
          minAgeMonths: dto.minAgeMonths,
          maxAgeMonths: dto.maxAgeMonths,
          coverageTypes: dto.coverageTypes,
          coverageSummary: dto.coverageSummary,
          waitingPeriodDays: dto.waitingPeriodDays,
          deductibleAmountIrr: dto.deductibleAmountIrr,
          annualLimitIrr: dto.annualLimitIrr,
          coinsurancePercent: dto.coinsurancePercent,
          premiumMinIrr: dto.premiumMinIrr,
          premiumMaxIrr: dto.premiumMaxIrr,
          exclusions: dto.exclusions,
          termsSource: dto.termsSource,
          termsUrl: dto.termsUrl,
        },
        include: PRODUCT_INCLUDE,
      });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "insurance_product.created", entityType: "InsuranceProduct", entityId: created.id, afterSummary: { name: created.name }, tx });
      return created;
    });
    return toInsuranceProductDto(row);
  }

  async update(admin: ResolvedAdminContext, id: string, dto: UpdateInsuranceProductDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      await this.getRawOrThrow(id);
      const updated = await tx.insuranceProduct.update({ where: { id }, data: dto, include: PRODUCT_INCLUDE });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "insurance_product.updated", entityType: "InsuranceProduct", entityId: id, tx });
      return updated;
    });
    return toInsuranceProductDto(row);
  }

  async setVerificationStatus(admin: ResolvedAdminContext, id: string, dto: SetInsuranceVerificationStatusDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await this.getRawOrThrow(id);
      const updated = await tx.insuranceProduct.update({ where: { id }, data: { status: dto.status }, include: PRODUCT_INCLUDE });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "insurance_product.verification_changed",
        entityType: "InsuranceProduct",
        entityId: id,
        beforeSummary: { status: existing.status },
        afterSummary: { status: updated.status },
        tx,
      });
      return updated;
    });
    return toInsuranceProductDto(row);
  }

  async setPubliclyListed(admin: ResolvedAdminContext, id: string, dto: SetInsuranceListedDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await this.getRawOrThrow(id);
      const updated = await tx.insuranceProduct.update({ where: { id }, data: { isPubliclyListed: dto.isPubliclyListed }, include: PRODUCT_INCLUDE });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "insurance_product.listed_changed",
        entityType: "InsuranceProduct",
        entityId: id,
        beforeSummary: { isPubliclyListed: existing.isPubliclyListed },
        afterSummary: { isPubliclyListed: updated.isPubliclyListed },
        tx,
      });
      return updated;
    });
    return toInsuranceProductDto(row);
  }
}
