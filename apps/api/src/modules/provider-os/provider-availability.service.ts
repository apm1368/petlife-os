import { Injectable } from "@nestjs/common";
import { AvailabilityExceptionType as PrismaAvailabilityExceptionType, BookingStatus, type ProviderAvailabilityException, type ProviderAvailabilityRule } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { AvailabilityConflictException, NotFoundApiException, ProviderAccessDeniedException, ValidationApiException } from "../../common/errors/api-exception";
import { timeStringToMinutes } from "../providers/timezone.util";
import type { ResolvedProviderContext } from "./auth/provider-context.types";
import { toProviderAvailabilityExceptionDto, toProviderAvailabilityRuleDto } from "./provider-os-dto.mapper";
import type { CreateAvailabilityRuleDto, UpdateAvailabilityRuleDto } from "./dto/availability-rule.dto";
import type { CreateAvailabilityExceptionDto, UpdateAvailabilityExceptionDto } from "./dto/availability-exception.dto";

export type ProviderAvailabilityRuleRow = ProviderAvailabilityRule;
export type ProviderAvailabilityExceptionRow = ProviderAvailabilityException;

/** A conflict is only checked against bookings that are still operationally live — a completed or already-cancelled booking can never conflict. */
const ACTIVE_BOOKING_STATUSES: BookingStatus[] = [BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN, BookingStatus.IN_PROGRESS];

/**
 * CRUD over the existing ProviderAvailabilityRule/Exception models — no new
 * availability engine, no new slot-generation logic (SlotGeneratorService,
 * Handoff 03, is untouched and keeps projecting these same rows). Per the
 * Stage 1 architecture review, conflict detection (spec section 9) only
 * applies to BLOCKED exceptions, not recurring rules — a rule's effect on
 * far-future bookings is disproportionately complex to reconcile this phase.
 */
