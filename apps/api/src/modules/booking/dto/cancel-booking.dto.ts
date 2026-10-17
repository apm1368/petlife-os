import { OWNER_CANCELLATION_CODES } from "../booking-cancellation.util";
import { IsIn, IsOptional, IsString, Length } from "class-validator";

export class CancelBookingDto {
  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;

  @IsOptional()
  @IsIn(OWNER_CANCELLATION_CODES)
  reasonCode?: (typeof OWNER_CANCELLATION_CODES)[number];
}
