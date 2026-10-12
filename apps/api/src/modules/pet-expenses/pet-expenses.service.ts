import { Injectable } from "@nestjs/common";
import { BookingStatus, OrderStatus, PetExpenseCategory, ServiceCategory, type PetExpense } from "@prisma/client";
import type { PetExpenseEntryDto, PetExpenseSource, PetExpensesDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { isHouseholdMember } from "../../common/auth/household-member";
import { NotFoundApiException, PetAccessDeniedException } from "../../common/errors/api-exception";
import { dayKey, parseDay, parseDayRange } from "../../common/dates/day-range";
import type { CreatePetExpenseDto, UpdatePetExpenseDto } from "./dto/pet-expense.dto";
import type { DayRangeQueryDto } from "../../common/dates/day-range-query.dto";

/** Bookings that represent money the household committed to; holds, requests and cancellations never count. */
const SPENT_BOOKING_STATUSES: BookingStatus[] = [
  BookingStatus.CONFIRMED,
  BookingStatus.CHECKED_IN,
  BookingStatus.IN_PROGRESS,
  BookingStatus.COMPLETED,
];

/** Orders that were actually bought; pending, cancelled and fully refunded orders never count. */
const SPENT_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY_FOR_FULFILLMENT,
  OrderStatus.FULFILLED,
  OrderStatus.PARTIALLY_REFUNDED,
];

const CATEGORY_BY_SERVICE: Record<ServiceCategory, PetExpenseCategory> = {
  VET: PetExpenseCategory.VET,
  GROOMING: PetExpenseCategory.GROOMING,
  TRAINING: PetExpenseCategory.TRAINING,
  WALKING: PetExpenseCategory.OTHER,
  SITTING: PetExpenseCategory.BOARDING,
  BOARDING: PetExpenseCategory.BOARDING,
  PET_TAXI: PetExpenseCategory.TRANSPORT,
  OTHER: PetExpenseCategory.OTHER,
};

