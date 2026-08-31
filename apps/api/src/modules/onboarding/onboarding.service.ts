import { Injectable } from "@nestjs/common";
import { OnboardingChapter, OnboardingStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
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
  ) {}

  async getProgress(userId: string) {
    const progress = await this.prisma.onboardingProgress.findUnique({ where: { userId } });
    if (progress) return progress;
    // Resumable-by-default: an unstarted user still gets a well-formed
    // "at the beginning" state instead of a 404.
    return { userId, ...INITIAL_STATE, householdId: null, petId: null, lastCompletedAt: null };
  }

  async updateProgress(userId: string, dto: UpdateProgressDto) {
    const existing = await this.prisma.onboardingProgress.findUnique({ where: { userId } });
    const completedSteps = new Set<string>(Array.isArray(existing?.completedSteps) ? (existing.completedSteps as string[]) : []);
    if (dto.status === "COMPLETED" || dto.status === "SKIPPED") {
      completedSteps.add(dto.step);
    }

    const progress = await this.prisma.onboardingProgress.upsert({
      where: { userId },
      update: {
        chapter: dto.chapter,
        step: dto.step,
        status: dto.status,
        householdId: dto.householdId,
        petId: dto.petId,
        completedSteps: Array.from(completedSteps),
        lastCompletedAt: dto.status === "COMPLETED" ? new Date() : existing?.lastCompletedAt,
      },
      create: {
        userId,
        chapter: dto.chapter,
        step: dto.step,
        status: dto.status,
        householdId: dto.householdId,
        petId: dto.petId,
        completedSteps: Array.from(completedSteps),
      },
    });

    if (dto.interests?.length) {
      await this.prisma.userPetInterest.createMany({
        data: dto.interests.map((interest) => ({ userId, petId: dto.petId, interest })),
        skipDuplicates: true,
      });
    }

    return progress;
  }

  async complete(userId: string) {
    const progress = await this.prisma.onboardingProgress.upsert({
      where: { userId },
      update: { chapter: OnboardingChapter.READY, step: "ready", status: OnboardingStatus.COMPLETED, lastCompletedAt: new Date() },
      create: {
        userId,
        chapter: OnboardingChapter.READY,
        step: "ready",
        status: OnboardingStatus.COMPLETED,
        completedSteps: [],
        lastCompletedAt: new Date(),
      },
    });

    await this.events.publish("OnboardingCompleted", { userId });
    return progress;
  }
}
