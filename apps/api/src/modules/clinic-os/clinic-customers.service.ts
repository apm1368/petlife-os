import { Injectable } from "@nestjs/common";
import { BookingStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException } from "../../common/errors/api-exception";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { ClinicEntitlementService } from "./clinic-entitlement.service";
import type { ListClinicCustomersQueryDto } from "./dto/clinic-os.dto";

const UPCOMING: BookingStatus[] = [BookingStatus.REQUESTED, BookingStatus.PENDING_CONFIRMATION, BookingStatus.AWAITING_PAYMENT, BookingStatus.CONFIRMED, BookingStatus.CHECKED_IN];

/**
 * The clinic's customer registry: households (not users) that this organisation has booked or documented.
 * It is a directory, not an authorization source — it exposes only the owner's display name, the pets this
 * clinic has seen, and the clinic's own visit history with them. No phone, email or health data; opening a
 * pet's record still goes through PetAccessGuard.
 */
@Injectable()
export class ClinicCustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: ClinicEntitlementService,
  ) {}

  private caseloadPet(organizationId: string): Prisma.PetWhereInput {
    return { OR: [{ bookings: { some: { providerOrganizationId: organizationId } } }, { clinicalVisits: { some: { providerOrganizationId: organizationId } } }] };
  }

  async list(ctx: ResolvedProviderContext, query: ListClinicCustomersQueryDto) {
    await this.entitlements.assertFeature(ctx.organizationId, "clinic.customers");
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const caseload = this.caseloadPet(ctx.organizationId);
    const where: Prisma.HouseholdWhereInput = {
      pets: { some: caseload },
      ...(query.tagId ? { id: { in: (await this.prisma.clinicCustomerTagAssignment.findMany({ where: { tagId: query.tagId, tag: { providerOrganizationId: ctx.organizationId } }, select: { householdId: true } })).map((a) => a.householdId) } } : {}),
      ...(query.q
        ? { OR: [{ members: { some: { role: "OWNER", user: { displayName: { contains: query.q, mode: "insensitive" } } } } }, { pets: { some: { AND: [caseload, { name: { contains: query.q, mode: "insensitive" } }] } } }] }
        : {}),
    };
    const [total, households] = await Promise.all([
      this.prisma.household.count({ where }),
      this.prisma.household.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true } }),
    ]);
    const items = await Promise.all(households.map((h) => this.summary(ctx.organizationId, h.id)));
    return { items, page, pageSize, total };
  }

  async get(ctx: ResolvedProviderContext, householdId: string) {
    await this.entitlements.assertFeature(ctx.organizationId, "clinic.customers");
    const inCaseload = await this.prisma.household.count({ where: { id: householdId, pets: { some: this.caseloadPet(ctx.organizationId) } } });
    // Same 404 for "no such household" and "not this clinic's customer" — no existence oracle.
    if (!inCaseload) throw new NotFoundApiException("ClinicCustomer");
    const summary = await this.summary(ctx.organizationId, householdId);
    const petIds = summary.pets.map((p) => p.id);
    const [bookings, reminders] = await Promise.all([
      this.prisma.booking.findMany({
        where: { providerOrganizationId: ctx.organizationId, householdId },
        orderBy: { startAt: "desc" },
        take: 30,
        select: { id: true, bookingNumber: true, petId: true, startAt: true, bookingStatus: true, paymentStatus: true, serviceNameSnapshot: true, priceAmount: true, discountAmount: true, currency: true },
      }),
      this.prisma.clinicReminder.findMany({ where: { providerOrganizationId: ctx.organizationId, petId: { in: petIds } }, orderBy: { dueAt: "desc" }, take: 30 }),
    ]);
    return {
      ...summary,
      bookings: bookings.map((b) => ({
        id: b.id,
        bookingNumber: b.bookingNumber,
        petId: b.petId,
        startAt: b.startAt.toISOString(),
        status: b.bookingStatus,
        paymentStatus: b.paymentStatus,
        serviceName: b.serviceNameSnapshot,
        amount: b.priceAmount ? b.priceAmount.minus(b.discountAmount).toString() : null,
        currency: b.currency,
      })),
      reminders: reminders.map(toReminderDto),
    };
  }

  private async summary(organizationId: string, householdId: string) {
    const now = new Date();
    const [household, pets, completed, lastBooking, lastVisit, next] = await Promise.all([
      this.prisma.household.findUniqueOrThrow({ where: { id: householdId }, select: { id: true, members: { where: { role: "OWNER" }, take: 1, select: { user: { select: { displayName: true } } } } } }),
      this.prisma.pet.findMany({ where: { householdId, ...this.caseloadPet(organizationId) }, select: { id: true, name: true, species: true, photoUrl: true }, orderBy: { name: "asc" } }),
      this.prisma.booking.count({ where: { providerOrganizationId: organizationId, householdId, bookingStatus: BookingStatus.COMPLETED } }),
      this.prisma.booking.findFirst({ where: { providerOrganizationId: organizationId, householdId, bookingStatus: BookingStatus.COMPLETED }, orderBy: { startAt: "desc" }, select: { startAt: true } }),
      this.prisma.clinicalVisit.findFirst({ where: { providerOrganizationId: organizationId, pet: { householdId } }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
      this.prisma.booking.findFirst({ where: { providerOrganizationId: organizationId, householdId, bookingStatus: { in: UPCOMING }, startAt: { gte: now } }, orderBy: { startAt: "asc" }, select: { id: true, startAt: true } }),
    ]);
    const last = [lastBooking?.startAt, lastVisit?.startedAt].filter((d): d is Date => Boolean(d)).sort((a, b) => b.getTime() - a.getTime())[0];
    const tags = await this.prisma.clinicCustomerTagAssignment.findMany({ where: { householdId, tag: { providerOrganizationId: organizationId } }, include: { tag: { select: { id: true, name: true } } } });
    return {
      householdId: household.id,
      ownerDisplayName: household.members[0]?.user.displayName ?? null,
      tags: tags.map((t) => t.tag),
      pets,
      completedVisitCount: completed,
      lastVisitAt: last?.toISOString() ?? null,
      nextAppointment: next ? { bookingId: next.id, startAt: next.startAt.toISOString() } : null,
    };
  }
}

export function toReminderDto(r: { id: string; petId: string; kind: string; title: string; note: string | null; dueAt: Date; status: string; sentAt: Date | null; recipientCount: number; cancelledAt: Date | null; createdAt: Date }) {
  return { id: r.id, petId: r.petId, kind: r.kind, title: r.title, note: r.note, dueAt: r.dueAt.toISOString(), status: r.status, sentAt: r.sentAt?.toISOString() ?? null, recipientCount: r.recipientCount, cancelledAt: r.cancelledAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString() };
}
