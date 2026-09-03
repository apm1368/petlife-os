import { Injectable } from "@nestjs/common";
import type { RehabPlanDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException } from "../../common/errors/api-exception";
import { REHAB_PLAN_INCLUDE, toRehabPlanDto } from "./clinical-health-mapper";
import { assertVisitBelongsToPet } from "./clinical-link.util";
import type { CreateRehabPlanDto, CreateRehabSessionDto } from "./dto/rehab.dto";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";

@Injectable()
export class RehabService {
  constructor(private readonly prisma: PrismaService) {}

  async createPlan(ctx: ResolvedProviderContext, dto: CreateRehabPlanDto): Promise<RehabPlanDto> {
    await assertVisitBelongsToPet(this.prisma, dto.clinicalVisitId, dto.petId);

    const created = await this.prisma.rehabPlan.create({
      data: {
        petId: dto.petId,
        providerOrganizationId: ctx.organizationId,
        providerUserId: ctx.providerUserId,
        clinicalVisitId: dto.clinicalVisitId,
        goal: dto.goal,
        exercisesText: dto.exercisesText,
        frequencyText: dto.frequencyText,
        durationText: dto.durationText,
      },
      include: REHAB_PLAN_INCLUDE,
    });
    return toRehabPlanDto(created);
  }

  async list(petId: string): Promise<RehabPlanDto[]> {
    const rows = await this.prisma.rehabPlan.findMany({ where: { petId }, include: REHAB_PLAN_INCLUDE, orderBy: { createdAt: "desc" } });
    return rows.map(toRehabPlanDto);
  }

  async addSession(petId: string, rehabPlanId: string, dto: CreateRehabSessionDto): Promise<RehabPlanDto> {
    const plan = await this.prisma.rehabPlan.findUnique({ where: { id: rehabPlanId } });
    if (!plan || plan.petId !== petId) throw new NotFoundApiException("Rehab plan");

    await this.prisma.rehabSession.create({
      data: { rehabPlanId, sessionDate: new Date(dto.sessionDate), observation: dto.observation, progressNotes: dto.progressNotes },
    });
    const updated = await this.prisma.rehabPlan.findUniqueOrThrow({ where: { id: rehabPlanId }, include: REHAB_PLAN_INCLUDE });
    return toRehabPlanDto(updated);
  }
}
