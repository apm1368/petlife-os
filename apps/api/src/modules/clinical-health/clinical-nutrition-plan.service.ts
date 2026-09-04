import { Injectable } from "@nestjs/common";
import { CarePlanItemStatus } from "@prisma/client";
import type { ClinicalNutritionPlanDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CLINICAL_NUTRITION_PLAN_INCLUDE, toClinicalNutritionPlanDto } from "./clinical-health-mapper";
import { assertVisitBelongsToPet } from "./clinical-link.util";
import type { CreateClinicalNutritionPlanDto } from "./dto/clinical-nutrition-plan.dto";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";

@Injectable()
export class ClinicalNutritionPlanService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ctx: ResolvedProviderContext, dto: CreateClinicalNutritionPlanDto): Promise<ClinicalNutritionPlanDto> {
    await assertVisitBelongsToPet(this.prisma, dto.clinicalVisitId, dto.petId);

    const created = await this.prisma.clinicalNutritionPlan.create({
      data: {
        petId: dto.petId,
        providerOrganizationId: ctx.organizationId,
        providerUserId: ctx.providerUserId,
        clinicalVisitId: dto.clinicalVisitId,
        goal: dto.goal,
        dietType: dto.dietType as never,
        recommendedFoodText: dto.recommendedFoodText,
        dailyAmountText: dto.dailyAmountText,
        frequencyText: dto.frequencyText,
        restrictionsText: dto.restrictionsText,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        status: CarePlanItemStatus.ACTIVE,
        notes: dto.notes,
      },
      include: CLINICAL_NUTRITION_PLAN_INCLUDE,
    });
    return toClinicalNutritionPlanDto(created);
  }

  async list(petId: string): Promise<ClinicalNutritionPlanDto[]> {
    const rows = await this.prisma.clinicalNutritionPlan.findMany({ where: { petId }, include: CLINICAL_NUTRITION_PLAN_INCLUDE, orderBy: { createdAt: "desc" } });
    return rows.map(toClinicalNutritionPlanDto);
  }
}
