import { Injectable } from "@nestjs/common";
import { SetupStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import type { UpdateCareProfileDto } from "./dto/update-care-profile.dto";

const TEXT_FIELDS = [
  "temperamentText",
  "aroundPeopleText",
  "aroundAnimalsText",
  "leashBehaviorText",
  "handlingSensitivityText",
  "feedingRoutineText",
  "toiletRoutineText",
  "separationBehaviorText",
  "specialInstructionsText",
] as const;

/** NOT_STARTED = nothing filled in; COMPLETE = every section has text; otherwise PARTIAL. */
function computeStatus(merged: Record<string, unknown>): SetupStatus {
  const filled = TEXT_FIELDS.filter((field) => merged[field] !== null && merged[field] !== undefined);
  if (filled.length === 0) return SetupStatus.NOT_STARTED;
  if (filled.length === TEXT_FIELDS.length) return SetupStatus.COMPLETE;
  return SetupStatus.PARTIAL;
}

@Injectable()
export class CareProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async get(petId: string) {
    const profile = await this.prisma.careProfile.findUnique({ where: { petId } });
    if (profile) return profile;
    return {
      petId,
      status: SetupStatus.NOT_STARTED,
      createdAt: null,
      updatedAt: null,
      ...Object.fromEntries(TEXT_FIELDS.map((field) => [field, null])),
    };
  }

  /** PUT semantics: always a full replace of the one care profile row per pet. */
  async upsert(petId: string, dto: UpdateCareProfileDto) {
    const existing = await this.prisma.careProfile.findUnique({ where: { petId } });
    const merged: Record<string, unknown> = { ...existing, ...dto };
    const status = computeStatus(merged);

    const profile = await this.prisma.careProfile.upsert({
      where: { petId },
      update: { ...dto, status },
      create: { petId, ...dto, status },
    });

    await this.events.publish("CareProfileUpdated", { petId }, { aggregateType: "Pet", aggregateId: petId });
    return profile;
  }
}
