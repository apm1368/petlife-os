import { Injectable } from "@nestjs/common";
import type { Prisma, ProviderVerificationStatus, SellerStatus, SellerVerificationStatus } from "@prisma/client";
import type { AdminProviderOrgSummaryDto, AdminSellerOrgSummaryDto, PaginatedDto } from "@petlife/types";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { ProviderOrganizationNotFoundException, SellerOrganizationNotFoundException } from "../../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto, type PaginationQueryDto } from "../../../common/pagination/pagination.dto";

/**
 * Read-only Provider/Seller org lookups for the admin surface — how an
 * admin locates the organization behind a verification override or a
 * TrustCase(subjectType: PROVIDER | SELLER). Never mutates; verification
 * transitions live in AdminVerificationService, trust actions in
 * TrustActionService.
 */
@Injectable()
export class AdminOrgService {
  constructor(private readonly prisma: PrismaService) {}

  async listProviders(q: string | undefined, query: PaginationQueryDto): Promise<PaginatedDto<AdminProviderOrgSummaryDto>> {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.ProviderOrganizationWhereInput = q ? { name: { contains: q, mode: "insensitive" } } : {};
    const [rows, total] = await Promise.all([
      this.prisma.providerOrganization.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.providerOrganization.count({ where }),
    ]);
    return toPaginatedDto(rows.map((r) => toProviderSummary(r)), total, page, pageSize);
  }

  async getProvider(id: string): Promise<AdminProviderOrgSummaryDto> {
    const row = await this.prisma.providerOrganization.findUnique({ where: { id } });
    if (!row) throw new ProviderOrganizationNotFoundException({ providerOrganizationId: id });
    return toProviderSummary(row);
  }

  async listSellers(q: string | undefined, query: PaginationQueryDto): Promise<PaginatedDto<AdminSellerOrgSummaryDto>> {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.SellerOrganizationWhereInput = q ? { name: { contains: q, mode: "insensitive" } } : {};
    const [rows, total] = await Promise.all([
      this.prisma.sellerOrganization.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.sellerOrganization.count({ where }),
    ]);
    return toPaginatedDto(rows.map((r) => toSellerSummary(r)), total, page, pageSize);
  }

  async getSeller(id: string): Promise<AdminSellerOrgSummaryDto> {
    const row = await this.prisma.sellerOrganization.findUnique({ where: { id } });
    if (!row) throw new SellerOrganizationNotFoundException({ sellerOrganizationId: id });
    return toSellerSummary(row);
  }
}

function toProviderSummary(row: { id: string; name: string; type: string; verificationStatus: ProviderVerificationStatus; createdAt: Date }): AdminProviderOrgSummaryDto {
  return { id: row.id, name: row.name, type: row.type, verificationStatus: row.verificationStatus as never, createdAt: row.createdAt.toISOString() };
}

function toSellerSummary(row: { id: string; name: string; status: SellerStatus; verificationStatus: SellerVerificationStatus; createdAt: Date }): AdminSellerOrgSummaryDto {
  return { id: row.id, name: row.name, status: row.status as never, verificationStatus: row.verificationStatus as never, createdAt: row.createdAt.toISOString() };
}
