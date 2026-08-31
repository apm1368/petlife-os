import { IsDateString, IsEnum, IsOptional } from "class-validator";
import { HealthAreaKnowledgeState } from "@petlife/types";

/**
 * `status` is never client-settable — it's computed by
 * HealthProfileService.recomputeStatus() from the domains below plus the
 * allergies/conditions/medications lists. This DTO only carries the inputs
 * a client can actually provide: the per-domain "no known X" / "don't know"
 * state used when that domain's list is still empty (see
 * HealthAreaKnowledgeState), and marking the summary as reviewed.
 */
export class UpdateHealthProfileDto {
  @IsOptional()
  @IsDateString()
  lastReviewedAt?: string;

  @IsOptional()
  @IsEnum(HealthAreaKnowledgeState)
  allergiesOverallState?: HealthAreaKnowledgeState;

  @IsOptional()
  @IsEnum(HealthAreaKnowledgeState)
  conditionsOverallState?: HealthAreaKnowledgeState;

  @IsOptional()
  @IsEnum(HealthAreaKnowledgeState)
  medicationsOverallState?: HealthAreaKnowledgeState;
}
