import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, Length } from "class-validator";
import { CarePlanItemStatus, CarePlanItemType } from "@petlife/types";

export class CreateCarePlanItemDto {
  @IsEnum(CarePlanItemType)
  type!: CarePlanItemType;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  detail?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class CreateCarePlanDto {
  @IsUUID()
  petId!: string;

  @IsOptional()
  @IsUUID()
  originatingVisitId?: string;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  notes?: string;

  @IsOptional()
  items?: CreateCarePlanItemDto[];
}

export class UpdateCarePlanItemStatusDto {
  @IsEnum(CarePlanItemStatus)
  status!: CarePlanItemStatus;
}
