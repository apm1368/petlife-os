import { IsArray, IsEnum, IsOptional, IsString, IsUUID, Length } from "class-validator";
import { OnboardingChapter, OnboardingStatus, PetInterest } from "@petlife/types";

export class UpdateProgressDto {
  @IsEnum(OnboardingChapter)
  chapter!: OnboardingChapter;

  @IsString()
  @Length(1, 80)
  step!: string;

  @IsEnum(OnboardingStatus)
  status!: OnboardingStatus;

  @IsOptional()
  @IsUUID()
  householdId?: string;

  @IsOptional()
  @IsUUID()
  petId?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(PetInterest, { each: true })
  interests?: PetInterest[];
}
