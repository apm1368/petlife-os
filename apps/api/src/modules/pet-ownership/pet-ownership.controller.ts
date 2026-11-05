import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { IsEnum, IsOptional, IsString, IsUUID, Length } from "class-validator";
import { PetOwnershipMemoryDisposition } from "@prisma/client";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import type { SessionUser } from "../../common/session/session.service";
import { PetOwnershipService } from "./pet-ownership.service";

class RequestTransferDto {
  @IsUUID()
  toUserId!: string;

  /**
   * What happens to the pet's memories (ID-05: "the memories by the previous owner's
   * choice"). The default keeps them with the previous household.
   */
  @IsOptional()
  @IsEnum(PetOwnershipMemoryDisposition)
  memoryDisposition?: PetOwnershipMemoryDisposition;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;
}

class TransferResponseDto {
  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;
}

@Controller("pet-ownership")
@UseGuards(SessionAuthGuard)
export class PetOwnershipController {
  constructor(private readonly ownership: PetOwnershipService) {}

  /** The pets the caller is the primary owner of (ID-01). */
  @Get("pets")
  listOwned(@CurrentUser() user: SessionUser) {
    return this.ownership.listOwnedPets(user.id);
  }

  /** The primary owner of one pet. */
  @Get("pets/:petId")
  getOwnership(@Param("petId", ParseUUIDPipe) petId: string) {
    return this.ownership.getOwnership(petId);
  }

  /** Transfers waiting for the caller's answer. */
  @Get("transfers/incoming")
  listIncoming(@CurrentUser() user: SessionUser) {
    return this.ownership.listIncoming(user.id);
  }

  /** Transfers the caller proposed. */
  @Get("transfers/outgoing")
  listOutgoing(@CurrentUser() user: SessionUser) {
    return this.ownership.listOutgoing(user.id);
  }

  /** Every transfer involving the caller. */
  @Get("transfers")
  listAll(@CurrentUser() user: SessionUser) {
    return this.ownership.listForUser(user.id);
  }

  @Get("transfers/:transferId")
  getTransfer(@Param("transferId", ParseUUIDPipe) transferId: string, @CurrentUser() user: SessionUser) {
    return this.ownership.getTransfer(transferId, user.id);
  }

  /**
   * The current owner proposes a transfer. Nothing moves until the recipient accepts
   * (ID-01: "ownership transfer needs both parties' approval").
   */
  @Post("pets/:petId/transfers")
  request(@Param("petId", ParseUUIDPipe) petId: string, @CurrentUser() user: SessionUser, @Body() dto: RequestTransferDto) {
    return this.ownership.requestTransfer(petId, user.id, dto.toUserId, dto);
  }

  /** The recipient accepts: both parties have approved, so the pet moves. */
  @Post("transfers/:transferId/accept")
  accept(@Param("transferId", ParseUUIDPipe) transferId: string, @CurrentUser() user: SessionUser) {
    return this.ownership.acceptTransfer(transferId, user.id);
  }

  /** The recipient refuses. The registered owner stays as they are (ID-03). */
  @Post("transfers/:transferId/decline")
  decline(@Param("transferId", ParseUUIDPipe) transferId: string, @CurrentUser() user: SessionUser, @Body() dto: TransferResponseDto) {
    return this.ownership.declineTransfer(transferId, user.id, dto.reason);
  }

  /** The owner withdraws their own request. */
  @Post("transfers/:transferId/cancel")
  cancel(@Param("transferId", ParseUUIDPipe) transferId: string, @CurrentUser() user: SessionUser) {
    return this.ownership.cancelTransfer(transferId, user.id);
  }

  /**
   * ID-03: "OptLife does not judge; the registered owner stays until an official ruling
   * or a written agreement." Recording a dispute never moves the pet.
   */
  @Post("transfers/:transferId/dispute")
  dispute(@Param("transferId", ParseUUIDPipe) transferId: string, @CurrentUser() user: SessionUser, @Body() dto: TransferResponseDto) {
    return this.ownership.raiseDispute(transferId, user.id, dto.reason);
  }

  /** The read-only memory copies the caller kept after separating from a household (ID-02). */
  @Get("memory-copies")
  listMemoryCopies(@CurrentUser() user: SessionUser) {
    return this.ownership.listMemoryCopies(user.id);
  }
}
