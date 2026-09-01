import { Injectable } from "@nestjs/common";
import { CareCalendarEventStatus, CareCalendarEventType, ServiceCategory, type Booking, type Prisma } from "@prisma/client";
import { HomeActionKind, type CareCalendarEventDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";

/** ServiceCategory -> the calendar event vocabulary it projects as. Every Booking category maps to exactly one type. */
const CALENDAR_TYPE_BY_CATEGORY: Record<ServiceCategory, CareCalendarEventType> = {
  [ServiceCategory.VET]: CareCalendarEventType.VET_APPOINTMENT,
  [ServiceCategory.GROOMING]: CareCalendarEventType.GROOMING_APPOINTMENT,
  [ServiceCategory.TRAINING]: CareCalendarEventType.TRAINING_SESSION,
  [ServiceCategory.WALKING]: CareCalendarEventType.WALK,
  [ServiceCategory.SITTING]: CareCalendarEventType.SITTING,
  [ServiceCategory.BOARDING]: CareCalendarEventType.BOARDING,
  [ServiceCategory.PET_TAXI]: CareCalendarEventType.PET_TAXI,
};

const TITLE_KEY_BY_CATEGORY: Record<ServiceCategory, string> = {
  [ServiceCategory.VET]: "careCalendar.event.vetAppointment",
  [ServiceCategory.GROOMING]: "careCalendar.event.grooming",
  [ServiceCategory.TRAINING]: "careCalendar.event.training",
  [ServiceCategory.WALKING]: "careCalendar.event.walk",
  [ServiceCategory.SITTING]: "careCalendar.event.sitting",
  [ServiceCategory.BOARDING]: "careCalendar.event.boarding",
  [ServiceCategory.PET_TAXI]: "careCalendar.event.petTaxi",
};

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
 * projection or a sync-on-change, never an independent edit surface. The
 * event's sourceType/type is derived from the booking's category (Handoff
 * 04) rather than being hard-coded to VET_APPOINTMENT — a multi-day
 * Sitting/Boarding booking projects the exact same startAt/endAt range it
 * was booked with, so the calendar naturally renders a date-range event with
 * no schema change (see README "Multi-day bookings").
 */
@Injectable()
export class CareCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async upsertForBooking(booking: Booking, tx: Prisma.TransactionClient): Promise<void> {
    const type = CALENDAR_TYPE_BY_CATEGORY[booking.category];
    const titleKey = TITLE_KEY_BY_CATEGORY[booking.category];

    const event = await tx.careCalendarEvent.upsert({
      where: { sourceType_sourceId: { sourceType: type, sourceId: booking.id } },
      update: {
        startAt: booking.startAt,
        endAt: booking.endAt,
        timezone: booking.timezone,
        status: CareCalendarEventStatus.SCHEDULED,
      },
      create: {
        householdId: booking.householdId,
        petId: booking.petId,
        sourceType: type,
        sourceId: booking.id,
        type,
        status: CareCalendarEventStatus.SCHEDULED,
        startAt: booking.startAt,
        endAt: booking.endAt,
        timezone: booking.timezone,
        titleKey,
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
    // sourceType is unknown here without a lookup, but sourceId + a status update needs an
    // exact composite key match — updateMany avoids a second read just to learn the category.
    await tx.careCalendarEvent.updateMany({
      where: { sourceId: bookingId },
      data: { status: CareCalendarEventStatus.CANCELLED },
    });
  }

  /** Provider OS's POST .../complete transition (Handoff 05) — same updateMany shape as markCancelled. */
  async markCompleted(bookingId: string, tx: Prisma.TransactionClient): Promise<void> {
    await tx.careCalendarEvent.updateMany({
      where: { sourceId: bookingId },
      data: { status: CareCalendarEventStatus.COMPLETED },
    });
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
