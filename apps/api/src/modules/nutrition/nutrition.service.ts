import { Injectable } from "@nestjs/common";
import { SetupStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import type { UpdateNutritionDto } from "./dto/update-nutrition.dto";

/**
 * COMPLETE requires the three core questions answered (dietType,
 * currentFoodText, feedingFrequencyText) — dietType=UNKNOWN still counts as
 * "answered" (an explicit "I don't know"), matching the Known/Unknown/
 * Incomplete convention used elsewhere. restrictionsText is always optional:
 * "no restrictions" is a legitimate, un-stated default, not a missing answer.
 */
function computeStatus(dietType: unknown, currentFoodText: unknown, feedingFrequencyText: unknown): SetupStatus {
  const answered = [dietType, currentFoodText, feedingFrequencyText].filter((v) => v !== null && v !== undefined);
  if (answered.length === 0) return SetupStatus.NOT_STARTED;
  if (answered.length === 3) return SetupStatus.COMPLETE;
  return SetupStatus.PARTIAL;
}

@Injectable()
export class NutritionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async get(petId: string) {
    const profile = await this.prisma.nutritionProfile.findUnique({ where: { petId } });
    if (profile) return profile;
    return {
      petId,
      dietType: null,
      currentFoodText: null,
      feedingFrequencyText: null,
      restrictionsText: null,
      status: SetupStatus.NOT_STARTED,
      createdAt: null,
      updatedAt: null,
    };
  }

  /** PUT semantics: always a full replace of the one nutrition row per pet. */
  async upsert(petId: string, dto: UpdateNutritionDto) {
    const existing = await this.prisma.nutritionProfile.findUnique({ where: { petId } });
    const dietType = dto.dietType ?? existing?.dietType ?? null;
    const currentFoodText = dto.currentFoodText ?? existing?.currentFoodText ?? null;
    const feedingFrequencyText = dto.feedingFrequencyText ?? existing?.feedingFrequencyText ?? null;
    const status = computeStatus(dietType, currentFoodText, feedingFrequencyText);

    const profile = await this.prisma.nutritionProfile.upsert({
      where: { petId },
      update: {
        dietType: dto.dietType,
        currentFoodText: dto.currentFoodText,
        feedingFrequencyText: dto.feedingFrequencyText,
        restrictionsText: dto.restrictionsText,
        status,
      },
      create: {
        petId,
        dietType: dto.dietType,
        currentFoodText: dto.currentFoodText,
        feedingFrequencyText: dto.feedingFrequencyText,
        restrictionsText: dto.restrictionsText,
        status,
      },
    });

    await this.events.publish("NutritionProfileUpdated", { petId }, { aggregateType: "Pet", aggregateId: petId });
    return profile;
  }
}
