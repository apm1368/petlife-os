import type {
  PetMemoryCopyDto,
  PetOwnershipDto,
  PetOwnershipTransferDto,
  PetOwnershipTransferOutcomeDto,
} from "@petlife/types";
import { apiFetch } from "@/lib/api/client";

/**
 * The household & pet-ownership client (ID-01, ID-02, ID-03, ID-05, ID-06, ID-07).
 *
 * Kept separate from `households.service.ts` on purpose: that service is about
 * the household's membership and invitations, while this one is about who owns
 * a pet and how that ownership moves. The two overlap at the edges — a transfer
 * changes both a pet's household and its owner — so they must not be merged into
 * one file.
 */
export const petOwnershipService = {
  /** The pets the caller is the primary owner of (ID-01). */
  listOwnedPets: () => apiFetch<PetOwnershipDto[]>("/pet-ownership/pets"),

  /** The primary owner of one pet. */
  getOwnership: (petId: string) => apiFetch<PetOwnershipDto | null>(`/pet-ownership/pets/${petId}`),

  /** Transfers waiting for the caller's answer. */
  listIncoming: () => apiFetch<PetOwnershipTransferDto[]>("/pet-ownership/transfers/incoming"),

  /** Transfers the caller proposed. */
  listOutgoing: () => apiFetch<PetOwnershipTransferDto[]>("/pet-ownership/transfers/outgoing"),

  /** Every transfer involving the caller. */
  listAll: () => apiFetch<PetOwnershipTransferDto[]>("/pet-ownership/transfers"),

  getTransfer: (transferId: string) => apiFetch<PetOwnershipTransferDto>(`/pet-ownership/transfers/${transferId}`),

  /**
   * The current owner proposes a transfer. Nothing moves until the recipient
   * accepts (ID-01: "ownership transfer needs both parties' approval").
   */
  requestTransfer: (petId: string, input: { toUserId: string; memoryDisposition?: "TRANSFER" | "RETAIN" | "COPY_READ_ONLY"; note?: string }) =>
    apiFetch<PetOwnershipTransferDto>(`/pet-ownership/pets/${petId}/transfers`, { method: "POST", body: input }),

  /** The recipient accepts: both parties have approved, so the pet moves. */
  acceptTransfer: (transferId: string) =>
    apiFetch<PetOwnershipTransferOutcomeDto>(`/pet-ownership/transfers/${transferId}/accept`, { method: "POST" }),

  /** The recipient refuses. The registered owner stays as they are (ID-03). */
  declineTransfer: (transferId: string, reason?: string) =>
    apiFetch<PetOwnershipTransferDto>(`/pet-ownership/transfers/${transferId}/decline`, { method: "POST", body: { reason } }),

  /** The owner withdraws their own request. */
  cancelTransfer: (transferId: string) =>
    apiFetch<PetOwnershipTransferDto>(`/pet-ownership/transfers/${transferId}/cancel`, { method: "POST" }),

  /**
   * ID-03: "OptLife does not judge; the registered owner stays until an official
   * ruling or a written agreement." Recording a dispute never moves the pet.
   */
  raiseDispute: (transferId: string, reason?: string) =>
    apiFetch<PetOwnershipTransferDto>(`/pet-ownership/transfers/${transferId}/dispute`, { method: "POST", body: { reason } }),

  /** The read-only memory copies the caller kept after separating (ID-02). */
  listMemoryCopies: () => apiFetch<PetMemoryCopyDto[]>("/pet-ownership/memory-copies"),
};
