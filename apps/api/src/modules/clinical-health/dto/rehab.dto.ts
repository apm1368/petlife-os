import { IsOptional, IsString, IsUUID, Length } from "class-validator";

export class CreateRehabPlanDto {
  @IsUUID()
  petId!: string;

  @IsOptional()
  @IsUUID()
  clinicalVisitId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  goal?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  exercisesText?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  frequencyText?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  durationText?: string;
}

export class CreateRehabSessionDto {
  @IsString()
  sessionDate!: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  observation?: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  progressNotes?: string;
}
