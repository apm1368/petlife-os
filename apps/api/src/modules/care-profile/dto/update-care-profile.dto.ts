import { IsOptional, IsString, Length } from "class-validator";

export class UpdateCareProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  temperamentText?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  aroundPeopleText?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  aroundAnimalsText?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  leashBehaviorText?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  handlingSensitivityText?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  feedingRoutineText?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  toiletRoutineText?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  separationBehaviorText?: string;

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  specialInstructionsText?: string;
}
