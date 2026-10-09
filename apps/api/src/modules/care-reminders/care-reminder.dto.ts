import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Length, Max, Min, ValidateIf, ValidateNested } from "class-validator";
import { PartialType } from "@nestjs/mapped-types";
import { Type } from "class-transformer";
import { CARE_TYPES, RECURRENCES } from "./care-time";

export class CreateReminderDto {
  @IsString() @Length(1, 200) title!: string;
  @IsIn(CARE_TYPES) type!: string;
  @IsISO8601({ strict: true }) dueAt!: string;
  @IsOptional() @IsIn(RECURRENCES) recurrence?: string;
  @IsOptional() @IsInt() @Min(1) @Max(3650) intervalDays?: number;
  /** recurrence WEEKDAYS: 0=Sunday … 6=Saturday (Asia/Tehran). */
  @IsOptional() @IsArray() @ArrayUnique() @ArrayMaxSize(7) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) weekdays?: number[];
  @IsOptional() @IsISO8601({ strict: true }) untilDate?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1000) maxOccurrences?: number;
  /** A household member (or care-handoff recipient) with care-edit access; null clears. */
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() assignedToUserId?: string | null;
}
export class EditReminderDto extends PartialType(CreateReminderDto) {}
export class ReminderActionDto {
  @IsIn(["COMPLETE", "SKIP", "CANCEL", "SNOOZE", "RESCHEDULE"]) action!: string;
  @IsOptional() @IsISO8601({ strict: true }) at?: string;
}

export class CareHistoryQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
  /** One closed state: COMPLETED, SKIPPED or CANCELLED. */
  @IsOptional() @IsIn(["COMPLETED", "SKIPPED", "CANCELLED"]) state?: string;
  @IsOptional() @IsIn(CARE_TYPES) type?: string;
  /** Filter on when the item was due (inclusive range). */
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
}

export class ApplyCareTemplateDto {
  @IsString() @Length(1, 60) templateKey!: string;
  /** First due time of every confirmed item (timezone required). */
  @IsISO8601({ strict: true }) startAt!: string;
  /** Exactly the items the member confirmed, optionally with their own recurrence. Nothing is created otherwise. */
  @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ConfirmedTemplateItemDto) items!: ConfirmedTemplateItemDto[];
}
export class ConfirmedTemplateItemDto {
  @IsString() @Length(1, 60) key!: string;
  @IsOptional() @IsString() @Length(1, 200) title?: string;
  @IsOptional() @IsIn(RECURRENCES) recurrence?: string;
  @IsOptional() @IsInt() @Min(1) @Max(3650) intervalDays?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1000) maxOccurrences?: number;
}
