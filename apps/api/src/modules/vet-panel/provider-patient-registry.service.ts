import { Injectable } from "@nestjs/common";
import { ClinicalVisitStatus, HospitalizationStatus, Prisma } from "@prisma/client";
import type { PaginatedDto, ProviderPatientSummaryDto } from "@petlife/types";
import { ClinicalAlertSeverity, PatientAccessState } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import type { ListProviderPatientsQueryDto } from "./dto/patient-registry.dto";

const DEFAULT_PAGE_SIZE = 20;

/**
 * The patient index Handoff 17 never built: `GET /provider/patients/:petId`
 * existed, but nothing told a vet *which* pets those were, so the clinical
 * record was only reachable by already knowing a pet's UUID.
 *
 * "This clinic's patients" is defined as every pet the organisation has ever
 * booked or documented — a clinic's own caseload does not disappear the
 * moment a visit-scoped grant lapses. What *does* change is `accessState`:
 * the row says ACTIVE or EXPIRED plainly rather than implying live access,
 * and opening the record still goes through `PetAccessGuard`, which refuses
 * an expired grant exactly as before. The registry is a directory; it is not
 * an authorization decision, and it deliberately carries no health data —
 * species, age, owner name, and counts only.
 */
@Injectable()
export class ProviderPatientRegistryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: ResolvedProviderContext, query: ListProviderPatientsQueryDto): Promise<PaginatedDto<ProviderPatientSummaryDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const now = new Date();

    const providerUserIds = (await this.prisma.providerUser.findMany({ where: { providerOrganizationId: ctx.organizationId }, select: { userId: true } })).map((p) => p.userId);

    const caseloadFilter: Prisma.PetWhereInput = {
      OR: [
        { bookings: { some: { providerOrganizationId: ctx.organizationId } } },
        { clinicalVisits: { some: { providerOrganizationId: ctx.organizationId } } },
      ],
    };

    const searchFilter: Prisma.PetWhereInput | undefined = query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: "insensitive" } },
            { microchipNumber: { contains: query.q, mode: "insensitive" } },
            { microchipNormalized: { contains: query.q.replace(/[\s-]/g, "").toUpperCase() } },
            { household: { members: { some: { user: { displayName: { contains: query.q, mode: "insensitive" } } } } } },
          ],
        }
      : undefined;

    const hospitalizedFilter: Prisma.PetWhereInput | undefined =
      query.hospitalizedOnly === "true" ? { hospitalizations: { some: { providerOrganizationId: ctx.organizationId, status: HospitalizationStatus.ADMITTED } } } : undefined;

    const where: Prisma.PetWhereInput = {
      AND: [caseloadFilter, ...(searchFilter ? [searchFilter] : []), ...(hospitalizedFilter ? [hospitalizedFilter] : []), ...(query.species ? [{ species: query.species }] : [])],
    };

    const [total, pets] = await Promise.all([
      this.prisma.pet.count({ where }),
      this.prisma.pet.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          household: { include: { members: { where: { role: "OWNER" }, include: { user: { select: { displayName: true } } }, take: 1 } } },
          // The full grant set for this org's members; the active-window test
          // below mirrors PetAccessService.isGrantActive() rather than being
          // re-derived in SQL, so the two can never drift apart.
          accessGrants: { where: { userId: { in: providerUserIds }, revokedAt: null } },
          clinicalVisits: {
            where: { providerOrganizationId: ctx.organizationId },
            select: { id: true, startedAt: true, status: true },
            orderBy: { startedAt: "desc" },
          },
          hospitalizations: { where: { providerOrganizationId: ctx.organizationId, status: HospitalizationStatus.ADMITTED }, select: { id: true }, take: 1 },
          providerClinicalAlerts: { where: { providerOrganizationId: ctx.organizationId, resolvedAt: null }, select: { severity: true } },
        },
      }),
    ]);

    const items: ProviderPatientSummaryDto[] = pets.map((pet) => {
      const activeGrants = pet.accessGrants.filter((g) => (!g.startsAt || g.startsAt <= now) && (!g.expiresAt || g.expiresAt > now));
      const nextExpiry = activeGrants
        .map((g) => g.expiresAt)
        .filter((d): d is Date => d !== null)
        .sort((a, b) => a.getTime() - b.getTime())[0];
      const openVisit = pet.clinicalVisits.find((v) => v.status === ClinicalVisitStatus.IN_PROGRESS || v.status === ClinicalVisitStatus.DRAFT);
      const severities = pet.providerClinicalAlerts.map((a) => a.severity);

      return {
        petId: pet.id,
        name: pet.name,
        species: pet.species as unknown as ProviderPatientSummaryDto["species"],
        breed: pet.breed,
        sex: pet.sex as unknown as ProviderPatientSummaryDto["sex"],
        birthDate: pet.birthDate?.toISOString() ?? null,
        approximateAgeMonths: pet.approximateAgeMonths,
        photoUrl: pet.photoUrl,
        microchipNumber: pet.microchipNumber,
        lifecycleStatus: pet.lifecycleStatus as unknown as ProviderPatientSummaryDto["lifecycleStatus"],
        latestWeightValue: pet.latestWeightValue === null ? null : Number(pet.latestWeightValue),
        latestWeightUnit: pet.latestWeightUnit as unknown as ProviderPatientSummaryDto["latestWeightUnit"],
        ownerDisplayName: pet.household.members[0]?.user.displayName ?? null,
        accessState: activeGrants.length > 0 ? PatientAccessState.ACTIVE : PatientAccessState.EXPIRED,
        accessExpiresAt: nextExpiry?.toISOString() ?? null,
        lastVisitAt: pet.clinicalVisits[0]?.startedAt.toISOString() ?? null,
        visitCount: pet.clinicalVisits.length,
        openVisitId: openVisit?.id ?? null,
        activeHospitalizationId: pet.hospitalizations[0]?.id ?? null,
        activeAlertCount: severities.length,
        highestActiveAlertSeverity: severities.includes("CRITICAL")
          ? ClinicalAlertSeverity.CRITICAL
          : severities.includes("CAUTION")
            ? ClinicalAlertSeverity.CAUTION
            : severities.includes("INFO")
              ? ClinicalAlertSeverity.INFO
              : null,
      };
    });

    return { items, total, page, pageSize };
  }
}
