import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Length, Max, Min } from "class-validator";
import { PartialType } from "@nestjs/mapped-types";
import { CARE_TYPES, RECURRENCES } from "./care-time";

export class CreateReminderDto {
  @IsString() @Length(1, 200) title!: string;
  @IsIn(CARE_TYPES) type!: string;
  @IsISO8601({ strict: true }) dueAt!: string;
  @IsOptional() @IsIn(RECURRENCES) recurrence?: string;
  @IsOptional() @IsInt() @Min(1) @Max(3650) intervalDays?: number;
}
export class EditReminderDto extends PartialType(CreateReminderDto) {}
export class ReminderActionDto {
  @IsIn(["COMPLETE", "CANCEL", "SNOOZE", "RESCHEDULE"]) action!: string;
  @IsOptional() @IsISO8601({ strict: true }) at?: string;
}
