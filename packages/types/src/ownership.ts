/**
 * The household & pet-ownership contract (ID-01, ID-02, ID-03, ID-05, ID-06, ID-07).
 *
 * These types are the shared vocabulary between the API, the web client and the
 * decision log. They live in `@petlife/types` so both sides speak the same names
 * and a drift between the two fails the build instead of the product.
 *
 * The enum names are spelled out here rather than imported from `@prisma/client`
 * on purpose: this package deliberately has no Prisma dependency so it stays
 * usable from the frontend (see the note at the top of index.ts). They mirror
 * the Prisma enums exactly — the API maps between them at the boundary.
 */

/** How long a transfer request stays actionable before it expires. */
export const OWNERSHIP_TRANSFER_EXPIRY_DAYS = 7;

/** What happens to the pet's memories when it moves to a new household (ID-05). */
export const PET_MEMORY_DISPOSITIONS = ["TRANSFER", "RETAIN", "COPY_READ_ONLY"] as const;
export type PetMemoryDisposition = (typeof PET_MEMORY_DISPOSITIONS)[number];

export const PET_OWNERSHIP_TRANSFER_STATUSES = [
  "PENDING_REVIEW",
  "ACCEPTED",
  "DECLINED",
  "CANCELLED",
  "EXPIRED",
  "DISPUTED",
] as const;
export type PetOwnershipTransferStatusName = (typeof PET_OWNERSHIP_TRANSFER_STATUSES)[number];

/** The pet's single primary owner (ID-01). */
export interface PetOwnershipDto {
  petId: string;
  ownerUserId: string;
  ownerDisplayName: string | null;
  householdId: string;
  transferredAt: string;
}

/** A transfer request and the two-party agreement behind it (ID-01). */
export interface PetOwnershipTransferDto {
  id: string;
  petId: string;
  petName: string;
  fromUserId: string;
  fromDisplayName: string | null;
  toUserId: string;
  toDisplayName: string | null;
  fromHouseholdId: string;
  toHouseholdId: string;
  status: PetOwnershipTransferStatusName;
  memoryDisposition: PetMemoryDisposition;
  note: string | null;
  createdAt: string;
  respondedAt: string | null;
  appliedAt: string | null;
  expiresAt: string;
}

/**
 * What a transfer actually moved (ID-05, ID-06, ID-07). Returned by the accept
 * endpoint so the product can tell both sides exactly what happened, rather than
 * asking them to re-derive it.
 */
export interface PetOwnershipTransferOutcomeDto {
  transfer: PetOwnershipTransferDto;
  ownership: PetOwnershipDto;
  /** The pet's home household after the transfer. */
  householdId: string;
  /** The pet moved to this household (ID-06). */
  movedBookings: number;
  movedReminders: number;
  /** Health records travel with the pet (ID-05) — reported for transparency. */
  movedHealthRecords: boolean;
  /** Memories followed the previous owner's choice (ID-05). */
  memoryDisposition: PetMemoryDisposition;
  movedMemories: number;
  /** Costs do NOT travel (ID-05) — they stay with the previous household. */
  retainedExpenses: number;
  /** The subscription payer moved to the new owner and is suspended until they approve (ID-07). */
  subscriptionPayerChanged: boolean;
  subscriptionSuspended: boolean;
}

/**
 * A read-only copy left behind after a household separation (ID-02).
 * The original memory stays with the pet; this is a read grant over it.
 */
export interface PetMemoryCopyDto {
  copyId: string;
  memoryId: string;
  petId: string;
  petName: string | null;
  householdId: string;
  createdAt: string;
  memory: {
    id: string;
    type: string;
    title: string | null;
    description: string | null;
    occurredAt: string;
    mediaObjectKeys: string[];
    tags: string[];
  };
}
