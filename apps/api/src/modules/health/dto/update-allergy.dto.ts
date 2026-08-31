import { IsEnum, IsOptional, IsString, Length } from "class-validator";
import { AllergyKnowledgeState, AllergySeverity, AllergyStatus } from "@petlife/types";

export class UpdateAllergyDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  reaction?: string | null;

  @IsOptional()
  @IsEnum(AllergySeverity)
  severity?: AllergySeverity | null;

  @IsOptional()
  @IsEnum(AllergyKnowledgeState)
  knowledgeState?: AllergyKnowledgeState;

  @IsOptional()
  @IsEnum(AllergyStatus)
  status?: AllergyStatus;
}
