import { Injectable } from "@nestjs/common";
import type { Prisma, ProviderVerificationStatus, SellerStatus, SellerVerificationStatus } from "@prisma/client";
import type { AdminPartner360Dto, AdminProviderOrgSummaryDto, AdminSellerOrgSummaryDto, PaginatedDto } from "@petlife/types";
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

  async getProvider360(id: string): Promise<AdminPartner360Dto> {
    const [row, audit] = await Promise.all([this.prisma.providerOrganization.findUnique({
      where: { id },
      include: {
        locations: { select: { city: true, name: true }, take: 3 },
        providerUsers: { include: { user: { select: { displayName: true } } }, orderBy: { createdAt: "asc" }, take: 20 },
        _count: { select: { services: true, bookings: true, travelListings: true } },
      },
    }), this.prisma.adminAuditLog.findMany({ where: { entityType: "PROVIDER_ORGANIZATION", entityId: id }, include: { adminUser: { include: { user: true } } }, orderBy: { createdAt: "desc" }, take: 10 })]);
    if (!row) throw new ProviderOrganizationNotFoundException({ providerOrganizationId: id });
    return {
      id: row.id, kind: "PROVIDER", name: row.name, type: row.type, verificationStatus: row.verificationStatus,
      operationalStatus: row.verificationStatus === "SUSPENDED" ? "SUSPENDED" : "ACTIVE",
      locationSummary: row.locations.map((location) => location.name ?? location.city).filter(Boolean).join(" · ") || null,
      contactEmail: row.email, contactPhone: row.phone, createdAt: row.createdAt.toISOString(),
      team: row.providerUsers.map((member) => ({ id: member.id, displayName: member.user.displayName, role: member.role, status: member.isBookable ? "BOOKABLE" : "INTERNAL" })),
      activity: [{ key: "services", count: row._count.services }, { key: "bookings", count: row._count.bookings }, { key: "travelListings", count: row._count.travelListings }],
      auditReferences: audit.map(toAuditReference),
    };
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

  async getSeller360(id: string): Promise<AdminPartner360Dto> {
    const [row, audit] = await Promise.all([this.prisma.sellerOrganization.findUnique({
      where: { id },
      include: {
        memberships: { include: { user: { select: { displayName: true } } }, orderBy: { createdAt: "asc" }, take: 20 },
        _count: { select: { offers: true, orders: true, settlements: true } },
      },
    }), this.prisma.adminAuditLog.findMany({ where: { entityType: "SELLER_ORGANIZATION", entityId: id }, include: { adminUser: { include: { user: true } } }, orderBy: { createdAt: "desc" }, take: 10 })]);
    if (!row) throw new SellerOrganizationNotFoundException({ sellerOrganizationId: id });
    return {
      id: row.id, kind: "SELLER", name: row.name, type: "SELLER", verificationStatus: row.verificationStatus,
      operationalStatus: row.status, locationSummary: [row.city, row.countryCode].filter(Boolean).join(" · ") || null,
      contactEmail: row.supportContactEmail, contactPhone: row.supportContactPhone, createdAt: row.createdAt.toISOString(),
      team: row.memberships.map((member) => ({ id: member.id, displayName: member.user.displayName, role: member.role, status: member.status })),
      activity: [{ key: "offers", count: row._count.offers }, { key: "orders", count: row._count.orders }, { key: "settlements", count: row._count.settlements }],
      auditReferences: audit.map(toAuditReference),
    };
  }
}

function toAuditReference(row: { id: string; adminUser: { id: string; role: string; user: { displayName: string } }; action: string; entityType: string; entityId: string | null; reason: string | null; beforeSummary: unknown; afterSummary: unknown; requestId: string | null; createdAt: Date }) {
  return { id: row.id, adminUser: { id: row.adminUser.id, displayName: row.adminUser.user.displayName, role: row.adminUser.role as never }, action: row.action, entityType: row.entityType, entityId: row.entityId, reason: row.reason, beforeSummary: row.beforeSummary as Record<string, unknown> | null, afterSummary: row.afterSummary as Record<string, unknown> | null, requestId: row.requestId, createdAt: row.createdAt.toISOString() };
}

function toProviderSummary(row: { id: string; name: string; type: string; verificationStatus: ProviderVerificationStatus; createdAt: Date }): AdminProviderOrgSummaryDto {
  return { id: row.id, name: row.name, type: row.type, verificationStatus: row.verificationStatus as never, createdAt: row.createdAt.toISOString() };
}

function toSellerSummary(row: { id: string; name: string; status: SellerStatus; verificationStatus: SellerVerificationStatus; createdAt: Date }): AdminSellerOrgSummaryDto {
  return { id: row.id, name: row.name, status: row.status as never, verificationStatus: row.verificationStatus as never, createdAt: row.createdAt.toISOString() };
}
