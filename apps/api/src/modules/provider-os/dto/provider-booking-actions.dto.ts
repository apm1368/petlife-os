import { IsOptional, IsString, MaxLength } from "class-validator";

export class ProviderCancelBookingDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CompleteBookingDto {
  /** The deliberately small owner-visible summary (spec section 21) — kept separate from internal provider notes. */
  @IsOptional()
  @IsString()
  @MaxLength(280)
  completionNote?: string;
}

export class AddBookingProviderNoteDto {
  @IsString()
  @MaxLength(2000)
  content!: string;
}