@Injectable()
export class PetExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Spending is household money, not pet data: a vet's temporary grant or a pet shared from another
   * household must never see what this household paid. The pet-access guard has already proven *some*
   * active grant; this adds membership of the pet's current household.
   */
  private async householdPet(petId: string, userId: string) {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId }, select: { id: true, householdId: true } });
    if (!pet) throw new NotFoundApiException("Pet");
    if (!(await isHouseholdMember(this.prisma, pet.householdId, userId))) throw new PetAccessDeniedException({ petId, reason: "HOUSEHOLD_MEMBERS_ONLY" });
    return pet;
  }

  async list(petId: string, userId: string, query: DayRangeQueryDto): Promise<PetExpensesDto> {
    const pet = await this.householdPet(petId, userId);
    const { from, to, toExclusive } = parseDayRange(query);

    const [manual, bookings, orderItems] = await Promise.all([
      this.prisma.petExpense.findMany({
        where: { petId, spentOn: { gte: from, lte: to } },
        orderBy: [{ spentOn: "desc" }, { createdAt: "desc" }],
      }),
      this.prisma.booking.findMany({
        where: {
          petId,
          householdId: pet.householdId,
          bookingStatus: { in: SPENT_BOOKING_STATUSES },
          priceAmount: { not: null },
          currency: "IRR",
          startAt: { gte: from, lt: toExclusive },
        },
        select: { id: true, startAt: true, priceAmount: true, discountAmount: true, providerService: { select: { name: true, category: true } } },
      }),
      this.prisma.orderItem.findMany({
        where: {
          targetPetId: petId,
          order: { householdId: pet.householdId, status: { in: SPENT_ORDER_STATUSES }, currency: "IRR", createdAt: { gte: from, lt: toExclusive } },
        },
        select: { id: true, totalPrice: true, productTitleSnapshot: true, order: { select: { id: true, createdAt: true } } },
      }),
    ]);

    const entries: PetExpenseEntryDto[] = [
      ...manual.map((row) => this.toEntry(row)),
      ...bookings
        .map((booking): PetExpenseEntryDto => ({
          id: "booking:" + booking.id,
          source: "BOOKING",
          category: CATEGORY_BY_SERVICE[booking.providerService.category],
          amountIrr: Math.max(0, Math.round(Number(booking.priceAmount) - Number(booking.discountAmount))),
          spentOn: dayKey(booking.startAt),
          note: null,
          label: booking.providerService.name,
          sourceRecordId: booking.id,
        }))
        .filter((entry) => entry.amountIrr > 0),
      ...orderItems
        .filter((item) => item.totalPrice > 0)
        .map((item): PetExpenseEntryDto => ({
          id: "order-item:" + item.id,
          source: "SHOP",
          category: PetExpenseCategory.SUPPLIES,
          amountIrr: item.totalPrice,
          spentOn: dayKey(item.order.createdAt),
          note: null,
          label: item.productTitleSnapshot,
          sourceRecordId: item.order.id,
        })),
    ].sort((a, b) => (a.spentOn === b.spentOn ? a.id.localeCompare(b.id) : b.spentOn.localeCompare(a.spentOn)));

    const byCategory = new Map<PetExpenseCategory, number>();
    const bySource = new Map<PetExpenseSource, number>();
    let totalIrr = 0;
    for (const entry of entries) {
      totalIrr += entry.amountIrr;
      byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + entry.amountIrr);
      bySource.set(entry.source, (bySource.get(entry.source) ?? 0) + entry.amountIrr);
    }

    return {
      from: dayKey(from),
      to: dayKey(to),
      totalIrr,
      byCategory: [...byCategory].map(([category, amountIrr]) => ({ category, amountIrr })).sort((a, b) => b.amountIrr - a.amountIrr),
      bySource: [...bySource].map(([source, amountIrr]) => ({ source, amountIrr })).sort((a, b) => b.amountIrr - a.amountIrr),
      entries,
    };
  }

  async create(petId: string, userId: string, dto: CreatePetExpenseDto): Promise<PetExpenseEntryDto> {
    const pet = await this.householdPet(petId, userId);
    const row = await this.prisma.petExpense.create({
      data: {
        petId,
        householdId: pet.householdId,
        createdByUserId: userId,
        category: dto.category,
        amountIrr: dto.amountIrr,
        spentOn: parseDay(dto.spentOn),
        note: dto.note?.trim() || null,
      },
    });
    return this.toEntry(row);
  }

  async update(petId: string, expenseId: string, userId: string, dto: UpdatePetExpenseDto): Promise<PetExpenseEntryDto> {
    await this.householdPet(petId, userId);
    await this.owned(petId, expenseId);
    const row = await this.prisma.petExpense.update({
      where: { id: expenseId },
      data: {
        category: dto.category,
        amountIrr: dto.amountIrr,
        spentOn: dto.spentOn ? parseDay(dto.spentOn) : undefined,
        note: dto.note === undefined ? undefined : dto.note.trim() || null,
      },
    });
    return this.toEntry(row);
  }

  async remove(petId: string, expenseId: string, userId: string): Promise<{ deleted: true }> {
    await this.householdPet(petId, userId);
    await this.owned(petId, expenseId);
    await this.prisma.petExpense.delete({ where: { id: expenseId } });
    return { deleted: true };
  }

  /** The expense must belong to the pet in the URL — a forged id for another pet reads as not found. */
  private async owned(petId: string, expenseId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(expenseId)) throw new NotFoundApiException("Expense");
    const row = await this.prisma.petExpense.findFirst({ where: { id: expenseId, petId }, select: { id: true } });
    if (!row) throw new NotFoundApiException("Expense");
  }

  private toEntry(row: PetExpense): PetExpenseEntryDto {
    return {
      id: row.id,
      source: "MANUAL",
      category: row.category,
      amountIrr: row.amountIrr,
      spentOn: dayKey(row.spentOn),
      note: row.note,
      label: null,
      sourceRecordId: null,
    };
  }
}