@Injectable()
export class ProviderAvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async listRules(ctx: ResolvedProviderContext) {
    const rules = await this.prisma.providerAvailabilityRule.findMany({
      where: { providerOrganizationId: ctx.organizationId },
      orderBy: [{ dayOfWeek: "asc" }, { startLocalTime: "asc" }],
    });
    return rules.map(toProviderAvailabilityRuleDto);
  }

  private async assertLocationInOrg(ctx: ResolvedProviderContext, locationId: string) {
    const location = await this.prisma.providerLocation.findUnique({ where: { id: locationId } });
    if (!location || location.providerOrganizationId !== ctx.organizationId) throw new NotFoundApiException("Location");
    return location;
  }

  private async assertProviderUserInOrg(ctx: ResolvedProviderContext, providerUserId: string | null | undefined) {
    if (!providerUserId) return;
    const providerUser = await this.prisma.providerUser.findUnique({ where: { id: providerUserId } });
    if (!providerUser || providerUser.providerOrganizationId !== ctx.organizationId) throw new NotFoundApiException("Provider user");
  }

  private async assertServiceInOrg(ctx: ResolvedProviderContext, serviceId: string | null | undefined) {
    if (!serviceId) return;
    const service = await this.prisma.providerService.findUnique({ where: { id: serviceId } });
    if (!service || service.providerOrganizationId !== ctx.organizationId) throw new NotFoundApiException("Service");
  }

  async createRule(ctx: ResolvedProviderContext, dto: CreateAvailabilityRuleDto) {
    await this.assertLocationInOrg(ctx, dto.locationId);
    await this.assertProviderUserInOrg(ctx, dto.providerUserId);
    await this.assertServiceInOrg(ctx, dto.serviceId);
    if (timeStringToMinutes(dto.endLocalTime) <= timeStringToMinutes(dto.startLocalTime)) {
      throw new ValidationApiException({ field: "endLocalTime", reason: "endLocalTime must be after startLocalTime" });
    }

    const rule = await this.prisma.providerAvailabilityRule.create({
      data: {
        providerOrganizationId: ctx.organizationId,
        locationId: dto.locationId,
        providerUserId: dto.providerUserId ?? null,
        serviceId: dto.serviceId ?? null,
        dayOfWeek: dto.dayOfWeek,
        startLocalTime: dto.startLocalTime,
        endLocalTime: dto.endLocalTime,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
        effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : null,
        timezone: dto.timezone,
      },
    });
    await this.events.publish(
      "ProviderAvailabilityRuleCreated",
      { ruleId: rule.id, providerOrganizationId: ctx.organizationId, actorProviderUserId: ctx.providerUserId },
      { aggregateType: "ProviderOrganization", aggregateId: ctx.organizationId },
    );
    return toProviderAvailabilityRuleDto(rule);
  }

  private async loadRuleForOrg(ctx: ResolvedProviderContext, id: string): Promise<ProviderAvailabilityRule> {
    const rule = await this.prisma.providerAvailabilityRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundApiException("Availability rule");
    if (rule.providerOrganizationId !== ctx.organizationId) throw new ProviderAccessDeniedException({ reason: "CROSS_ORGANIZATION" });
    return rule;
  }

  async updateRule(ctx: ResolvedProviderContext, id: string, dto: UpdateAvailabilityRuleDto) {
    const existing = await this.loadRuleForOrg(ctx, id);
    if (dto.locationId) await this.assertLocationInOrg(ctx, dto.locationId);
    if (dto.providerUserId !== undefined) await this.assertProviderUserInOrg(ctx, dto.providerUserId);
    if (dto.serviceId !== undefined) await this.assertServiceInOrg(ctx, dto.serviceId);

    const startLocalTime = dto.startLocalTime ?? existing.startLocalTime;
    const endLocalTime = dto.endLocalTime ?? existing.endLocalTime;
    if (timeStringToMinutes(endLocalTime) <= timeStringToMinutes(startLocalTime)) {
      throw new ValidationApiException({ field: "endLocalTime", reason: "endLocalTime must be after startLocalTime" });
    }

    const rule = await this.prisma.providerAvailabilityRule.update({
      where: { id },
      data: {
        locationId: dto.locationId,
        providerUserId: dto.providerUserId === undefined ? undefined : dto.providerUserId,
        serviceId: dto.serviceId === undefined ? undefined : dto.serviceId,
        dayOfWeek: dto.dayOfWeek,
        startLocalTime: dto.startLocalTime,
        endLocalTime: dto.endLocalTime,
        effectiveFrom: dto.effectiveFrom === undefined ? undefined : dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
        effectiveUntil: dto.effectiveUntil === undefined ? undefined : dto.effectiveUntil ? new Date(dto.effectiveUntil) : null,
        timezone: dto.timezone,
      },
    });
    await this.events.publish(
      "ProviderAvailabilityRuleUpdated",
      { ruleId: id, providerOrganizationId: ctx.organizationId, actorProviderUserId: ctx.providerUserId },
      { aggregateType: "ProviderOrganization", aggregateId: ctx.organizationId },
    );
    return toProviderAvailabilityRuleDto(rule);
  }

  async deleteRule(ctx: ResolvedProviderContext, id: string): Promise<void> {
    await this.loadRuleForOrg(ctx, id);
    await this.prisma.providerAvailabilityRule.delete({ where: { id } });
    await this.events.publish(
      "ProviderAvailabilityRuleDeleted",
      { ruleId: id, providerOrganizationId: ctx.organizationId, actorProviderUserId: ctx.providerUserId },
      { aggregateType: "ProviderOrganization", aggregateId: ctx.organizationId },
    );
  }

  async listExceptions(ctx: ResolvedProviderContext) {
    const exceptions = await this.prisma.providerAvailabilityException.findMany({
      where: { providerOrganizationId: ctx.organizationId },
      orderBy: { startAt: "asc" },
    });
    return exceptions.map(toProviderAvailabilityExceptionDto);
  }

  private async findConflictingBookings(ctx: ResolvedProviderContext, locationId: string, startAt: Date, endAt: Date, providerUserId: string | null) {
    return this.prisma.booking.findMany({
      where: {
        providerOrganizationId: ctx.organizationId,
        providerLocationId: locationId,
        bookingStatus: { in: ACTIVE_BOOKING_STATUSES },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        ...(providerUserId ? { providerUserId } : {}),
      },
      select: { id: true },
    });
  }

  async createException(ctx: ResolvedProviderContext, dto: CreateAvailabilityExceptionDto) {
    await this.assertLocationInOrg(ctx, dto.locationId);
    await this.assertProviderUserInOrg(ctx, dto.providerUserId);
    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    if (endAt <= startAt) throw new ValidationApiException({ field: "endAt", reason: "endAt must be after startAt" });

    if (dto.type === PrismaAvailabilityExceptionType.BLOCKED && !dto.acknowledgeConflict) {
      const conflicts = await this.findConflictingBookings(ctx, dto.locationId, startAt, endAt, dto.providerUserId ?? null);
      if (conflicts.length > 0) {
        throw new AvailabilityConflictException({ conflictingBookingIds: conflicts.map((b) => b.id), count: conflicts.length });
      }
    }

    const exception = await this.prisma.providerAvailabilityException.create({
      data: {
        providerOrganizationId: ctx.organizationId,
        locationId: dto.locationId,
        providerUserId: dto.providerUserId ?? null,
        startAt,
        endAt,
        type: dto.type,
        reason: dto.reason ?? null,
      },
    });
    await this.events.publish(
      "ProviderAvailabilityExceptionCreated",
      { exceptionId: exception.id, providerOrganizationId: ctx.organizationId, type: dto.type, actorProviderUserId: ctx.providerUserId },
      { aggregateType: "ProviderOrganization", aggregateId: ctx.organizationId },
    );
    return toProviderAvailabilityExceptionDto(exception);
  }

  private async loadExceptionForOrg(ctx: ResolvedProviderContext, id: string): Promise<ProviderAvailabilityException> {
    const exception = await this.prisma.providerAvailabilityException.findUnique({ where: { id } });
    if (!exception) throw new NotFoundApiException("Availability exception");
    if (exception.providerOrganizationId !== ctx.organizationId) throw new ProviderAccessDeniedException({ reason: "CROSS_ORGANIZATION" });
    return exception;
  }

  async updateException(ctx: ResolvedProviderContext, id: string, dto: UpdateAvailabilityExceptionDto) {
    const existing = await this.loadExceptionForOrg(ctx, id);
    if (dto.locationId) await this.assertLocationInOrg(ctx, dto.locationId);
    if (dto.providerUserId !== undefined) await this.assertProviderUserInOrg(ctx, dto.providerUserId);

    const locationId = dto.locationId ?? existing.locationId;
    const startAt = dto.startAt ? new Date(dto.startAt) : existing.startAt;
    const endAt = dto.endAt ? new Date(dto.endAt) : existing.endAt;
    const type = dto.type ?? existing.type;
    const providerUserId = dto.providerUserId === undefined ? existing.providerUserId : dto.providerUserId;
    if (endAt <= startAt) throw new ValidationApiException({ field: "endAt", reason: "endAt must be after startAt" });

    if (type === PrismaAvailabilityExceptionType.BLOCKED && !dto.acknowledgeConflict) {
      const conflicts = await this.findConflictingBookings(ctx, locationId, startAt, endAt, providerUserId);
      if (conflicts.length > 0) {
        throw new AvailabilityConflictException({ conflictingBookingIds: conflicts.map((b) => b.id), count: conflicts.length });
      }
    }

    const exception = await this.prisma.providerAvailabilityException.update({
      where: { id },
      data: { locationId, providerUserId, startAt, endAt, type, reason: dto.reason === undefined ? undefined : dto.reason },
    });
    await this.events.publish(
      "ProviderAvailabilityExceptionUpdated",
      { exceptionId: id, providerOrganizationId: ctx.organizationId, actorProviderUserId: ctx.providerUserId },
      { aggregateType: "ProviderOrganization", aggregateId: ctx.organizationId },
    );
    return toProviderAvailabilityExceptionDto(exception);
  }

  async deleteException(ctx: ResolvedProviderContext, id: string): Promise<void> {
    await this.loadExceptionForOrg(ctx, id);
    await this.prisma.providerAvailabilityException.delete({ where: { id } });
    await this.events.publish(
      "ProviderAvailabilityExceptionDeleted",
      { exceptionId: id, providerOrganizationId: ctx.organizationId, actorProviderUserId: ctx.providerUserId },
      { aggregateType: "ProviderOrganization", aggregateId: ctx.organizationId },
    );
  }

  /** Used by ProviderOverviewService's "availability issues" count — unresolved BLOCKED exceptions that still overlap an active booking. */
  async countUnresolvedConflicts(ctx: ResolvedProviderContext): Promise<number> {
    const now = new Date();
    const blockedExceptions = await this.prisma.providerAvailabilityException.findMany({
      where: { providerOrganizationId: ctx.organizationId, type: PrismaAvailabilityExceptionType.BLOCKED, endAt: { gte: now } },
    });
    if (blockedExceptions.length === 0) return 0;

    let count = 0;
    for (const exception of blockedExceptions) {
      const conflicts = await this.findConflictingBookings(ctx, exception.locationId, exception.startAt, exception.endAt, exception.providerUserId);
      if (conflicts.length > 0) count += 1;
    }
    return count;
  }
}
