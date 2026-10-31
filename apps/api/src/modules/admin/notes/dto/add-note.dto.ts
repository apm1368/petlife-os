import { IsEnum, IsIn, IsNotEmpty, IsString } from "class-validator";
import { InternalNoteEntityType } from "@prisma/client";

/**
 * The generic /admin/notes route belongs to Customer 360. Case notes use
 * their own controllers, where support/trust/dispute permissions are checked.
 * Keeping this allow-list at the request boundary prevents a customer-view
 * role from selecting a more sensitive case type in the JSON body.
 */
export const CUSTOMER_NOTE_ENTITY_TYPES = [
  InternalNoteEntityType.USER,
  InternalNoteEntityType.HOUSEHOLD,
  InternalNoteEntityType.PET,
] as const;

export class AddNoteDto {
  @IsEnum(InternalNoteEntityType)
  @IsIn(CUSTOMER_NOTE_ENTITY_TYPES)
  entityType!: InternalNoteEntityType;

  @IsString()
  @IsNotEmpty()
  entityId!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;
}
