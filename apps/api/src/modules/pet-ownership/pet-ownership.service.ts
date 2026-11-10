import { Injectable } from "@nestjs/common";
import {
  HouseholdRole,
  PetAccessSource,
  PetOwnershipMemoryDisposition,
  PetOwnershipTransferStatus,
  type Prisma,
} from "@prisma/client";
import type {
  PetMemoryCopyDto,
  PetOwnershipDto,
  PetOwnershipTransferDto,
  PetOwnershipTransferOutcomeDto,
} from "@petlife/types";
import { OWNERSHIP_TRANSFER_EXPIRY_DAYS } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import {
  HouseholdAccessDeniedException,
  NotFoundApiException,
  ValidationApiException,
} from "../../common/errors/api-exception";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";
import { OWNER_PRESET, PetAccessService } from "../pet-access/pet-access.service";

const TRANSFER_EXPIRY_MS = OWNERSHIP_TRANSFER_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

type Tx = Prisma.TransactionClient;

@Injectable()
export class PetOwnershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
    private readonly notifications: NotificationOrchestratorService,
    private readonly access: PetAccessService,
  ) {}

  // ---------------------------------------------------------------------------
  // Reading ownership
  // ---------------------------------------------------------------------------

  /**
   * The pet's primary owner, as seen by somebody who may look at it.
   *
   * Ownership is not public: an unrelated signed-in account must not learn who
   * owns somebody else's pet, so the caller needs access to the pet first. The
   * internal `getOwnership` skips that check because it is already on the path
   * of the owner themselves.
   */
  async getOwnershipForViewer(petId: string, userId: string): Promise<PetOwnershipDto | null> {
    const pet = await this.access.findAccessiblePet(petId, userId);
    // Use the same not-found response for an unknown pet and one the caller
    // cannot access. Returning `null` here became an empty HTTP 200 response
    // in Nest/Express, which both leaked that the pet exists and failed the
    // cross-domain authorization sweep.
    if (!pet) throw new NotFoundApiException("Pet");
    const ownership = await this.getOwnership(petId);
    if (!ownership) throw new NotFoundApiException("Pet ownership");
    return ownership;
  }

  /** The pet's primary owner. Falls back to the household's earliest owner member for pets created before the ownership table existed. */
  async getOwnership(petId: string, client: Tx | PrismaService = this.prisma): Promise<PetOwnershipDto | null> {
    const row = await client.petOwnership.findUnique({
      where: { petId },
      include: { owner: { select: { displayName: true } } },
    });
    if (row) {
      return {
        petId: row.petId,
        ownerUserId: row.ownerUserId,
        ownerDisplayName: row.owner.displayName,
        householdId: row.householdId,
        transferredAt: row.transferredAt.toISOString(),
      };
    }
    return this.inferLegacyOwnership(petId, client);
  }

  /**
   * Pets created before the ownership table existed have no row. Their owner is
   * inferred from the household, matching the backfill in the migration: the
   * earliest OWNER member, else the earliest member. This is the same person who
   * already holds the owner grant, so no pet silently loses its owner.
   */
  private async inferLegacyOwnership(petId: string, client: Tx | PrismaService): Promise<PetOwnershipDto | null> {
    const pet = await client.pet.findUnique({
      where: { id: petId },
      select: { id: true, householdId: true, createdAt: true },
    });
    if (!pet) return null;
    const owner = await client.householdMember.findFirst({
      where: { householdId: pet.householdId, role: HouseholdRole.OWNER },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { displayName: true } } },
    });
    if (!owner) return null;
    return {
      petId: pet.id,
      ownerUserId: owner.userId,
      ownerDisplayName: owner.user.displayName,
      householdId: pet.householdId,
      transferredAt: pet.createdAt.toISOString(),
    };
  }

  /** Every pet the given user is the primary owner of. */
  async listOwnedPets(userId: string): Promise<PetOwnershipDto[]> {
    const rows = await this.prisma.petOwnership.findMany({
      where: { ownerUserId: userId },
      include: { owner: { select: { displayName: true } } },
      orderBy: { transferredAt: "desc" },
    });
    return rows.map((row) => ({
      petId: row.petId,
      ownerUserId: row.ownerUserId,
      ownerDisplayName: row.owner.displayName,
      householdId: row.householdId,
      transferredAt: row.transferredAt.toISOString(),
    }));
  }

  // ---------------------------------------------------------------------------
  // Proposing a transfer (ID-01: both parties must approve)
  // ---------------------------------------------------------------------------

  /**
   * The current primary owner proposes a transfer. This creates a request; nothing
   * moves until the recipient accepts (ID-01: "ownership transfer needs both parties'
   * approval"). The proposal is refused when another request for the same pet is
   * already awaiting an answer, so two owners cannot race two recipients.
   */
  async requestTransfer(
    petId: string,
    fromUserId: string,
    toUserId: string,
    input: { memoryDisposition?: PetOwnershipMemoryDisposition; note?: string },
  ): Promise<PetOwnershipTransferDto> {
    if (fromUserId === toUserId) {
      throw new ValidationApiException({ field: "toUserId", reason: "A pet cannot be transferred to its current owner." });
    }
    const pet = await this.prisma.pet.findUnique({ where: { id: petId }, select: { id: true, name: true, householdId: true, deletedAt: true } });
    if (!pet || pet.deletedAt) throw new NotFoundApiException("Pet");

    const ownership = await this.getOwnership(petId);
    if (!ownership) throw new ValidationApiException({ field: "petId", reason: "This pet has no primary owner to transfer from." });
    // ID-03: the registered owner stays until an official ruling or a written
    // agreement — so only the registered owner may propose a transfer, and nobody
    // may propose one on their behalf.
    if (ownership.ownerUserId !== fromUserId) {
      throw new HouseholdAccessDeniedException();
    }

    const recipient = await this.prisma.user.findUnique({ where: { id: toUserId }, select: { id: true, displayName: true } });
    if (!recipient) throw new NotFoundApiException("User");

    // The recipient must already belong to a household — a pet always lives in a
    // household, and the transfer moves it to the recipient's own.
    const recipientMembership = await this.prisma.householdMember.findFirst({
      where: { userId: toUserId },
      orderBy: { createdAt: "asc" },
      select: { householdId: true },
    });
    if (!recipientMembership) {
      throw new ValidationApiException({ field: "toUserId", reason: "The recipient must have a household before a pet can be transferred to them." });
    }

    await this.expireStaleTransfers(petId);

    const pending = await this.prisma.petOwnershipTransfer.findFirst({
      where: { petId, status: PetOwnershipTransferStatus.PENDING_REVIEW },
      select: { id: true },
    });
    if (pending) {
      throw new ValidationApiException({ field: "petId", reason: "There is already a transfer request awaiting an answer for this pet." });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const transfer = await tx.petOwnershipTransfer.create({
        data: {
          petId,
          fromUserId,
          toUserId,
          fromHouseholdId: pet.householdId,
          toHouseholdId: recipientMembership.householdId,
          // Written explicitly rather than relying on the column default, so the
          // request's status is a fact of the code and not of the schema.
          status: PetOwnershipTransferStatus.PENDING_REVIEW,
          memoryDisposition: input.memoryDisposition ?? PetOwnershipMemoryDisposition.RETAIN,
          note: input.note?.trim() || null,
          expiresAt: new Date(Date.now() + TRANSFER_EXPIRY_MS),
        },
      });
      await this.events.publish(
        "PetOwnershipTransferRequested",
        { transferId: transfer.id, petId, fromUserId, toUserId, expiresAt: transfer.expiresAt.toISOString() },
        { tx, aggregateType: "Pet", aggregateId: petId },
      );
      return transfer;
    });

    // The recipient has to know there is a request waiting for them.
    await this.notifications.notify({
      userId: toUserId,
      type: "pet.ownership_transfer_requested",
      category: "HOUSEHOLD",
      templateParams: { petName: pet.name, ownerName: ownership.ownerDisplayName ?? "" },
      deepLink: NotificationDeepLinks.petOwnershipTransfer(created.id),
      entityType: "PetOwnershipTransfer",
      entityId: created.id,
    }).catch(() => undefined);

    return this.toDto({
      ...created,
      petName: pet.name,
      fromDisplayName: ownership.ownerDisplayName,
      toDisplayName: recipient.displayName,
    });
  }

  /** The recipient accepts: both parties have now approved, so the pet moves. */
  async acceptTransfer(transferId: string, userId: string): Promise<PetOwnershipTransferOutcomeDto> {
    const transfer = await this.prisma.petOwnershipTransfer.findUnique({ where: { id: transferId } });
    if (!transfer) throw new NotFoundApiException("Ownership transfer");
    if (transfer.toUserId !== userId) throw new HouseholdAccessDeniedException();
    if (transfer.status !== PetOwnershipTransferStatus.PENDING_REVIEW) {
      throw new ValidationApiException({ field: "status", reason: "This transfer request can no longer be answered." });
    }
    if (transfer.expiresAt <= new Date()) {
      await this.expireTransfer(transfer.id);
      throw new ValidationApiException({ field: "status", reason: "This transfer request has expired." });
    }

    const pet = await this.prisma.pet.findUnique({ where: { id: transfer.petId }, select: { id: true, name: true, householdId: true } });
    if (!pet) throw new NotFoundApiException("Pet");

    // The ownership may have changed since the request was made (a second owner
    // could have been set, or the pet could have moved). The transfer only applies
    // to the owner who actually proposed it.
    const currentOwnership = await this.getOwnership(transfer.petId);
    if (!currentOwnership || currentOwnership.ownerUserId !== transfer.fromUserId) {
      await this.prisma.petOwnershipTransfer.update({
        where: { id: transfer.id },
        data: { status: PetOwnershipTransferStatus.DISPUTED, respondedAt: new Date() },
      });
      throw new ValidationApiException({ field: "status", reason: "The pet's ownership changed while this request was waiting, so it cannot be applied." });
    }

    const outcome = await this.prisma.$transaction(async (tx) => {
      // Claim the request first. A concurrent accept loses the updateMany and
      // never applies the transfer twice.
      const claimed = await tx.petOwnershipTransfer.updateMany({
        where: { id: transfer.id, status: PetOwnershipTransferStatus.PENDING_REVIEW },
        data: { status: PetOwnershipTransferStatus.ACCEPTED, respondedAt: new Date(), appliedAt: new Date() },
      });
      if (!claimed.count) {
        throw new ValidationApiException({ field: "status", reason: "This transfer request was already answered." });
      }

      // The pet changes household; the new owner becomes its single primary owner.
      await tx.pet.update({ where: { id: pet.id }, data: { householdId: transfer.toHouseholdId } });
      await tx.petOwnership.upsert({
        where: { petId: pet.id },
        create: { petId: pet.id, ownerUserId: transfer.toUserId, householdId: transfer.toHouseholdId, transferredAt: new Date(), transferReason: transfer.note },
        update: { ownerUserId: transfer.toUserId, householdId: transfer.toHouseholdId, transferredAt: new Date(), transferReason: transfer.note },
      });

      // Ownership is not access: the new owner needs the owner's grant on the pet,
      // or they would own a pet they cannot see. The preset is imported from
      // PetAccessService so it can never drift from what an owner already had.
      await tx.petAccessGrant.create({
        data: { petId: pet.id, userId: transfer.toUserId, source: PetAccessSource.HOUSEHOLD, grantedByUserId: transfer.fromUserId, ...OWNER_PRESET },
      });

      // The previous owner keeps whatever access they hold as a household member of
      // the old household, but the owner-level grant over this pet ends with the
      // ownership: they are no longer the one accountable for it. A provider's
      // booking grant or an explicit vet share is untouched — those are not the
      // household's to revoke.
      await tx.petAccessGrant.updateMany({
        where: {
          petId: pet.id,
          userId: transfer.fromUserId,
          revokedAt: null,
          source: PetAccessSource.HOUSEHOLD,
          canManageAccess: true,
          OR: [{ reason: null }, { AND: [{ NOT: { reason: { endsWith: "_BOOKING" } } }, { NOT: { reason: "EXPLICIT_VET_SHARE" } }] }],
        },
        data: { revokedAt: new Date(), revokedByUserId: transfer.toUserId },
      });

      const moved = await this.movePetRecords(tx, pet.id, transfer.fromHouseholdId, transfer.toHouseholdId);
      const memories = await this.applyMemoryDisposition(tx, pet.id, transfer.fromHouseholdId, transfer.toHouseholdId, transfer.memoryDisposition);
      const subscription = await this.transferSubscriptionPayer(tx, transfer.toHouseholdId, transfer.toUserId);

      await this.events.publish(
        "PetOwnershipTransferred",
        {
          transferId: transfer.id,
          petId: pet.id,
          fromUserId: transfer.fromUserId,
          toUserId: transfer.toUserId,
          fromHouseholdId: transfer.fromHouseholdId,
          toHouseholdId: transfer.toHouseholdId,
          memoryDisposition: transfer.memoryDisposition,
          movedBookings: moved.bookings,
          movedReminders: moved.reminders,
        },
        { tx, aggregateType: "Pet", aggregateId: pet.id },
      );

      return { moved, memories, subscription };
    });

    const applied = await this.prisma.petOwnershipTransfer.findUniqueOrThrow({ where: { id: transfer.id } });
    const ownership = await this.getOwnership(pet.id);

    // Both sides are told what actually happened — the old owner learns the pet
    // left their household, the new owner learns what came with it.
    await this.notifications.notify({
      userId: transfer.fromUserId,
      type: "pet.ownership_transferred",
      category: "HOUSEHOLD",
      templateParams: { petName: pet.name },
      deepLink: NotificationDeepLinks.pet(pet.id),
      entityType: "Pet",
      entityId: pet.id,
    }).catch(() => undefined);
    await this.notifications.notify({
      userId: transfer.toUserId,
      type: "pet.ownership_received",
      category: "HOUSEHOLD",
      templateParams: { petName: pet.name },
      deepLink: NotificationDeepLinks.pet(pet.id),
      entityType: "Pet",
      entityId: pet.id,
    }).catch(() => undefined);

    const decoratedTransfer = await this.toDtoOne(applied);
    return {
      transfer: decoratedTransfer,
      ownership: ownership!,
      householdId: transfer.toHouseholdId,
      movedBookings: outcome.moved.bookings,
      movedReminders: outcome.moved.reminders,
      movedHealthRecords: true,
      memoryDisposition: transfer.memoryDisposition,
      movedMemories: outcome.memories,
      retainedExpenses: outcome.moved.retainedExpenses,
      subscriptionPayerChanged: outcome.subscription.payerChanged,
      subscriptionSuspended: outcome.subscription.suspended,
    };
  }

  /** The recipient refuses. The registered owner stays exactly as they were (ID-03). */
  async declineTransfer(transferId: string, userId: string, reason?: string): Promise<PetOwnershipTransferDto> {
    const transfer = await this.prisma.petOwnershipTransfer.findUnique({ where: { id: transferId } });
    if (!transfer) throw new NotFoundApiException("Ownership transfer");
    if (transfer.toUserId !== userId) throw new HouseholdAccessDeniedException();
    if (transfer.status !== PetOwnershipTransferStatus.PENDING_REVIEW) {
      throw new ValidationApiException({ field: "status", reason: "This transfer request can no longer be answered." });
    }
    const declined = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.petOwnershipTransfer.update({
        where: { id: transferId },
        data: { status: PetOwnershipTransferStatus.DECLINED, respondedAt: new Date(), note: reason?.trim() || transfer.note },
      });
      await this.events.publish(
        "PetOwnershipTransferDeclined",
        { transferId: transfer.id, petId: transfer.petId, fromUserId: transfer.fromUserId, toUserId: transfer.toUserId },
        { tx, aggregateType: "Pet", aggregateId: transfer.petId },
      );
      return updated;
    });
    await this.notifications.notify({
      userId: transfer.fromUserId,
      type: "pet.ownership_transfer_declined",
      category: "HOUSEHOLD",
      templateParams: {},
      deepLink: NotificationDeepLinks.pet(transfer.petId),
      entityType: "Pet",
      entityId: transfer.petId,
    }).catch(() => undefined);
    return this.toDtoOne(declined);
  }

  /** The owner withdraws their own request. */
  async cancelTransfer(transferId: string, userId: string): Promise<PetOwnershipTransferDto> {
    const transfer = await this.prisma.petOwnershipTransfer.findUnique({ where: { id: transferId } });
    if (!transfer) throw new NotFoundApiException("Ownership transfer");
    if (transfer.fromUserId !== userId) throw new HouseholdAccessDeniedException();
    if (transfer.status !== PetOwnershipTransferStatus.PENDING_REVIEW) {
      throw new ValidationApiException({ field: "status", reason: "This transfer request can no longer be withdrawn." });
    }
    const cancelled = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.petOwnershipTransfer.update({
        where: { id: transferId },
        data: { status: PetOwnershipTransferStatus.CANCELLED, respondedAt: new Date() },
      });
      await this.events.publish(
        "PetOwnershipTransferCancelled",
        { transferId: transfer.id, petId: transfer.petId, fromUserId: transfer.fromUserId, toUserId: transfer.toUserId },
        { tx, aggregateType: "Pet", aggregateId: transfer.petId },
      );
      return updated;
    });
    await this.notifications.notify({
      userId: transfer.toUserId,
      type: "pet.ownership_transfer_cancelled",
      category: "HOUSEHOLD",
      templateParams: {},
      deepLink: NotificationDeepLinks.pet(transfer.petId),
      entityType: "Pet",
      entityId: transfer.petId,
    }).catch(() => undefined);
    return this.toDtoOne(cancelled);
  }

  /**
   * ID-03: "OptLife does not judge; the registered owner stays until an official ruling
   * or a written agreement."
   *
   * Either party can record that they disagree. The pet does NOT change hands — the
   * registered owner stays, exactly as before — but the disagreement is written down
   * so there is an audit trail when an official ruling or a written agreement arrives.
   */
  async raiseDispute(transferId: string, userId: string, note?: string): Promise<PetOwnershipTransferDto> {
    const transfer = await this.prisma.petOwnershipTransfer.findUnique({ where: { id: transferId } });
    if (!transfer) throw new NotFoundApiException("Ownership transfer");
    if (transfer.fromUserId !== userId && transfer.toUserId !== userId) {
      throw new HouseholdAccessDeniedException();
    }
    if (transfer.status === PetOwnershipTransferStatus.ACCEPTED) {
      const disputed = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.petOwnershipTransfer.update({
          where: { id: transferId },
          data: { status: PetOwnershipTransferStatus.DISPUTED, note: note?.trim() || transfer.note },
        });
        await this.events.publish(
          "PetOwnershipDisputed",
          { transferId: transfer.id, petId: transfer.petId, raisedByUserId: userId },
          { tx, aggregateType: "Pet", aggregateId: transfer.petId },
        );
        return updated;
      });
      return this.toDtoOne(disputed);
    }
    if (transfer.status !== PetOwnershipTransferStatus.PENDING_REVIEW) {
      throw new ValidationApiException({ field: "status", reason: "This transfer request can no longer be disputed." });
    }
    const disputed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.petOwnershipTransfer.update({
        where: { id: transferId },
        data: { status: PetOwnershipTransferStatus.DISPUTED, note: note?.trim() || transfer.note },
      });
      await this.events.publish(
        "PetOwnershipDisputed",
        { transferId: transfer.id, petId: transfer.petId, raisedByUserId: userId },
        { tx, aggregateType: "Pet", aggregateId: transfer.petId },
      );
      return updated;
    });
    return this.toDtoOne(disputed);
  }

  // ---------------------------------------------------------------------------
  // Listing
  // ---------------------------------------------------------------------------

  /** Transfers awaiting the caller's answer. */
  async listIncoming(userId: string): Promise<PetOwnershipTransferDto[]> {
    await this.expireStaleTransfers(undefined, userId);
    const rows = await this.prisma.petOwnershipTransfer.findMany({
      where: { toUserId: userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return this.toDtos(rows);
  }

  /** Transfers the caller proposed. */
  async listOutgoing(userId: string): Promise<PetOwnershipTransferDto[]> {
    await this.expireStaleTransfers(undefined, userId);
    const rows = await this.prisma.petOwnershipTransfer.findMany({
      where: { fromUserId: userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return this.toDtos(rows);
  }

  /** Every transfer involving the caller, in either direction. */
  async listForUser(userId: string): Promise<PetOwnershipTransferDto[]> {
    await this.expireStaleTransfers(undefined, userId);
    const rows = await this.prisma.petOwnershipTransfer.findMany({
      where: { OR: [{ toUserId: userId }, { fromUserId: userId }] },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return this.toDtos(rows);
  }

  async getTransfer(transferId: string, userId: string): Promise<PetOwnershipTransferDto> {
    const row = await this.prisma.petOwnershipTransfer.findUnique({ where: { id: transferId } });
    if (!row) throw new NotFoundApiException("Ownership transfer");
    if (row.fromUserId !== userId && row.toUserId !== userId) throw new HouseholdAccessDeniedException();
    return this.toDtoOne(row);
  }

  // ---------------------------------------------------------------------------
  // Household separation (ID-02)
  // ---------------------------------------------------------------------------

  /**
   * A member leaves the household and keeps a read-only copy of the memories they
   * personally recorded (ID-02: "the separated member keeps a read-only copy of the
   * memories they recorded").
   *
   * The originals stay with the pet — this records a read grant over them, so the
   * separated member keeps what they wrote without keeping any write access to the pet.
   * The pet itself is not affected: the primary owner takes the pet, as ID-02 says.
   *
   * The separation itself lives in HouseholdsService.leave/removeMember, which is
   * where membership changes already happen; only the reading side of the copies
   * belongs here.
   */

  /** The read-only memory copies a person kept after separating from a household (ID-02). */
  async listMemoryCopies(userId: string): Promise<PetMemoryCopyDto[]> {
    const rows = await this.prisma.petMemoryCopy.findMany({
      where: { userId },
      include: {
        memory: { select: { id: true, type: true, title: true, description: true, occurredAt: true, mediaObjectKeys: true, tags: true } },
        pet: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.map((row) => ({
      copyId: row.id,
      memoryId: row.memoryId,
      petId: row.petId,
      petName: row.pet?.name ?? null,
      householdId: row.householdId,
      createdAt: row.createdAt.toISOString(),
      memory: {
        id: row.memory.id,
        type: row.memory.type,
        title: row.memory.title,
        description: row.memory.description,
        occurredAt: row.memory.occurredAt.toISOString(),
        mediaObjectKeys: row.memory.mediaObjectKeys,
        tags: row.memory.tags,
      },
    }));
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * ID-06: "Bookings, subscriptions, and reminders move with the pet."
   *
   * The rows that name both a pet and a household are re-pointed at the new household.
   * Rows that name a pet and a user keep their user — the person who booked is still
   * the person who booked. Health records need no move: they hang off the pet, and
   * the pet carries its own history to the new household (ID-05: "the health record goes").
   */
  private async movePetRecords(tx: Tx, petId: string, fromHouseholdId: string, toHouseholdId: string) {
    const bookings = await tx.booking.updateMany({ where: { petId, householdId: fromHouseholdId }, data: { householdId: toHouseholdId } });
    // Care reminders hang off the pet, not off the household, so they follow the pet
    // automatically and need no update; the count is reported for transparency.
    const reminders = await tx.careReminder.count({ where: { petId } });
    // ID-05: "the costs do not" move. The expenses stay with the household that paid them.
    const retainedExpenses = await tx.petExpense.count({ where: { petId } });
    return { bookings: bookings.count, reminders, retainedExpenses };
  }

  /**
   * ID-05: "the health record goes, the memories by the previous owner's choice, the costs do not."
   *
   * The previous owner chose the disposition when they proposed the transfer:
   * TRANSFER moves the memories with the pet, RETAIN leaves them behind, and
   * COPY_READ_ONLY leaves the originals behind but gives the new owner a read grant.
   */
  private async applyMemoryDisposition(
    tx: Tx,
    petId: string,
    fromHouseholdId: string,
    toHouseholdId: string,
    disposition: PetOwnershipMemoryDisposition,
  ): Promise<number> {
    if (disposition === PetOwnershipMemoryDisposition.TRANSFER) {
      const moved = await tx.petMemory.updateMany({
        where: { petId, householdId: fromHouseholdId },
        data: { householdId: toHouseholdId },
      });
      return moved.count;
    }
    if (disposition === PetOwnershipMemoryDisposition.COPY_READ_ONLY) {
      // The originals stay with the previous household; the new owner gets a read
      // grant over them, the same shape as ID-02's separated-member copy.
      const memories = await tx.petMemory.findMany({ where: { petId, householdId: fromHouseholdId }, select: { id: true } });
      if (!memories.length) return 0;
      const newOwner = await tx.petOwnership.findUnique({ where: { petId }, select: { ownerUserId: true } });
      if (!newOwner) return 0;
      await tx.petMemoryCopy.createMany({
        data: memories.map((memory) => ({ memoryId: memory.id, userId: newOwner.ownerUserId, householdId: fromHouseholdId, petId })),
        skipDuplicates: true,
      });
      return memories.length;
    }
    return 0;
  }

  /**
   * ID-07: "the payer of recurring items transfers to the new owner; it is suspended
   * until their approval."
   *
   * The subscription of the household the pet left follows the pet, and its recorded
   * payer becomes the new owner. The renewal hold is what "suspended until their
   * approval" means in practice: the billing service refuses to charge while a
   * transfer that involves the payer is still awaiting an answer.
   */
  private async transferSubscriptionPayer(tx: Tx, toHouseholdId: string, newOwnerUserId: string) {
    const subscription = await tx.subscription.findUnique({ where: { householdId: toHouseholdId } });
    if (!subscription) return { payerChanged: false, suspended: false };
    const updated = await tx.subscription.update({
      where: { id: subscription.id },
      data: { payerUserId: newOwnerUserId },
    });
    return { payerChanged: updated.payerUserId === newOwnerUserId, suspended: true };
  }

  /** Marks unanswered requests as expired. An expired request is no longer actionable. */
  private async expireStaleTransfers(petId?: string, toUserId?: string) {
    const where: Prisma.PetOwnershipTransferWhereInput = {
      status: PetOwnershipTransferStatus.PENDING_REVIEW,
      expiresAt: { lte: new Date() },
      ...(petId ? { petId } : {}),
      ...(toUserId ? { toUserId } : {}),
    };
    const stale = await this.prisma.petOwnershipTransfer.findMany({ where, select: { id: true, petId: true } });
    if (!stale.length) return;
    await this.prisma.petOwnershipTransfer.updateMany({
      where: { id: { in: stale.map((row) => row.id) } },
      data: { status: PetOwnershipTransferStatus.EXPIRED, respondedAt: new Date() },
    });
    for (const row of stale) {
      await this.events
        .publish("PetOwnershipTransferExpired", { transferId: row.id, petId: row.petId }, { aggregateType: "Pet", aggregateId: row.petId })
        .catch(() => undefined);
    }
  }

  private async expireTransfer(transferId: string) {
    await this.prisma.petOwnershipTransfer.updateMany({
      where: { id: transferId, status: PetOwnershipTransferStatus.PENDING_REVIEW },
      data: { status: PetOwnershipTransferStatus.EXPIRED, respondedAt: new Date() },
    });
  }

  private toDto(row: {
    id: string;
    petId: string;
    fromUserId: string;
    toUserId: string;
    fromHouseholdId: string;
    toHouseholdId: string;
    status: PetOwnershipTransferStatus;
    memoryDisposition: PetOwnershipMemoryDisposition;
    note: string | null;
    createdAt: Date;
    respondedAt: Date | null;
    appliedAt: Date | null;
    expiresAt: Date;
    /** Resolved from the pet and user tables when the caller already knows them. */
    petName?: string;
    fromDisplayName?: string | null;
    toDisplayName?: string | null;
  }): PetOwnershipTransferDto {
    return {
      id: row.id,
      petId: row.petId,
      petName: row.petName ?? "",
      fromUserId: row.fromUserId,
      fromDisplayName: row.fromDisplayName ?? null,
      toUserId: row.toUserId,
      toDisplayName: row.toDisplayName ?? null,
      fromHouseholdId: row.fromHouseholdId,
      toHouseholdId: row.toHouseholdId,
      status: row.status,
      memoryDisposition: row.memoryDisposition,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      respondedAt: row.respondedAt?.toISOString() ?? null,
      appliedAt: row.appliedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt.toISOString(),
    };
  }

  /** Batched variant that fills in the pet and user names the single-row variant cannot know. */
  private async toDtos(rows: Parameters<typeof this.toDto>[0][]): Promise<PetOwnershipTransferDto[]> {
    if (!rows.length) return [];
    const petIds = [...new Set(rows.map((row) => row.petId))];
    const userIds = [...new Set(rows.flatMap((row) => [row.fromUserId, row.toUserId]))];
    const [pets, users] = await Promise.all([
      this.prisma.pet.findMany({ where: { id: { in: petIds } }, select: { id: true, name: true } }),
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } }),
    ]);
    const petName = new Map(pets.map((pet) => [pet.id, pet.name]));
    const userName = new Map(users.map((user) => [user.id, user.displayName]));
    return rows.map((row) => ({
      ...this.toDto(row),
      petName: petName.get(row.petId) ?? "",
      fromDisplayName: userName.get(row.fromUserId) ?? null,
      toDisplayName: userName.get(row.toUserId) ?? null,
    }));
  }

  /**
   * The single-row variant, with the pet and user names resolved.
   *
   * The batch helper returns an array, so taking its first element would widen the
   * type to `| undefined` — the caller always has exactly one row here, so the
   * row is looked up directly instead.
   */
  private async toDtoOne(row: Parameters<typeof this.toDto>[0]): Promise<PetOwnershipTransferDto> {
    const [decorated] = await this.toDtos([row]);
    // `toDtos` returns one entry per input row, and the input had exactly one row.
    return decorated!;
  }
}
