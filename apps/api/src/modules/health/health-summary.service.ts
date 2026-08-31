import { Injectable } from "@nestjs/common";
import { MedicationStatus, VaccinationStatus, type HealthAreaKnowledgeState } from "@prisma/client";
import { HealthAttentionType, HealthSeverity, HomeActionKind, KnowledgeState, type HealthSummaryDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { HealthProfileService } from "./health-profile.service";

function deriveKnowledgeState(hasEntries: boolean, overallState: HealthAreaKnowledgeState | null): KnowledgeState {
  if (hasEntries) return KnowledgeState.KNOWN_PRESENT;
  if (overallState === "NONE_KNOWN") return KnowledgeState.KNOWN_NEGATIVE;
  if (overallState === "UNKNOWN") return KnowledgeState.UNKNOWN;
  return KnowledgeState.INCOMPLETE;
}

/**
 * The one consumer-facing view of a pet's health state, for Home and Pet
 * Profile. Never exposes raw Allergy/Condition/Medication/VaccinationSummary
 * rows — only derived, structured facts. Deterministic: no ML, no inference
 * beyond the Known Negative / Unknown / Incomplete / Known Present rules
 * documented on KnowledgeState and HealthProfile.
 */
@Injectable()
export class HealthSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthProfile: HealthProfileService,
  ) {}

  async getSummary(petId: string): Promise<HealthSummaryDto> {
    const [profile, allergyCount, conditionCount, medications, vaccination] = await Promise.all([
      this.healthProfile.getOrDefault(petId),
      this.prisma.allergy.count({ where: { petId } }),
      this.prisma.condition.count({ where: { petId } }),
      this.prisma.medication.findMany({ where: { petId }, select: { status: true } }),
      this.prisma.vaccinationSummary.findUnique({ where: { petId } }),
    ]);

    const allergyState = deriveKnowledgeState(allergyCount > 0, profile.allergiesOverallState);
    const conditionsState = deriveKnowledgeState(conditionCount > 0, profile.conditionsOverallState);
    const medicationsState = deriveKnowledgeState(medications.length > 0, profile.medicationsOverallState);
    const activeMedicationCount = medications.filter((m) => m.status === MedicationStatus.ACTIVE).length;

    const vaccinationStatus = (vaccination?.status ?? VaccinationStatus.INCOMPLETE) as unknown as HealthSummaryDto["vaccinationStatus"];
    const nextVaccinationDueAt = vaccination?.nextDueDate?.toISOString() ?? null;

    return {
      status: profile.status as unknown as HealthSummaryDto["status"],
      allergyState,
      conditionsState,
      activeMedicationCount,
      medicationsState,
      vaccinationStatus,
      nextVaccinationDueAt,
      primaryAttention: this.derivePrimaryAttention(vaccinationStatus, profile.status as unknown as HealthSummaryDto["status"]),
    };
  }

  /**
   * Mirrors the Home ranking priority order (vaccination due, then setup
   * incomplete) so Home and the Health Overview screen never disagree about
   * "what matters next". Only NORMAL/INFORMATIONAL/ATTENTION are ever
   * assigned in this handoff — HIGHER_CONCERN/URGENT/EMERGENCY exist in the
   * vocabulary for later, not wired to any logic yet.
   */
  private derivePrimaryAttention(
    vaccinationStatus: HealthSummaryDto["vaccinationStatus"],
    status: HealthSummaryDto["status"],
  ): HealthSummaryDto["primaryAttention"] {
    if (vaccinationStatus === "DUE_SOON" || vaccinationStatus === "OVERDUE") {
      return {
        type: HealthAttentionType.VACCINATION_DUE,
        severity: HealthSeverity.ATTENTION,
        titleKey: vaccinationStatus === "OVERDUE" ? "health.attention.vaccinationOverdue" : "health.attention.vaccinationDueSoon",
        action: HomeActionKind.VIEW_VACCINATION,
      };
    }

    if (status !== "COMPLETE") {
      return {
        type: HealthAttentionType.HEALTH_SETUP_INCOMPLETE,
        severity: HealthSeverity.INFORMATIONAL,
        titleKey: "health.attention.setupIncomplete",
        action: HomeActionKind.COMPLETE_HEALTH,
      };
    }

    return null;
  }
}
