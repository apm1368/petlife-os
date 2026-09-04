import { Injectable } from "@nestjs/common";
import { AnimalSupportVerificationStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { StorageService } from "../storage/storage.service";
import { AdminAuditLogService } from "../admin/audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../admin/auth/admin-context.types";
import { AnimalSupportOrganizationNotFoundException } from "../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto } from "../../common/pagination/pagination.dto";
import { toAnimalSupportOrganizationDto } from "./animal-support-mapper";
import type {
  CreateAnimalSupportOrganizationDto,
  ListAnimalSupportOrganizationsQueryDto,
  SetAnimalSupportListedDto,
  SetAnimalSupportVerificationStatusDto,
  UpdateAnimalSupportOrganizationDto,
} from "./dto/animal-support.dto";

/**
 * Admin CRUD + verification lifecycle for Animal Support organizations
 * (spec: "Create first-class support organizations... reuse existing admin
 * RBAC/audit foundation — do not build a second Admin OS"). Every mutation
 * records an AdminAuditLogService row in the same transaction, mirroring
 * every other admin-mutation service in this codebase (subscriptions, CMS,
 * settlements).
 */
@Injectable()
export class AnimalSupportOrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly storage: StorageService,
    private readonly audit: AdminAuditLogService,
  ) {}

  private async getRawOrThrow(id: string) {
    const row = await this.prisma.animalSupportOrganization.findUnique({ where: { id } });
    if (!row) throw new AnimalSupportOrganizationNotFoundException({ organizationId: id });
    return row;
  }

  // -- Admin -------------------------------------------------------------

  async adminList(query: ListAnimalSupportOrganizationsQueryDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.AnimalSupportOrganizationWhereInput = {
      verificationStatus: query.verificationStatus,
      name: query.q ? { contains: query.q, mode: "insensitive" } : undefined,
    };
    const [rows, total] = await Promise.all([
      this.prisma.animalSupportOrganization.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.animalSupportOrganization.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toAnimalSupportOrganizationDto), total, page, pageSize);
  }

  async adminGet(id: string) {
    return toAnimalSupportOrganizationDto(await this.getRawOrThrow(id));
  }

  async create(admin: ResolvedAdminContext, dto: CreateAnimalSupportOrganizationDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.animalSupportOrganization.create({
        data: {
          type: dto.type,
          name: dto.name,
          description: dto.description,
          location: dto.location,
          latitude: dto.latitude,
          longitude: dto.longitude,
          contactEmail: dto.contactEmail,
          contactPhone: dto.contactPhone,
        },
      });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "animal_support_organization.created",
        entityType: "AnimalSupportOrganization",
        entityId: created.id,
        afterSummary: { name: created.name, type: created.type },
        tx,
      });
      return created;
    });
    return toAnimalSupportOrganizationDto(row);
  }

  async update(admin: ResolvedAdminContext, id: string, dto: UpdateAnimalSupportOrganizationDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.animalSupportOrganization.findUnique({ where: { id } });
      if (!existing) throw new AnimalSupportOrganizationNotFoundException({ organizationId: id });
      const updated = await tx.animalSupportOrganization.update({ where: { id }, data: dto });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "animal_support_organization.updated",
        entityType: "AnimalSupportOrganization",
        entityId: id,
        tx,
      });
      return updated;
    });
    return toAnimalSupportOrganizationDto(row);
  }

  /** spec: "verify organization" — the only place verificationStatus is ever written, always audited. */
  async setVerificationStatus(admin: ResolvedAdminContext, id: string, dto: SetAnimalSupportVerificationStatusDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.animalSupportOrganization.findUnique({ where: { id } });
      if (!existing) throw new AnimalSupportOrganizationNotFoundException({ organizationId: id });
      const updated = await tx.animalSupportOrganization.update({ where: { id }, data: { verificationStatus: dto.verificationStatus } });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "animal_support_organization.verification_changed",
        entityType: "AnimalSupportOrganization",
        entityId: id,
        reason: dto.reason,
        beforeSummary: { verificationStatus: existing.verificationStatus },
        afterSummary: { verificationStatus: updated.verificationStatus },
        tx,
      });
      if (updated.verificationStatus === AnimalSupportVerificationStatus.VERIFIED) {
        await this.events.publish("AnimalSupportOrganizationVerified", { organizationId: id }, { tx, aggregateType: "AnimalSupportOrganization", aggregateId: id });
      }
      return updated;
    });
    return toAnimalSupportOrganizationDto(row);
  }

  /** spec: "approve/suspend campaigns" implies orgs can also be listed/unlisted independent of verification history. */
  async setPubliclyListed(admin: ResolvedAdminContext, id: string, dto: SetAnimalSupportListedDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.animalSupportOrganization.findUnique({ where: { id } });
      if (!existing) throw new AnimalSupportOrganizationNotFoundException({ organizationId: id });
      const updated = await tx.animalSupportOrganization.update({ where: { id }, data: { isPubliclyListed: dto.isPubliclyListed } });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "animal_support_organization.listed_changed",
        entityType: "AnimalSupportOrganization",
        entityId: id,
        beforeSummary: { isPubliclyListed: existing.isPubliclyListed },
        afterSummary: { isPubliclyListed: updated.isPubliclyListed },
        tx,
      });
      return updated;
    });
    return toAnimalSupportOrganizationDto(row);
  }

  async requestLogoUpload(id: string, contentType: string, fileSizeBytes: number) {
    await this.getRawOrThrow(id);
    return this.storage.createAnimalSupportOrgMediaUploadTarget(id, contentType, fileSizeBytes);
  }
}
