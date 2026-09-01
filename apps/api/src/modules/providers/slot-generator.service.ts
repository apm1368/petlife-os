import { Injectable } from "@nestjs/common";
import type { AvailabilityExceptionType, BookingStatus, ProviderAvailabilityRule } from "@prisma/client";
import type { SlotAvailabilityState } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ValidationApiException } from "../../common/errors/api-exception";
import { enumerateLocalDates, minutesToTimeString, timeStringToMinutes, zonedTimeToUtc } from "./timezone.util";

const CANCELLED_STATUSES: BookingStatus[] = ["CANCELLED_BY_USER", "CANCELLED_BY_PROVIDER"];
const MAX_RANGE_DAYS = 30;

export interface GeneratedSlot {
  startAt: Date;
  endAt: Date;
  timezone: string;
  providerUserId: string | null;
  state: SlotAvailabilityState;
}

export interface GenerateSlotsParams {
  providerOrganizationId: string;
  locationId: string;
  serviceId: string;
  providerUserId?: string;
  from: Date;
  to: Date;
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Deterministic, no-ML slot projection: recurring ProviderAvailabilityRule
 * rows plus one-off ProviderAvailabilityException rows are projected across
 * the requested date range on read — no slot is ever its own persisted row.
 * Existing active bookings and BLOCKED exceptions mark a generated slot as
 * unavailable rather than removing it from the response, so the UI can show
 * *why* a slot can't be picked instead of just omitting it.
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

    const service = await this.prisma.providerService.findUnique({ where: { id: serviceId } });
    if (!service || service.providerOrganizationId !== providerOrganizationId) {
      return [];
    }
    const durationMinutes = service.durationMinutes;

    const [rules, exceptions, activeBookings] = await Promise.all([
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
          ...(providerUserId ? { providerUserId } : {}),
          bookingStatus: { notIn: CANCELLED_STATUSES },
          startAt: { lt: to },
          endAt: { gt: from },
        },
      }),
    ]);

    const blocked = exceptions.filter((e) => e.type === ("BLOCKED" as AvailabilityExceptionType));
    const overrides = exceptions.filter((e) => e.type === ("AVAILABLE_OVERRIDE" as AvailabilityExceptionType));

    const slots = new Map<string, GeneratedSlot>();
    const addSlot = (startAt: Date, endAt: Date, timezone: string, slotProviderUserId: string | null) => {
      if (startAt < from || endAt > to) return;
      const key = `${slotProviderUserId ?? "any"}:${startAt.toISOString()}`;
      if (slots.has(key)) return;

      let state: SlotAvailabilityState = "AVAILABLE";
      if (blocked.some((b) => overlaps(startAt, endAt, b.startAt, b.endAt))) state = "BLOCKED";
      else if (activeBookings.some((b) => overlaps(startAt, endAt, b.startAt, b.endAt))) state = "BOOKED";

      slots.set(key, { startAt, endAt, timezone, providerUserId: slotProviderUserId, state });
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

    return Array.from(slots.values()).sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }
}
