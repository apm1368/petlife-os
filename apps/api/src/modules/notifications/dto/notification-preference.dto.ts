import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsOptional, IsString, Matches, ValidateNested } from "class-validator";
import { NotificationCategory, NotificationChannel } from "@prisma/client";

const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class NotificationPreferenceItemDto {
  @IsEnum(NotificationCategory)
  category!: NotificationCategory;

  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsBoolean()
  enabled!: boolean;
}

export class NotificationQuietHoursDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @Matches(HHMM_PATTERN, { message: "startTime must be a 24h HH:mm string" })
  startTime!: string;

  @IsString()
  @Matches(HHMM_PATTERN, { message: "endTime must be a 24h HH:mm string" })
  endTime!: string;

  @IsString()
  timezone!: string;
}

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceItemDto)
  preferences?: NotificationPreferenceItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationQuietHoursDto)
  quietHours?: NotificationQuietHoursDto;
}
