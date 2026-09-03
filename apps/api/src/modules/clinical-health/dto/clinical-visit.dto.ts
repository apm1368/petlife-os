import { IsOptional, IsString, IsUUID, Length } from "class-validator";

export class StartClinicalVisitDto {
  @IsUUID()
  petId!: string;

  @IsOptional()
  @IsUUID()
  bookingId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 500)
  reasonForVisit?: string;
}

/** Draft/in-progress note edits only — see ClinicalVisitService for why COMPLETED visits reject this and require amend() instead. */
export class UpdateClinicalVisitNotesDto {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  reasonForVisit?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  historyText?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  observationsText?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  assessmentText?: string;

  @IsOptional()
  @IsString()
  @Length(1, 5000)
  planText?: string;
}

/** Same fields as an update, plus the mandatory reason — amending a COMPLETED visit always snapshots the prior content first (see ClinicalVisitService.amend). */
export class AmendClinicalVisitDto extends UpdateClinicalVisitNotesDto {
  @IsString()
  @Length(1, 500)
  reason!: string;
}

export class VoidClinicalVisitDto {
  @IsString()
  @Length(1, 500)
  reason!: string;
}
