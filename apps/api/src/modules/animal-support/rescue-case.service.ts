import { Injectable } from "@nestjs/common";
import { Prisma, RescueCaseStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { StorageService } from "../storage/storage.service";
import { AdminAuditLogService } from "../admin/audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../admin/auth/admin-context.types";
import { AnimalSupportOrganizationNotFoundException, RescueCaseNotFoundException } from "../../common/errors/api-exception";
import { resolvePagination, toPaginatedDto } from "../../common/pagination/pagination.dto";
import { toRescueCaseDto } from "./animal-support-mapper";
import type { CreateRescueCaseDto, ListRescueCasesQueryDto, UpdateRescueCaseStatusDto } from "./dto/animal-support.dto";

const CASE_INCLUDE = { organization: { select: { name: true } } } satisfies Prisma.RescueCaseInclude;

/**
 * Rescue cases belong to a verified organization (spec: "Create RescueCase").
 * Unlike Lost Pet, the spec only asks to "keep it extensible" here, not a
 * strict transition table — an admin/org-curator may move a case to any of
 * the six documented statuses; CLOSED/RESOLVED just stamp closedAt.
 */
@Injectable()
export class RescueCaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly storage: StorageService,
    private readonly audit: AdminAuditLogService,
  ) {}

  private async getRawOrThrow(id: string) {
    const row = await this.prisma.rescueCase.findUnique({ where: { id }, include: CASE_INCLUDE });
    if (!row) throw new RescueCaseNotFoundException({ rescueCaseId: id });
    return row;
  }

  async adminList(query: ListRescueCasesQueryDto) {
    const { page, pageSize, skip, take } = resolvePagination(query);
    const where: Prisma.RescueCaseWhereInput = { status: query.status, organizationId: query.organizationId };
    const [rows, total] = await Promise.all([
      this.prisma.rescueCase.findMany({ where, include: CASE_INCLUDE, orderBy: { createdAt: "desc" }, skip, take }),
      this.prisma.rescueCase.count({ where }),
    ]);
    return toPaginatedDto(rows.map(toRescueCaseDto), total, page, pageSize);
  }

  async adminGet(id: string) {
    return toRescueCaseDto(await this.getRawOrThrow(id));
  }

  async create(admin: ResolvedAdminContext, organizationId: string, dto: CreateRescueCaseDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const org = await tx.animalSupportOrganization.findUnique({ where: { id: organizationId } });
      if (!org) throw new AnimalSupportOrganizationNotFoundException({ organizationId });

      const created = await tx.rescueCase.create({
        data: {
          organizationId,
          title: dto.title,
          description: dto.description,
          animalType: dto.animalType,
          location: dto.location,
          latitude: dto.latitude,
          longitude: dto.longitude,
          estimatedNeedIrr: dto.estimatedNeedIrr,
          evidenceObjectKeys: dto.evidenceObjectKeys ?? [],
        },
        include: CASE_INCLUDE,
      });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "rescue_case.created",
        entityType: "RescueCase",
        entityId: created.id,
        afterSummary: { organizationId, title: created.title },
        tx,
      });
      await this.events.publish("RescueCaseOpened", { rescueCaseId: created.id, organizationId }, { tx, aggregateType: "RescueCase", aggregateId: created.id });
      return created;
    });
    return toRescueCaseDto(row);
  }

  async setStatus(admin: ResolvedAdminContext, id: string, dto: UpdateRescueCaseStatusDto) {
    const row = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.rescueCase.findUnique({ where: { id } });
      if (!existing) throw new RescueCaseNotFoundException({ rescueCaseId: id });
      const closing = dto.status === RescueCaseStatus.RESOLVED || dto.status === RescueCaseStatus.CLOSED;
      const updated = await tx.rescueCase.update({
        where: { id },
        data: { status: dto.status, closedAt: closing ? new Date() : null },
        include: CASE_INCLUDE,
      });
      await this.audit.record({
        adminUserId: admin.adminUserId,
        action: "rescue_case.status_changed",
        entityType: "RescueCase",
        entityId: id,
        beforeSummary: { status: existing.status },
        afterSummary: { status: updated.status },
        tx,
      });
      return updated;
    });
    return toRescueCaseDto(row);
  }

  async requestEvidenceUpload(id: string, contentType: string, fileSizeBytes: number) {
    await this.getRawOrThrow(id);
    return this.storage.createAnimalSupportEvidenceUploadTarget(id, contentType, fileSizeBytes);
  }
}
