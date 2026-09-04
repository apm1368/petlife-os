import { Injectable } from "@nestjs/common";
import { PetLifecycleStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { InvalidPetLifecycleTransitionException } from "../../common/errors/api-exception";

export type PetLifecycleTransitionSource = "LOST_PET_INCIDENT" | "MANUAL_MEMORIAL";

/**
 * The one place Pet.lifecycleStatus is ever written (spec: "Do not directly
 * mutate Pet.lifecycle from arbitrary controllers... this must happen
 * through explicit domain logic"). Every transition is recorded as a
 * PetLifecycleTransition row — an append-only audit trail, never inferred
 * automatically from health data (spec: "Do not automatically infer death
 * from health data").
 *
 * ALLOWED_TRANSITIONS deliberately excludes TEMPORARILY_TRANSFERRED (no H18
 * flow drives it) and treats MEMORIAL as terminal (no "un-memorialize" this
 * phase) — the same "narrow, explicit vocabulary, not every theoretically
 * possible move" discipline SubscriptionStatus's own ALLOWED_TRANSITIONS
 * table established in Handoff 16.
 */
const ALLOWED_TRANSITIONS: Record<PetLifecycleStatus, PetLifecycleStatus[]> = {
  [PetLifecycleStatus.ACTIVE]: [PetLifecycleStatus.LOST, PetLifecycleStatus.DECEASED],
  [PetLifecycleStatus.LOST]: [PetLifecycleStatus.ACTIVE, PetLifecycleStatus.DECEASED],
  [PetLifecycleStatus.TEMPORARILY_TRANSFERRED]: [],
  [PetLifecycleStatus.DECEASED]: [PetLifecycleStatus.MEMORIAL],
  [PetLifecycleStatus.MEMORIAL]: [],
};

@Injectable()
export class PetLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  /**
   * Must be called inside the caller's own transaction (tx) so the
   * lifecycle change commits atomically with whatever domain action drove
   * it (e.g. LostPetIncidentService.open()/reunite()). Throws if the move
   * isn't in ALLOWED_TRANSITIONS — never a silent no-op or a permissive
   * bare update.
   */
  async transition(
    tx: Prisma.TransactionClient,
    petId: string,
    toStatus: PetLifecycleStatus,
    input: { sourceType: PetLifecycleTransitionSource; sourceId?: string; reason?: string; actorUserId?: string },
  ): Promise<void> {
    const pet = await tx.pet.findUniqueOrThrow({ where: { id: petId } });
    const fromStatus = pet.lifecycleStatus;
    if (fromStatus === toStatus) return;
    if (!ALLOWED_TRANSITIONS[fromStatus].includes(toStatus)) {
      throw new InvalidPetLifecycleTransitionException({ petId, fromStatus, toStatus });
    }

    await tx.pet.update({ where: { id: petId }, data: { lifecycleStatus: toStatus } });
    await tx.petLifecycleTransition.create({
      data: {
        petId,
        fromStatus,
        toStatus,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        reason: input.reason,
        actorUserId: input.actorUserId,
      },
    });
    await this.events.publish("PetLifecycleTransitioned", { petId, fromStatus, toStatus, sourceType: input.sourceType }, { tx, aggregateType: "Pet", aggregateId: petId });
  }

  async listTransitions(petId: string) {
    return this.prisma.petLifecycleTransition.findMany({ where: { petId }, orderBy: { createdAt: "desc" } });
  }
}
