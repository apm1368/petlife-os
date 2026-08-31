import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { HomeRankingService } from "./home-ranking.service";
import type { PetInterest } from "@petlife/types";

@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ranking: HomeRankingService,
  ) {}

  async getHome(userId: string) {
    const membership = await this.prisma.householdMember.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    if (!membership) {
      const { primaryAction, secondaryActions } = this.ranking.rank({
        hasActivePet: false,
        healthBasicsComplete: false,
        interests: [],
      });
      return { activePet: null, primaryAction, secondaryActions };
    }

    const preference = await this.prisma.activePetPreference.findUnique({
      where: { userId_householdId: { userId, householdId: membership.householdId } },
      include: { pet: true },
    });

    const activePet = preference?.pet ?? null;

    const interests = activePet
      ? (
          await this.prisma.userPetInterest.findMany({
            where: { userId, OR: [{ petId: activePet.id }, { petId: null }] },
          })
        ).map((row) => row.interest as PetInterest)
      : [];

    const healthBasicsComplete = Boolean(
      activePet && (activePet.latestWeightValue !== null || activePet.neuteredStatus !== null),
    );

    const { primaryAction, secondaryActions } = this.ranking.rank({
      hasActivePet: Boolean(activePet),
      healthBasicsComplete,
      interests,
    });

    return { activePet, primaryAction, secondaryActions };
  }
}
