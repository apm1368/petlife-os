import { PetExpenseCategory } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from "class-validator";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** Int column ceiling with headroom: 2 billion rial (200 million toman) per single entry. */
const MAX_AMOUNT_IRR = 2_000_000_000;

export class CreatePetExpenseDto {
  @IsEnum(PetExpenseCategory)
  category!: PetExpenseCategory;

  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_IRR)
  amountIrr!: number;

  @Matches(DAY)
  spentOn!: string;

  @IsOptional()
  @IsString()
  @Length(1, 300)
  note?: string;
}

export class UpdatePetExpenseDto {
  @IsOptional()
  @IsEnum(PetExpenseCategory)
  category?: PetExpenseCategory;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT_IRR)
  amountIrr?: number;

  @IsOptional()
  @Matches(DAY)
  spentOn?: string;

  /** Empty string clears the note. */
  @IsOptional()
  @IsString()
  @Length(0, 300)
  note?: string;
}
