import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { AdminAuditLogService } from "../admin/audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../admin/auth/admin-context.types";
import { InsuranceProviderNotFoundException } from "../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto } from "../../common/pagination/pagination.dto";
import { toInsuranceProviderDto } from "./insurance-mapper";
import type { CreateInsuranceProviderDto, ListInsuranceProvidersQueryDto, SetInsuranceListedDto, SetInsuranceVerificationStatusDto, UpdateInsuranceProviderDto } from "./dto/insurance.dto";

/**
 * Admin CRUD + verification lifecycle for insurance providers — a
 * discovery/comparison directory, never an underwriting system (spec:
 * "build discovery/comparison, NOT underwriting engines"). Mirrors
 * AnimalSupportOrganizationService's own admin-CRUD-with-audit shape.
 */
@Injectable()
export class InsuranceProviderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AdminAuditLogService,
  ) {}

  private async getRawOrThrow(id: string) {
    const row = await this.prisma.insuranceProvider.findUnique({ where: { id } });
    if (!row) throw new InsuranceProviderNotFoundException({ providerId: id });
    return row;
  }

  async adminList(query: ListInsuranceProvidersQueryDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.InsuranceProviderWhereInput = { country: query.country };
    const [rows, total] = await Promise.all([
      this.prisma.insuranceProvider.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.insuranceProvider.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toInsuranceProviderDto), total, page, pageSize);
  }

  async adminGet(id: string) {
    return toInsuranceProviderDto(await this.getRawOrThrow(id));
  }

  async create(admin: ResolvedAdminContext, dto: CreateInsuranceProviderDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.insuranceProvider.create({
        data: {
          name: dto.name,
          description: dto.description,
          country: dto.country,
          contactEmail: dto.contactEmail,
          contactPhone: dto.contactPhone,
          websiteUrl: dto.websiteUrl,
        },
      });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "insurance_provider.created", entityType: "InsuranceProvider", entityId: created.id, afterSummary: { name: created.name }, tx });
      return created;
    });
    return toInsuranceProviderDto(row);
  }

  async update(admin: ResolvedAdminContext, id: string, dto: UpdateInsuranceProviderDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      await this.getRawOrThrow(id);
      const updated = await tx.insuranceProvider.update({ where: { id }, data: dto });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "insurance_provider.updated", entityType: "InsuranceProvider", entityId: id, tx });
      return updated;
    });
    return toInsuranceProviderDto(row);
  }

  async setVerificationStatus(admin: ResolvedAdminContext, id: string, dto: SetInsuranceVerificationStatusDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await this.getRawOrThrow(id);
      const updated = await tx.insuranceProvider.update({ where: { id }, data: { status: dto.status } });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "insurance_provider.verification_changed",
        entityType: "InsuranceProvider",
        entityId: id,
        beforeSummary: { status: existing.status },
        afterSummary: { status: updated.status },
        tx,
      });
      return updated;
    });
    return toInsuranceProviderDto(row);
  }

  async setPubliclyListed(admin: ResolvedAdminContext, id: string, dto: SetInsuranceListedDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await this.getRawOrThrow(id);
      const updated = await tx.insuranceProvider.update({ where: { id }, data: { isPubliclyListed: dto.isPubliclyListed } });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "insurance_provider.listed_changed",
        entityType: "InsuranceProvider",
        entityId: id,
        beforeSummary: { isPubliclyListed: existing.isPubliclyListed },
        afterSummary: { isPubliclyListed: updated.isPubliclyListed },
        tx,
      });
      return updated;
    });
    return toInsuranceProviderDto(row);
  }

  async requestLogoUpload(id: string, contentType: string, fileSizeBytes: number) {
    await this.getRawOrThrow(id);
    return this.storage.createInsuranceProviderLogoUploadTarget(id, contentType, fileSizeBytes);
  }
}
