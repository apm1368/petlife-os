import { IsEnum, IsOptional, IsString, Length } from "class-validator";
import { AllergyKnowledgeState, AllergySeverity } from "@petlife/types";

export class CreateAllergyDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  reaction?: string;

  @IsOptional()
  @IsEnum(AllergySeverity)
  severity?: AllergySeverity;

  @IsOptional()
  @IsEnum(AllergyKnowledgeState)
  knowledgeState?: AllergyKnowledgeState;
}
