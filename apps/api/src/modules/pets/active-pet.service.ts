import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException, PetAccessDeniedException, ValidationApiException } from "../../common/errors/api-exception";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { PetAccessService } from "../pet-access/pet-access.service";

@Injectable()
export class ActivePetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly petAccess: PetAccessService,
    private readonly events: DomainEventsService,
  ) {}

  async getActivePet(userId: string, householdId: string) {
    const preference = await this.prisma.activePetPreference.findUnique({
      where: { userId_householdId: { userId, householdId } },
      include: { pet: true },
    });
    return preference?.pet ?? null;
  }

  /**
   * The pet id is client-supplied, so both checks are re-derived from the
   * database rather than trusted: the pet must actually belong to this
   * household, and the user must currently hold effective access to it
   * (the union of their active PetAccessGrant rows), not merely have held
   * it at some point in the past.
   */
  async setActivePet(userId: string, householdId: string, petId: string) {
    const pet = await this.prisma.pet.findUnique({ where: { id: petId } });
    if (!pet) throw new NotFoundApiException("Pet");
    if (pet.householdId !== householdId) {
      throw new ValidationApiException({ petId, reason: "Pet does not belong to this household" });
    }

    const effective = await this.petAccess.getEffectivePermissions(petId, userId);
    if (!effective || !effective.canViewIdentity) throw new PetAccessDeniedException({ petId });

    const preference = await this.prisma.$transaction(async (tx) => {
      const upserted = await tx.activePetPreference.upsert({
        where: { userId_householdId: { userId, householdId } },
        update: { petId },
        create: { userId, householdId, petId },
      });
      await this.events.publish(
        "ActivePetChanged",
        { userId, householdId, petId },
        { tx, aggregateType: "Pet", aggregateId: petId },
      );
      return upserted;
    });

    return { ...preference, pet };
  }
}
