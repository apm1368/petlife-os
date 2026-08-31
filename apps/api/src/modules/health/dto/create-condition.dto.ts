import { IsDateString, IsEnum, IsOptional, IsString, Length } from "class-validator";
import { ConditionStatus } from "@petlife/types";

export class CreateConditionDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsEnum(ConditionStatus)
  status?: ConditionStatus;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notes?: string;

  @IsOptional()
  @IsDateString()
  firstRecordedAt?: string;
}
