import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { PetAccessService } from "../pet-access/pet-access.service";
import type { CreatePetDto } from "./dto/create-pet.dto";
import type { UpdatePetDto } from "./dto/update-pet.dto";

@Injectable()
export class PetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly petAccess: PetAccessService,
    private readonly events: DomainEventsService,
  ) {}

  async create(householdId: string, creatorUserId: string, dto: CreatePetDto) {
    if (!dto.birthDate && dto.approximateAgeMonths === undefined) {
      throw new ValidationApiException({ field: "birthDate", reason: "birthDate or approximateAgeMonths is required" });
    }

    const pet = await this.prisma.pet.create({
      data: {
        householdId,
        name: dto.name,
        species: dto.species,
        breed: dto.breed,
        sex: dto.sex,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        approximateAgeMonths: dto.approximateAgeMonths,
        photoUrl: dto.photoUrl,
        latestWeightValue: dto.latestWeightValue,
        latestWeightUnit: dto.latestWeightUnit,
        colorMarkings: dto.colorMarkings,
        neuteredStatus: dto.neuteredStatus,
        microchipNumber: dto.microchipNumber,
      },
    });

    await this.petAccess.applyHouseholdDefaults(pet.id, householdId);

    const hasActivePet = await this.prisma.activePetPreference.findUnique({
      where: { userId_householdId: { userId: creatorUserId, householdId } },
    });

    if (!hasActivePet) {
      await this.prisma.activePetPreference.create({
        data: { userId: creatorUserId, householdId, petId: pet.id },
      });
      await this.events.publish("ActivePetChanged", { userId: creatorUserId, householdId, petId: pet.id });
    }

    await this.events.publish("PetCreated", { petId: pet.id, householdId, creatorUserId });
    return pet;
  }

  async getById(id: string) {
    const pet = await this.prisma.pet.findUnique({ where: { id } });
    if (!pet) throw new NotFoundApiException("Pet");
    return pet;
  }

  async listForHousehold(householdId: string) {
    return this.prisma.pet.findMany({ where: { householdId }, orderBy: { createdAt: "asc" } });
  }

  async update(id: string, dto: UpdatePetDto) {
    const pet = await this.prisma.pet.update({
      where: { id },
      data: {
        ...dto,
        birthDate: dto.birthDate === undefined ? undefined : dto.birthDate ? new Date(dto.birthDate) : null,
      },
    });
    await this.events.publish("PetProfileUpdated", { petId: id });
    return pet;
  }
}
