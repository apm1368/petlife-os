import { IsBoolean, IsEnum, IsOptional, IsString, Length } from "class-validator";
import { PetSpecies } from "@petlife/types";

export class CreateNoteTemplateDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  presentingComplaint?: string;

  @IsOptional()
  @IsEnum(PetSpecies)
  species?: PetSpecies;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  reasonForVisitTemplate?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  historyTemplate?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  observationsTemplate?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  assessmentTemplate?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  planTemplate?: string;
}

export class UpdateNoteTemplateDto extends CreateNoteTemplateDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
