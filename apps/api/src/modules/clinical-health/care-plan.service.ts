import { Injectable } from "@nestjs/common";
import { CarePlanItemStatus, SourceType } from "@prisma/client";
import type { CarePlanDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { CarePlanItemNotFoundException, CarePlanNotFoundException } from "../../common/errors/api-exception";
import { CARE_PLAN_INCLUDE, toCarePlanDto } from "./clinical-health-mapper";
import { assertVisitBelongsToPet } from "./clinical-link.util";
import type { CreateCarePlanDto, UpdateCarePlanItemStatusDto } from "./dto/care-plan.dto";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";

/**
 * Follow-up tasks (spec: "Reuse Care Calendar where appropriate. Do not
 * create duplicate reminder infrastructure.") are represented as a
 * CarePlanItem with type FOLLOW_UP and a dueAt — Care Calendar's own event
 * model is booking-shaped (one row per Booking category) and not a fit for
 * an arbitrary provider-authored task list, so rather than force an
 * ill-fitting integration, care plan items are the single source of truth
 * for follow-up state; HealthOverviewService's unresolvedCarePlanItemsCount
 * surfaces them without a second reminder engine.
 */
@Injectable()
export class CarePlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async create(ctx: ResolvedProviderContext, dto: CreateCarePlanDto): Promise<CarePlanDto> {
    await assertVisitBelongsToPet(this.prisma, dto.originatingVisitId, dto.petId);

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.carePlan.create({
        data: {
          petId: dto.petId,
          providerOrganizationId: ctx.organizationId,
          providerUserId: ctx.providerUserId,
          originatingVisitId: dto.originatingVisitId,
          title: dto.title,
          notes: dto.notes,
          items: dto.items
            ? { create: dto.items.map((item) => ({ type: item.type as never, title: item.title, detail: item.detail, dueAt: item.dueAt ? new Date(item.dueAt) : undefined, source: SourceType.PROVIDER })) }
            : undefined,
        },
        include: CARE_PLAN_INCLUDE,
      });
      await this.events.publish("CarePlanCreated", { petId: dto.petId, carePlanId: created.id }, { tx, aggregateType: "Pet", aggregateId: dto.petId });
      return created;
    });
    return toCarePlanDto(row);
  }

  async list(petId: string): Promise<CarePlanDto[]> {
    const rows = await this.prisma.carePlan.findMany({ where: { petId }, include: CARE_PLAN_INCLUDE, orderBy: { createdAt: "desc" } });
    return rows.map(toCarePlanDto);
  }

  async get(petId: string, carePlanId: string) {
    const row = await this.prisma.carePlan.findUnique({ where: { id: carePlanId }, include: CARE_PLAN_INCLUDE });
    if (!row || row.petId !== petId) throw new CarePlanNotFoundException({ carePlanId });
    return row;
  }

  async addItem(petId: string, carePlanId: string, item: { type: string; title: string; detail?: string; dueAt?: string }): Promise<CarePlanDto> {
    await this.get(petId, carePlanId); // existence + ownership check

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.carePlanItem.create({ data: { carePlanId, type: item.type as never, title: item.title, detail: item.detail, dueAt: item.dueAt ? new Date(item.dueAt) : undefined, source: SourceType.PROVIDER } });
      const updated = await tx.carePlan.findUniqueOrThrow({ where: { id: carePlanId }, include: CARE_PLAN_INCLUDE });
      await this.events.publish("CarePlanUpdated", { petId, carePlanId }, { tx, aggregateType: "Pet", aggregateId: petId });
      return updated;
    });
    return toCarePlanDto(row);
  }

  async updateItemStatus(petId: string, carePlanId: string, itemId: string, dto: UpdateCarePlanItemStatusDto): Promise<CarePlanDto> {
    const plan = await this.get(petId, carePlanId);
    const item = plan.items.find((i) => i.id === itemId);
    if (!item) throw new CarePlanItemNotFoundException({ itemId });

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.carePlanItem.update({
        where: { id: itemId },
        data: { status: dto.status as never, completedAt: dto.status === CarePlanItemStatus.COMPLETED ? new Date() : item.completedAt },
      });
      const updated = await tx.carePlan.findUniqueOrThrow({ where: { id: carePlanId }, include: CARE_PLAN_INCLUDE });
      await this.events.publish("CarePlanUpdated", { petId, carePlanId, itemId, status: dto.status }, { tx, aggregateType: "Pet", aggregateId: petId });
      return updated;
    });
    return toCarePlanDto(row);
  }
}
