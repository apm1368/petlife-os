import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

/**
 * Metering (spec: "only meter meaningful limited resources... be
 * conservative"). Every metered key this phase is DERIVED, never
 * counter-based — a household's pet count and member count are both
 * durable, low-volume, source-of-truth-backed numbers (spec: "for durable
 * resources like number of pets, prefer deriving from source-of-truth rows
 * where practical"), so there is no `SubscriptionUsageCounter`/
 * `SubscriptionUsageEvent` table this phase: counting `Pet`/`HouseholdMember`
 * rows directly can never drift from reality the way a separately
 * maintained counter could. A high-volume, event-shaped metered resource
 * would justify a counter table in a future handoff; none exists in H16's
 * actual scope.
 */
@Injectable()
export class UsageService {
  constructor(private readonly prisma: PrismaService) {}

  private static readonly DERIVERS: Record<string, (prisma: PrismaService, householdId: string) => Promise<number>> = {
    "pets.max": (prisma, householdId) => prisma.pet.count({ where: { householdId, deletedAt: null } }),
    "household.members.max": (prisma, householdId) => prisma.householdMember.count({ where: { householdId } }),
    // Handoff 17: counts every non-voided document regardless of source
    // (owner-uploaded or provider-uploaded) — the limit itself is only ever
    // asserted on the OWNER upload path (see MedicalDocumentService.create),
    // never on a provider's clinical upload, so a household can never be
    // blocked from receiving new provider-issued records by its own plan.
    "health.documents.max": (prisma, householdId) => prisma.medicalDocument.count({ where: { householdId, voidedAt: null } }),
    // Convenience-only (spec: "richer organization, expanded history" —
    // never safety-critical) — owner-recorded observations are never
    // required for any clinical workflow.
    "health.observations.max": (prisma, householdId) => prisma.petObservation.count({ where: { pet: { householdId } } }),
  };

  /** Every known LIMIT-type entitlement key this codebase actually meters. */
  static isMetered(key: string): boolean {
    return key in UsageService.DERIVERS;
  }

  async getUsage(householdId: string, key: string): Promise<number> {
    const derive = UsageService.DERIVERS[key];
    if (!derive) return 0;
    return derive(this.prisma, householdId);
  }
}
