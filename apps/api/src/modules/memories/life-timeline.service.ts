import { Injectable } from "@nestjs/common";
import { LifeTimelineEntryType, type LifeTimelineEntryDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { HealthTimelineService } from "../clinical-health/health-timeline.service";

/**
 * spec: "Life Timeline should be broader than Health Timeline... Do not
 * merge Health Timeline storage directly into Memories. Build an
 * aggregation layer." Deliberately NOT a stored table — the exact "derived,
 * never duplicated" convention HealthTimelineService/UsageService already
 * established, re-derived from source-of-truth rows on every call:
 * PetMemory, the wrapped HealthTimelineEntryDto list, LostPetIncident
 * reunification, Pet's own join date, and PetLifecycleTransition.
 */
@Injectable()
export class LifeTimelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthTimeline: HealthTimelineService,
  ) {}

  async list(petId: string, includeHealth: boolean, limit = 200): Promise<LifeTimelineEntryDto[]> {
    const [pet, memories, reunitedIncidents, lifecycleTransitions, healthEntries] = await Promise.all([
      this.prisma.pet.findUniqueOrThrow({ where: { id: petId }, select: { createdAt: true } }),
      this.prisma.petMemory.findMany({ where: { petId } }),
      this.prisma.lostPetIncident.findMany({ where: { petId, reunitedAt: { not: null } } }),
      this.prisma.petLifecycleTransition.findMany({ where: { petId } }),
      includeHealth ? this.healthTimeline.list(petId, limit) : Promise.resolve([]),
    ]);

    const entries: LifeTimelineEntryDto[] = [];

    entries.push({ type: LifeTimelineEntryType.ADOPTION, occurredAt: pet.createdAt.toISOString(), summary: "Joined the household", recordId: petId, recordType: "PET_JOINED" });

    for (const memory of memories) {
      entries.push({ type: LifeTimelineEntryType.MEMORY, occurredAt: memory.occurredAt.toISOString(), summary: memory.title, recordId: memory.id, recordType: memory.type });
    }

    for (const incident of reunitedIncidents) {
      entries.push({ type: LifeTimelineEntryType.LOST_PET_RESOLVED, occurredAt: incident.reunitedAt!.toISOString(), summary: "Reunited after being lost", recordId: incident.id, recordType: "LOST_PET_INCIDENT" });
    }

    for (const transition of lifecycleTransitions) {
      entries.push({ type: LifeTimelineEntryType.LIFECYCLE, occurredAt: transition.createdAt.toISOString(), summary: `Status changed to ${transition.toStatus}`, recordId: transition.id, recordType: "PET_LIFECYCLE_TRANSITION" });
    }

    for (const health of healthEntries) {
      entries.push({ type: LifeTimelineEntryType.HEALTH, occurredAt: health.occurredAt, summary: health.summary, recordId: health.recordId, recordType: health.recordType });
    }

    return entries.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).slice(0, limit);
  }
}
