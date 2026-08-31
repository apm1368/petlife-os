import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException, PetAccessDeniedException, ValidationApiException } from "../../common/errors/api-exception";
import { DomainEventsService } from "../../common/events/domain-events.service";

@Injectable()
export class ActivePetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async getActivePet(userId: string, householdId: string) {
    const preference = await this.prisma.activePetPreference.findUnique({
      where: { userId_householdId: { userId, householdId } },
      include: { pet: true },
    });
    return preference?.pet ?? null;
  }

  async setActivePet(userId: string, householdId: string, petId: string) {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) throw new NotFoundApiException("Pet");
    if (pet.householdId !== householdId) {
      throw new ValidationApiException({ petId, reason: "Pet does not belong to this household" });
    }

    const access = await this.prisma.petAccess.findUnique({
      where: { petId_userId: { petId, userId } },
    });
    if (!access || !access.canViewIdentity) throw new PetAccessDeniedException({ petId });

    const preference = await this.prisma.activePetPreference.upsert({
      where: { userId_householdId: { userId, householdId } },
      update: { petId },
      create: { userId, householdId, petId },
    });

    await this.events.publish("ActivePetChanged", { userId, householdId, petId });
    return { ...preference, pet };
  }
}
