import { Injectable } from "@nestjs/common";
import { CareCalendarEventStatus, CareCalendarEventType, type Booking, type Prisma } from "@prisma/client";
import { HomeActionKind, type CareCalendarEventDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";

function toDto(event: {
  id: string;
  householdId: string;
  petId: string;
  type: CareCalendarEventType;
  status: CareCalendarEventStatus;
  startAt: Date;
  endAt: Date;
  timezone: string;
  titleKey: string;
  actionType: string | null;
  sourceId: string;
}): CareCalendarEventDto {
  return {
    id: event.id,
    householdId: event.householdId,
    petId: event.petId,
    type: event.type as unknown as CareCalendarEventDto["type"],
    status: event.status as unknown as CareCalendarEventDto["status"],
    startAt: event.startAt.toISOString(),
    endAt: event.endAt.toISOString(),
    timezone: event.timezone,
    titleKey: event.titleKey,
    actionType: event.actionType,
    bookingId: event.sourceId,
  };
}

/**
 * Booking remains the editable source of truth (see the doc comment on
 * CareCalendarEvent in schema.prisma) — every method here is a read
 * projection or a sync-on-change, never an independent edit surface.
 */
@Injectable()
export class CareCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async upsertForBooking(booking: Booking, tx: Prisma.TransactionClient): Promise<void> {
    const event = await tx.careCalendarEvent.upsert({
      where: { sourceType_sourceId: { sourceType: CareCalendarEventType.VET_APPOINTMENT, sourceId: booking.id } },
      update: {
        startAt: booking.startAt,
        endAt: booking.endAt,
        timezone: booking.timezone,
        status: CareCalendarEventStatus.SCHEDULED,
      },
      create: {
        householdId: booking.householdId,
        petId: booking.petId,
        sourceType: CareCalendarEventType.VET_APPOINTMENT,
        sourceId: booking.id,
        type: CareCalendarEventType.VET_APPOINTMENT,
        status: CareCalendarEventStatus.SCHEDULED,
        startAt: booking.startAt,
        endAt: booking.endAt,
        timezone: booking.timezone,
        titleKey: "careCalendar.event.vetAppointment",
        actionType: HomeActionKind.VIEW_BOOKING,
      },
    });

    await this.events.publish(
      "CareCalendarEventCreated",
      { bookingId: booking.id, calendarEventId: event.id },
      { tx, aggregateType: "Booking", aggregateId: booking.id },
    );
  }

  async markCancelled(bookingId: string, tx: Prisma.TransactionClient): Promise<void> {
    await tx.careCalendarEvent
      .update({
        where: { sourceType_sourceId: { sourceType: CareCalendarEventType.VET_APPOINTMENT, sourceId: bookingId } },
        data: { status: CareCalendarEventStatus.CANCELLED },
      })
      .catch(() => undefined); // No calendar row yet is not an error — cancellation still proceeds.
  }

  async listUpcoming(householdIds: string[], petId?: string): Promise<CareCalendarEventDto[]> {
    const events = await this.prisma.careCalendarEvent.findMany({
      where: {
        householdId: { in: householdIds },
        ...(petId ? { petId } : {}),
        status: { not: CareCalendarEventStatus.CANCELLED },
        endAt: { gte: new Date() },
      },
      orderBy: { startAt: "asc" },
    });
    return events.map(toDto);
  }
}
