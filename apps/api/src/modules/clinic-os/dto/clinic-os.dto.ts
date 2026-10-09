import { Type } from "class-transformer";
import { Equals, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateIf } from "class-validator";
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
  /** Only customers carrying this clinic tag. */
  @IsOptional()
  @IsUUID()
  tagId?: string;

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

export class AddClinicStaffDto {
  /** An existing PET LIFE account. Only VET or STAFF can be added — owners are never created through the API. */
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsIn(["VET", "STAFF"])
  role!: "VET" | "STAFF";

  @IsOptional()
  @IsString()
  @Length(1, 80)
  displayTitle?: string;
}

export class AddClinicBranchDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsString()
  @Length(3, 300)
  addressLine!: string;

  @IsString()
  @Length(1, 80)
  city!: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  region?: string;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\-\s()]{5,20}$/)
  phone?: string;
}

export class AddCustomerNoteDto {
  @IsString() @Length(1, 2000) body!: string;
  @IsOptional() @IsBoolean() visibleToOwner?: boolean;
}

export class CreateTagDto {
  @IsString() @Length(1, 40) name!: string;
}

export class QueueQueryDto {
  /** Tehran calendar day, YYYY-MM-DD. Default: today. */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
}

export class AssignAppointmentDto {
  /** A bookable, active member of this clinic; null unassigns. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() providerUserId?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() resourceId?: string | null;
}

export class CreateClinicTaskDto {
  @IsIn(["CALL_CUSTOMER", "FOLLOW_UP_LAB", "CONFIRM_APPOINTMENT", "COLLECT_PAYMENT", "OTHER"]) type!: "CALL_CUSTOMER" | "FOLLOW_UP_LAB" | "CONFIRM_APPOINTMENT" | "COLLECT_PAYMENT" | "OTHER";
  @IsString() @Length(1, 200) title!: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsUUID() assigneeProviderUserId?: string;
  @IsOptional() @IsUUID() householdId?: string;
  @IsOptional() @IsUUID() bookingId?: string;
}

export class ListClinicTasksQueryDto {
  @IsOptional() @IsIn(["OPEN", "DONE", "CANCELLED"]) status?: "OPEN" | "DONE" | "CANCELLED";
  @IsOptional() @IsIn(["true", "false"]) mine?: string;
}

export class CampaignPreviewDto {
  @IsIn(["APPOINTMENTS_TOMORROW", "VACCINES_DUE", "FOLLOW_UP_DUE"]) segment!: "APPOINTMENTS_TOMORROW" | "VACCINES_DUE" | "FOLLOW_UP_DUE";
}

export class SendCampaignDto extends CampaignPreviewDto {
  @IsString() @Length(1, 120) title!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  /** The provider's explicit confirmation of the previewed audience. */
  @IsBoolean() @Equals(true) confirm!: boolean;
  /** Must equal the current preview count — a stale preview is refused rather than sent to a different audience. */
  @IsInt() @Min(1) @Max(5000) expectedCount!: number;
}

export class ImportContactsDto {
  /** UTF-8 CSV with a header row: name, phone, email, petName, species, notes. At most 1000 rows. */
  @IsString() @MaxLength(1_000_000) csv!: string;
  /** true (default) only validates; false imports the valid, non-duplicate rows. */
  @IsOptional() @IsBoolean() dryRun?: boolean;
  /** Required to commit (dryRun: false): the token returned by the dry run of this same file. */
  @IsOptional() @IsString() @MaxLength(64) confirmationToken?: string;
}

export class ListContactsQueryDto {
  @IsOptional() @IsString() @Length(1, 100) q?: string;
}
