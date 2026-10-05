import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";

export const CHECKLIST_CATEGORIES = ["DOCUMENTS", "MEDICATION", "FOOD", "CARRIER", "BOOKING", "EMERGENCY", "OTHER"] as const;
const DEFAULTS: { category: (typeof CHECKLIST_CATEGORIES)[number]; fa: string; en: string }[] = [
  { category: "DOCUMENTS", fa: "مدارک سفر و کارت واکسن", en: "Travel documents and vaccination card" },
  { category: "MEDICATION", fa: "داروهای پت برای کل سفر", en: "Medication for the whole trip" },
  { category: "FOOD", fa: "غذا و ظرف آب", en: "Food and water bowl" },
  { category: "CARRIER", fa: "باکس حمل یا قلاده", en: "Carrier or leash" },
  { category: "BOOKING", fa: "تأیید رزرو اقامت پذیرای پت", en: "Pet-friendly stay confirmation" },
  { category: "EMERGENCY", fa: "شماره‌ی دامپزشک مقصد", en: "A vet's number at the destination" },
];
const MAX_ITEMS = 50;

/**
 * The member's own trip checklist (packing/preparation — legal documents stay in TravelRequirement) and extra
 * trip participants: other pets of the same household and household members. Everything is scoped to the trip of
 * the pet in the URL, which PetAccessGuard already authorised.
 */
@Injectable()
export class TripExtrasService {
  constructor(private readonly prisma: PrismaService) {}

  async checklist(petId: string, tripId: string) {
    await this.trip(petId, tripId);
    const items = await this.prisma.tripChecklistItem.findMany({ where: { tripId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    return { items: items.map(toItem), done: items.filter((i) => i.done).length, total: items.length };
  }

  /** Adds the suggested defaults once (skips labels already on the list). */
  async addDefaults(petId: string, tripId: string, locale: "fa" | "en") {
    await this.trip(petId, tripId);
    const existing = new Set((await this.prisma.tripChecklistItem.findMany({ where: { tripId }, select: { label: true } })).map((i) => i.label));
    const base = await this.prisma.tripChecklistItem.count({ where: { tripId } });
    const add = DEFAULTS.filter((d) => !existing.has(d[locale]));
    if (base + add.length > MAX_ITEMS) throw new ValidationApiException({ reason: "CHECKLIST_FULL", max: MAX_ITEMS });
    await this.prisma.tripChecklistItem.createMany({ data: add.map((d, i) => ({ tripId, label: d[locale], category: d.category, sortOrder: base + i })) });
    return this.checklist(petId, tripId);
  }

  async addItem(petId: string, tripId: string, label: string, category: string) {
    await this.trip(petId, tripId);
    const clean = label.trim();
    if (!clean) throw new ValidationApiException({ field: "label" });
    const count = await this.prisma.tripChecklistItem.count({ where: { tripId } });
    if (count >= MAX_ITEMS) throw new ValidationApiException({ reason: "CHECKLIST_FULL", max: MAX_ITEMS });
    await this.prisma.tripChecklistItem.create({ data: { tripId, label: clean, category, sortOrder: count } });
    return this.checklist(petId, tripId);
  }

  async setDone(petId: string, tripId: string, itemId: string, done: boolean) {
    await this.trip(petId, tripId);
    const updated = await this.prisma.tripChecklistItem.updateMany({ where: { id: itemId, tripId }, data: { done, doneAt: done ? new Date() : null } });
    if (!updated.count) throw new NotFoundApiException("TripChecklistItem");
    return this.checklist(petId, tripId);
  }

  async removeItem(petId: string, tripId: string, itemId: string) {
    await this.trip(petId, tripId);
    const removed = await this.prisma.tripChecklistItem.deleteMany({ where: { id: itemId, tripId } });
    if (!removed.count) throw new NotFoundApiException("TripChecklistItem");
    return this.checklist(petId, tripId);
  }

  async participants(petId: string, tripId: string) {
    const trip = await this.trip(petId, tripId);
    const rows = await this.prisma.tripParticipant.findMany({ where: { tripId }, orderBy: { createdAt: "asc" } });
    const pets = await this.prisma.pet.findMany({ where: { id: { in: [trip.petId, ...rows.map((r) => r.petId).filter((x): x is string => Boolean(x))] } }, select: { id: true, name: true, species: true } });
    const users = await this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
    return {
      primaryPet: pets.find((p) => p.id === trip.petId) ?? null,
      pets: rows.filter((r) => r.petId).map((r) => ({ participantId: r.id, ...pets.find((p) => p.id === r.petId)! })),
      members: rows.filter((r) => r.userId).map((r) => ({ participantId: r.id, userId: r.userId, displayName: users.find((u) => u.id === r.userId)?.displayName ?? null })),
    };
  }

  /** Only pets and members of the trip's own household. */
  async addParticipant(petId: string, tripId: string, input: { petId?: string; userId?: string }) {
    const trip = await this.trip(petId, tripId);
    if (Boolean(input.petId) === Boolean(input.userId)) throw new ValidationApiException({ reason: "EXACTLY_ONE_OF_PET_OR_USER" });
    if (input.petId) {
      if (input.petId === trip.petId) throw new ValidationApiException({ field: "petId", reason: "ALREADY_PRIMARY_PET" });
      if (!(await this.prisma.pet.count({ where: { id: input.petId, householdId: trip.householdId, lifecycleStatus: "ACTIVE" } }))) throw new NotFoundApiException("Pet");
    } else if (!(await this.prisma.householdMember.count({ where: { householdId: trip.householdId, userId: input.userId } }))) throw new NotFoundApiException("HouseholdMember");
    try {
      await this.prisma.tripParticipant.create({ data: { tripId, petId: input.petId ?? null, userId: input.userId ?? null } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ValidationApiException({ reason: "ALREADY_ON_TRIP" });
      throw e;
    }
    return this.participants(petId, tripId);
  }

  async removeParticipant(petId: string, tripId: string, participantId: string) {
    await this.trip(petId, tripId);
    const removed = await this.prisma.tripParticipant.deleteMany({ where: { id: participantId, tripId } });
    if (!removed.count) throw new NotFoundApiException("TripParticipant");
    return this.participants(petId, tripId);
  }

  private async trip(petId: string, tripId: string) {
    const trip = await this.prisma.trip.findFirst({ where: { id: tripId, petId } });
    if (!trip) throw new NotFoundApiException("Trip");
    return trip;
  }
}

function toItem(i: Prisma.TripChecklistItemGetPayload<object>) {
  return { id: i.id, label: i.label, category: i.category, done: i.done, doneAt: i.doneAt?.toISOString() ?? null };
}
