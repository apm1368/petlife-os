import { Injectable } from "@nestjs/common";
import type { AvailabilityExceptionType, BookingStatus, ProviderAvailabilityRule } from "@prisma/client";
import type { SlotAvailabilityState } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ValidationApiException } from "../../common/errors/api-exception";
import { enumerateLocalDates, minutesToTimeString, timeStringToMinutes, zonedTimeToUtc } from "./timezone.util";

/** Terminal states that never occupy capacity. */
export const NON_OCCUPYING_STATUSES: BookingStatus[] = ["CANCELLED_BY_USER", "CANCELLED_BY_PROVIDER", "REJECTED", "EXPIRED", "RESCHEDULED"];
const MAX_RANGE_DAYS = 30;

export interface GeneratedSlot {
  startAt: Date;
  endAt: Date;
  timezone: string;
  providerUserId: string | null;
  state: SlotAvailabilityState;
  /** A free resource of the service's required type for this slot, when one is required. */
  resourceId?: string | null;
}

export interface GenerateSlotsParams {
  providerOrganizationId: string;
  locationId: string;
  serviceId: string;
  providerUserId?: string;
  /** Variant id — its duration overrides the service's. */
  variantId?: string;
  from: Date;
  to: Date;
  /** Booking being rescheduled: its own time does not count as a conflict. */
  ignoreBookingId?: string;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** A null staff id is location-wide: it conflicts with every staff member at that location. */
function sameStaff(a: string | null, b: string | null): boolean {
  return a === null || b === null || a === b;
}

/**
 * Deterministic, no-ML slot projection: recurring ProviderAvailabilityRule
 * rows plus one-off ProviderAvailabilityException rows are projected across
 * the requested date range on read — no slot is ever its own persisted row.
 * Existing active bookings and BLOCKED exceptions mark a generated slot as
 * unavailable rather than removing it from the response, so the UI can show
 * *why* a slot can't be picked instead of just omitting it.
 *
 * Batch 3: conflicts are per staff member (a location-wide booking or block
 * still conflicts with everyone), variant duration overrides service duration,
 * only bookable staff qualified for the service produce slots, and a service
 * that requires a resource type is only AVAILABLE while one such resource is free.
 */
@Injectable()
export class SlotGeneratorService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(params: GenerateSlotsParams): Promise<GeneratedSlot[]> {
    const { providerOrganizationId, locationId, serviceId, providerUserId, from, to } = params;
    if (to <= from) {
      throw new ValidationApiException({ field: "to", reason: "to must be after from" });
    }
    const rangeDays = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
    if (rangeDays > MAX_RANGE_DAYS) {
      throw new ValidationApiException({ field: "to", reason: `range cannot exceed ${MAX_RANGE_DAYS} days` });
    }

    const service = await this.prisma.providerService.findUnique({ where: { id: serviceId }, include: { qualifiedStaff: true, variants: true } });
    if (!service || service.providerOrganizationId !== providerOrganizationId) {
      return [];
    }
    const variant = params.variantId ? service.variants.find((v) => v.id === params.variantId && v.isActive) : undefined;
    if (params.variantId && !variant) return [];
    const durationMinutes = variant?.durationMinutes ?? service.durationMinutes;

    const [rules, exceptions, activeBookings, staff, resources] = await Promise.all([
      this.prisma.providerAvailabilityRule.findMany({
        where: {
          providerOrganizationId,
          locationId,
          AND: [
            { OR: [{ serviceId: null }, { serviceId }] },
            providerUserId ? { OR: [{ providerUserId: null }, { providerUserId }] } : {},
          ],
        },
      }),
      this.prisma.providerAvailabilityException.findMany({
        where: {
          providerOrganizationId,
          locationId,
          startAt: { lt: to },
          endAt: { gt: from },
          AND: [providerUserId ? { OR: [{ providerUserId: null }, { providerUserId }] } : {}],
        },
      }),
      this.prisma.booking.findMany({
        where: {
          providerLocationId: locationId,
          bookingStatus: { notIn: NON_OCCUPYING_STATUSES },
          startAt: { lt: to },
          endAt: { gt: from },
          ...(params.ignoreBookingId ? { id: { not: params.ignoreBookingId } } : {}),
        },
        select: { startAt: true, endAt: true, providerUserId: true, resourceId: true },
      }),
      this.prisma.providerUser.findMany({ where: { providerOrganizationId, removedAt: null }, select: { id: true, isBookable: true } }),
      service.requiredResourceType
        ? this.prisma.providerResource.findMany({ where: { providerOrganizationId, locationId, type: service.requiredResourceType, isActive: true }, orderBy: { id: "asc" } })
        : Promise.resolve([]),
    ]);

