import { PROVIDER_CANCELLATION_CODES } from "../../booking/booking-cancellation.util";
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class ProviderCancelBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsIn(PROVIDER_CANCELLATION_CODES)
  reasonCode?: (typeof PROVIDER_CANCELLATION_CODES)[number];
}

/** A follow-up the provider explicitly specifies — projected into the owner's Care Center as PROVIDER_CREATED. */
export class BookingFollowUpDto {
  @IsIn(["FOLLOW_UP", "VACCINATION", "MEDICATION", "MONITORING", "OTHER"])
  type!: "FOLLOW_UP" | "VACCINATION" | "MEDICATION" | "MONITORING" | "OTHER";

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  detail?: string;

  @IsDateString()
  dueAt!: string;
}

export class CompleteBookingDto {
  /** The deliberately small owner-visible summary (spec section 21) — kept separate from internal provider notes. */
  @IsOptional()
  @IsString()
  @MaxLength(280)
  completionNote?: string;

  /** Longer owner-visible care instructions (aftercare), up to 2000 characters. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  aftercareInstructions?: string;

  /** VET bookings only. Nothing is scheduled unless the provider enters it here. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => BookingFollowUpDto)
  followUps?: BookingFollowUpDto[];
}

export class AddBookingProviderNoteDto {
  @IsString()
  @MaxLength(2000)
  content!: string;
}

export class RejectBookingRequestDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class RecordRideEventDto {
  @IsIn(["DRIVER_ASSIGNED", "ARRIVING", "PICKED_UP", "DROPPED_OFF"])
  type!: "DRIVER_ASSIGNED" | "ARRIVING" | "PICKED_UP" | "DROPPED_OFF";

  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}
