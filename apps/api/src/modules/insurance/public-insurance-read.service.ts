import { Injectable } from "@nestjs/common";
import { InsuranceVerificationStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { InsuranceProductNotFoundException, InsuranceProviderNotFoundException } from "../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto } from "../../common/pagination/pagination.dto";
import { toInsuranceProductDto, toInsuranceProviderDto } from "./insurance-mapper";
import type { CompareInsuranceProductsQueryDto, ListInsuranceProductsQueryDto, ListInsuranceProvidersQueryDto } from "./dto/insurance.dto";

const PRODUCT_INCLUDE = { provider: true } satisfies Prisma.InsuranceProductInclude;
const LISTED_FILTER = { status: InsuranceVerificationStatus.VERIFIED, isPubliclyListed: true };

/**
 * Public, anonymous-readable insurance discovery directory (spec: "public
 * browsing" for insurance discovery/comparison must work without auth) —
 * mirrors PublicAnimalSupportReadService's own "public half never imports
 * the admin-mutating half" layering. Only VERIFIED + isPubliclyListed
 * providers/products are ever reachable here.
 */
@Injectable()
export class PublicInsuranceReadService {
  constructor(private readonly prisma: PrismaService) {}

  async listProviders(query: ListInsuranceProvidersQueryDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.InsuranceProviderWhereInput = { ...LISTED_FILTER, country: query.country };
    const [rows, total] = await Promise.all([
      this.prisma.insuranceProvider.findMany({ where, orderBy: { name: "asc" }, skip, take }),
      this.prisma.insuranceProvider.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toInsuranceProviderDto), total, page, pageSize);
  }

  async getProvider(id: string) {
    const row = await this.prisma.insuranceProvider.findFirst({ where: { id, ...LISTED_FILTER } });
    if (!row) throw new InsuranceProviderNotFoundException({ providerId: id });
    return toInsuranceProviderDto(row);
  }

  async listProducts(query: ListInsuranceProductsQueryDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.InsuranceProductWhereInput = {
      status: InsuranceVerificationStatus.VERIFIED,
      isPubliclyListed: true,
      provider: LISTED_FILTER,
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

  async getProduct(id: string) {
    const row = await this.prisma.insuranceProduct.findFirst({
      where: { id, status: InsuranceVerificationStatus.VERIFIED, isPubliclyListed: true, provider: LISTED_FILTER },
      include: PRODUCT_INCLUDE,
    });
    if (!row) throw new InsuranceProductNotFoundException({ productId: id });
    return toInsuranceProductDto(row);
  }

  /**
   * Side-by-side comparison of specific products — never a ranked
   * "best plan" recommendation, just the same structured fields
   * (coverage/premium/deductible/waiting period/annual limit/exclusions)
   * laid out for the household to read themselves (spec: comparison view,
   * never an AI eligibility/plan recommendation).
   */
  async compareProducts(query: CompareInsuranceProductsQueryDto) {
    const ids = query.productIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const rows = await this.prisma.insuranceProduct.findMany({
      where: { id: { in: ids }, status: InsuranceVerificationStatus.VERIFIED, isPubliclyListed: true, provider: LISTED_FILTER },
      include: PRODUCT_INCLUDE,
    });
    return rows.map(toInsuranceProductDto);
  }
}
