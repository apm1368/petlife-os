import { Injectable } from "@nestjs/common";
import { OnboardingChapter, OnboardingStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { HouseholdAccessDeniedException, PetAccessDeniedException } from "../../common/errors/api-exception";
import { PetAccessService } from "../pet-access/pet-access.service";
import type { UpdateProgressDto } from "./dto/update-progress.dto";

const INITIAL_STATE = {
  chapter: OnboardingChapter.ACCOUNT,
  step: "welcome",
  status: OnboardingStatus.IN_PROGRESS,
  completedSteps: [] as string[],
};

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly petAccess: PetAccessService,
  ) {}

  async getProgress(userId: string) {
    const progress = await this.prisma.onboardingProgress.findUnique({ where: { userId } });
    if (progress) return progress;
    // Resumable-by-default: an unstarted user still gets a well-formed
    // "at the beginning" state instead of a 404.
    return { userId, ...INITIAL_STATE, householdId: null, petId: null, lastCompletedAt: null };
  }

  async updateProgress(userId: string, dto: UpdateProgressDto) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.onboardingProgress.findUnique({ where: { userId } });
      // Never persist a caller-supplied relationship without validating both scope and access.
      const householdId = dto.householdId === undefined ? existing?.householdId ?? null : dto.householdId;
      const householdChanged = householdId !== (existing?.householdId ?? null);
      const petId = dto.petId === undefined ? householdChanged ? null : existing?.petId ?? null : dto.petId;
      if (householdId) {
        const membership = await tx.householdMember.findUnique({ where: { householdId_userId: { householdId, userId } } });
        if (!membership) throw new HouseholdAccessDeniedException();
      }
      if (petId) {
        const pet = await tx.pet.findUnique({ where: { id: petId }, select: { householdId: true } });
        if (!householdId || !pet || pet.householdId !== householdId) throw new PetAccessDeniedException();
        const access = await this.petAccess.getEffectivePermissions(petId, userId, tx);
        if (!access?.canEditIdentity) throw new PetAccessDeniedException();
      }
      const completedSteps = new Set<string>(Array.isArray(existing?.completedSteps) ? (existing.completedSteps as string[]) : []);
      if (dto.status === "COMPLETED" || dto.status === "SKIPPED") {
        completedSteps.add(dto.step);
      }

      const progress = await tx.onboardingProgress.upsert({
        where: { userId },
        update: {
          chapter: dto.chapter,
          step: dto.step,
          status: dto.status,
          householdId,
          petId,
          completedSteps: Array.from(completedSteps),
          lastCompletedAt: dto.status === "COMPLETED" ? new Date() : existing?.lastCompletedAt,
        },
        create: {
          userId,
          chapter: dto.chapter,
          step: dto.step,
          status: dto.status,
          householdId,
          petId,
          completedSteps: Array.from(completedSteps),
        },
      });

      if (dto.interests?.length) {
        await tx.userPetInterest.createMany({
          data: dto.interests.map((interest) => ({ userId, petId, interest })),
          skipDuplicates: true,
        });
      }

      return progress;
    });
  }

  async complete(userId: string) {
    return this.prisma.$transaction(async (tx) => {
      const progress = await tx.onboardingProgress.upsert({
        where: { userId },
        update: {
          chapter: OnboardingChapter.READY,
          step: "ready",
          status: OnboardingStatus.COMPLETED,
          lastCompletedAt: new Date(),
        },
        create: {
          userId,
          chapter: OnboardingChapter.READY,
          step: "ready",
          status: OnboardingStatus.COMPLETED,
          completedSteps: [],
          lastCompletedAt: new Date(),
        },
      });

      await this.events.publish("OnboardingCompleted", { userId }, { tx, aggregateType: "User", aggregateId: userId });
      return progress;
    });
  }
}