    const qualified = new Set(service.qualifiedStaff.map((q) => q.providerUserId));
    const bookable = new Set(staff.filter((s) => s.isBookable).map((s) => s.id));
    const staffAllowed = (id: string | null) => id === null || (bookable.has(id) && (qualified.size === 0 || qualified.has(id)));

    const blocked = exceptions.filter((e) => e.type === ("BLOCKED" as AvailabilityExceptionType));
    const overrides = exceptions.filter((e) => e.type === ("AVAILABLE_OVERRIDE" as AvailabilityExceptionType));

    const slots = new Map<string, GeneratedSlot>();
    const addSlot = (startAt: Date, endAt: Date, timezone: string, slotProviderUserId: string | null) => {
      if (startAt < from || endAt > to) return;
      if (!staffAllowed(slotProviderUserId)) return;
      const key = `${slotProviderUserId ?? "any"}:${startAt.toISOString()}`;
      if (slots.has(key)) return;

      let state: SlotAvailabilityState = "AVAILABLE";
      let resourceId: string | null = null;
      if (blocked.some((b) => sameStaff(b.providerUserId, slotProviderUserId) && overlaps(startAt, endAt, b.startAt, b.endAt))) state = "BLOCKED";
      else if (activeBookings.some((b) => sameStaff(b.providerUserId, slotProviderUserId) && overlaps(startAt, endAt, b.startAt, b.endAt))) state = "BOOKED";
      else if (service.requiredResourceType) {
        const free = resources.find((r) => !activeBookings.some((b) => b.resourceId === r.id && overlaps(startAt, endAt, b.startAt, b.endAt)));
        if (free) resourceId = free.id;
        else state = "BOOKED";
      }

      slots.set(key, { startAt, endAt, timezone, providerUserId: slotProviderUserId, state, ...(service.requiredResourceType ? { resourceId } : {}) });
    };

    for (const rule of rules as ProviderAvailabilityRule[]) {
      for (const dateStr of enumerateLocalDates(from, to, rule.timezone)) {
        // dateStr is a plain "YYYY-MM-DD" calendar date, not tied to any zone —
        // its day-of-week is just what the calendar says, no conversion needed.
        if (new Date(`${dateStr}T00:00:00Z`).getUTCDay() !== rule.dayOfWeek) continue;
        if (rule.effectiveFrom && dateStr < rule.effectiveFrom.toISOString().slice(0, 10)) continue;
        if (rule.effectiveUntil && dateStr > rule.effectiveUntil.toISOString().slice(0, 10)) continue;

        const startMinutes = timeStringToMinutes(rule.startLocalTime);
        const endMinutes = timeStringToMinutes(rule.endLocalTime);
        for (let m = startMinutes; m + durationMinutes <= endMinutes; m += durationMinutes) {
          const slotStart = zonedTimeToUtc(dateStr, minutesToTimeString(m), rule.timezone);
          const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60_000);
          addSlot(slotStart, slotEnd, rule.timezone, providerUserId ?? rule.providerUserId ?? null);
        }
      }
    }

    for (const override of overrides) {
      let cursor = override.startAt;
      while (cursor.getTime() + durationMinutes * 60_000 <= override.endAt.getTime()) {
        const slotEnd = new Date(cursor.getTime() + durationMinutes * 60_000);
        addSlot(cursor, slotEnd, "UTC", providerUserId ?? override.providerUserId ?? null);
        cursor = slotEnd;
      }
    }

    // Stable order: time, then staff id — "any professional" assignment picks the first AVAILABLE entry.
    return Array.from(slots.values()).sort((a, b) => a.startAt.getTime() - b.startAt.getTime() || (a.providerUserId ?? "").localeCompare(b.providerUserId ?? ""));
  }
}
