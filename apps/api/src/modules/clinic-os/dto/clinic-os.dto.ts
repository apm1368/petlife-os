import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from "class-validator";
import { ClinicReminderKind, ClinicReminderStatus } from "@prisma/client";

class PageQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class ListClinicCustomersQueryDto extends PageQuery {
  /** Matched against the owner's display name and the names of their pets seen by this clinic. */
  @IsOptional()
  @IsString()
  @Length(1, 100)
  q?: string;
}

export class CreateClinicReminderDto {
  @IsUUID()
  petId!: string;

  @IsEnum(ClinicReminderKind)
  kind!: ClinicReminderKind;

  @IsString()
  @Length(1, 120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  /** Omitted = send now. Otherwise must be in the future and within a year. */
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class ListClinicRemindersQueryDto extends PageQuery {
  @IsOptional()
  @IsEnum(ClinicReminderStatus)
  status?: ClinicReminderStatus;

  @IsOptional()
  @IsUUID()
  petId?: string;
}

export class ClinicFinanceReportQueryDto {
  /** Inclusive start (ISO date/time). Default: 30 days before `to`. */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Exclusive end (ISO date/time). Default: now. The window may not exceed 366 days. */
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class AssignClinicPlanDto {
  @IsIn(["CLINIC_BASIC", "CLINIC_GROWTH", "CLINIC_PRO"])
  planCode!: string;

  @IsString()
  @Length(3, 500)
  reason!: string;

  /** Optional end of the assigned period; after it the clinic falls back to the default plan. */
  @IsOptional()
  @IsDateString()
  periodEndsAt?: string;
}
