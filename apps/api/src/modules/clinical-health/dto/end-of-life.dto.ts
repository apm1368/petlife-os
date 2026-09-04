import { IsOptional, IsString, Length } from "class-validator";

/** Careful, non-commercial foundation — updating this never touches Pet.lifecycleStatus (see EndOfLifeCareService). */
export class UpsertEndOfLifeCarePlanDto {
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  palliativeCareNotes?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  endOfLifePreferences?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  aftercarePreferences?: string;
}
