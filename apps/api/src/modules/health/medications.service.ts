import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { HealthProfileService } from "./health-profile.service";
import type { CreateMedicationDto } from "./dto/create-medication.dto";
import type { UpdateMedicationDto } from "./dto/update-medication.dto";

function assertDateOrder(startDate?: string | null, endDate?: string | null): void {
  if (!startDate || !endDate) return;
  if (new Date(endDate) < new Date(startDate)) {
    throw new ValidationApiException({ field: "endDate", reason: "endDate must be on or after startDate" });
  }
}

@Injectable()
export class MedicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthProfile: HealthProfileService,
    private readonly events: DomainEventsService,
  ) {}

  list(petId: string) {
    return this.prisma.medication.findMany({ where: { petId }, orderBy: { createdAt: "asc" } });
  }

  async create(petId: string, userId: string, dto: CreateMedicationDto) {
    assertDateOrder(dto.startDate, dto.endDate);

    return this.prisma.$transaction(async (tx) => {
      const medication = await tx.medication.create({
        data: {
          petId,
          name: dto.name,
          dosage: dto.dosage,
          unit: dto.unit,
          frequencyText: dto.frequencyText,
          route: dto.route,
          status: dto.status,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          instructions: dto.instructions,
          recordedByUserId: userId,
        },
      });
      await this.healthProfile.recomputeStatus(petId, tx);
      await this.events.publish(
        "MedicationAdded",
        { petId, medicationId: medication.id },
        { tx, aggregateType: "Pet", aggregateId: petId },
      );
      return medication;
    });
  }

  async update(petId: string, id: string, dto: UpdateMedicationDto) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.medication.findUnique({ where: { id } });
      if (!existing || existing.petId !== petId) throw new NotFoundApiException("Medication");

      const nextStart = dto.startDate === undefined ? existing.startDate?.toISOString() ?? null : dto.startDate;
      const nextEnd = dto.endDate === undefined ? existing.endDate?.toISOString() ?? null : dto.endDate;
      assertDateOrder(nextStart, nextEnd);

      const medication = await tx.medication.update({
        where: { id },
        data: {
          ...dto,
          startDate: dto.startDate === undefined ? undefined : dto.startDate ? new Date(dto.startDate) : null,
          endDate: dto.endDate === undefined ? undefined : dto.endDate ? new Date(dto.endDate) : null,
        },
      });
      await this.healthProfile.recomputeStatus(petId, tx);
      return medication;
    });
  }
}
