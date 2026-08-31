import { Injectable } from "@nestjs/common";
import { SetupStatus, VaccinationStatus, type PetInterest } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PetAccessService } from "../pet-access/pet-access.service";
import { HealthSummaryService } from "../health/health-summary.service";
import { CareProfileService } from "../care-profile/care-profile.service";
import { HomeRankingService, type HomeRankingHealthInput, type HomeRankingCareInput } from "./home-ranking.service";

const HEALTH_NOT_VISIBLE: HomeRankingHealthInput = {
  visible: false,
  vaccinationStatus: VaccinationStatus.INCOMPLETE,
  profileStatus: SetupStatus.NOT_STARTED,
};

const CARE_NOT_VISIBLE: HomeRankingCareInput = { visible: false, profileStatus: SetupStatus.NOT_STARTED };

@Injectable()
export class HomeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ranking: HomeRankingService,
    private readonly petAccess: PetAccessService,
    private readonly healthSummary: HealthSummaryService,
    private readonly careProfile: CareProfileService,
  ) {}

  async getHome(userId: string) {
    const membership = await this.prisma.householdMember.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    if (!membership) {
      const { primaryAction, secondaryActions } = this.ranking.rank({
        hasActivePet: false,
        activePetId: null,
        interests: [],
        health: HEALTH_NOT_VISIBLE,
        care: CARE_NOT_VISIBLE,
      });
      return { activePet: null, primaryAction, secondaryActions };
    }

    const preference = await this.prisma.activePetPreference.findUnique({
      where: { userId_householdId: { userId, householdId: membership.householdId } },
      include: { pet: true },
    });

    const activePet = preference?.pet ?? null;

    if (!activePet) {
      const { primaryAction, secondaryActions } = this.ranking.rank({
        hasActivePet: false,
        activePetId: null,
        interests: [],
        health: HEALTH_NOT_VISIBLE,
        care: CARE_NOT_VISIBLE,
      });
      return { activePet: null, primaryAction, secondaryActions };
    }

    const interests = (
      await this.prisma.userPetInterest.findMany({
        where: { userId, OR: [{ petId: activePet.id }, { petId: null }] },
      })
    ).map((row) => row.interest as PetInterest);

    // Never query health/care data the caller lacks permission to see — Home must not leak it, even indirectly via ranking.
    const access = await this.petAccess.getEffectivePermissions(activePet.id, userId);

    const health: HomeRankingHealthInput = access?.canViewHealth
      ? await this.healthSummary.getSummary(activePet.id).then((summary) => ({
          visible: true,
          vaccinationStatus: summary.vaccinationStatus,
          profileStatus: summary.status,
        }))
      : HEALTH_NOT_VISIBLE;

    const care: HomeRankingCareInput = access?.canViewCareProfile
      ? await this.careProfile
          .get(activePet.id)
          .then((profile) => ({ visible: true, profileStatus: profile.status as unknown as SetupStatus }))
      : CARE_NOT_VISIBLE;

    const { primaryAction, secondaryActions } = this.ranking.rank({
      hasActivePet: true,
      activePetId: activePet.id,
      interests,
      health,
      care,
    });

    return { activePet, primaryAction, secondaryActions };
  }
}
