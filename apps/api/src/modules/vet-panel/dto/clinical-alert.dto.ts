import { IsEnum, IsString, IsUUID, Length } from "class-validator";
import { ClinicalAlertSeverity, ClinicalAlertType } from "@petlife/types";

export class CreateClinicalAlertDto {
  @IsUUID()
  petId!: string;

  @IsEnum(ClinicalAlertType)
  type!: ClinicalAlertType;

  @IsEnum(ClinicalAlertSeverity)
  severity!: ClinicalAlertSeverity;

  @IsString()
  @Length(1, 500)
  message!: string;
}

export class ResolveClinicalAlertDto {
  @IsUUID()
  petId!: string;
}
