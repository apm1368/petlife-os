import { Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { AllergyStatus, ConditionStatus, MedicationStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";

export const HEALTH_SHARE_SECTIONS = ["ALLERGIES", "MEDICATIONS", "CONDITIONS", "VACCINATION"] as const;
export type HealthShareSection = (typeof HEALTH_SHARE_SECTIONS)[number];
const MAX_HOURS = 168;
const hash = (v: string) => createHash("sha256").update(v).digest("hex");

/**
 * G12 emergency health snapshot share: an explicit, short-lived (≤ 7 days) medical share the owner composes —
 * sections plus individual recent labs, visits and imaging that must belong to this pet. Separate from the public pet
 * card. Token stored as SHA-256 only, revocable, and every public read is logged (salted IP hash, short UA).
 * Documents are never included (files need authenticated delivery).
 */
@Injectable()
export class HealthShareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventsService,
  ) {}

  async create(petId: string, userId: string, dto: { sections: HealthShareSection[]; labResultIds?: string[]; clinicalVisitIds?: string[]; imagingStudyIds?: string[]; expiresInHours?: number; label?: string }) {
    const hours = dto.expiresInHours ?? 24;
    if (hours < 1 || hours > MAX_HOURS) throw new ValidationApiException({ field: "expiresInHours", reason: "1_TO_168" });
    const [labs, visits, imaging] = await Promise.all([
      this.ownedIds("labResult", petId, dto.labResultIds),
      this.ownedIds("clinicalVisit", petId, dto.clinicalVisitIds),
      this.ownedIds("imagingStudy", petId, dto.imagingStudyIds),
    ]);
    if (!dto.sections.length && !labs.length && !visits.length && !imaging.length) throw new ValidationApiException({ field: "sections", reason: "NOTHING_SELECTED" });
    const raw = randomBytes(24).toString("base64url");
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.healthShareLink.create({ data: { petId, tokenHash: hash(raw), tokenHint: raw.slice(-4), label: dto.label?.trim() || null, sections: dto.sections, labResultIds: labs, clinicalVisitIds: visits, imagingStudyIds: imaging, expiresAt: new Date(Date.now() + hours * 3600e3), createdByUserId: userId } });
      await this.events.publish("HealthShareCreated", { petId, shareId: created.id, actorUserId: userId, sections: dto.sections, records: labs.length + visits.length + imaging.length, expiresAt: created.expiresAt }, { tx, aggregateType: "Pet", aggregateId: petId });
      return created;
    });
    return { ...toDto(row, 0, null), token: raw, publicPath: `/health-share/${raw}` };
  }

  /** Every id must be a record of this pet; anything else is rejected (no cross-pet sharing). */
  private async ownedIds(model: "labResult" | "clinicalVisit" | "imagingStudy", petId: string, ids: string[] = []) {
    if (!ids.length) return [];
    const unique = [...new Set(ids)];
    const delegate = this.prisma[model] as unknown as { count(args: { where: { id: { in: string[] }; petId: string } }): Promise<number> };
    if ((await delegate.count({ where: { id: { in: unique }, petId } })) !== unique.length) throw new ValidationApiException({ field: `${model}Ids`, reason: "NOT_THIS_PET" });
    return unique;
  }

  async list(petId: string) {
    const rows = await this.prisma.healthShareLink.findMany({ where: { petId }, orderBy: { createdAt: "desc" }, take: 50, include: { _count: { select: { accesses: true } }, accesses: { orderBy: { accessedAt: "desc" }, take: 1, select: { accessedAt: true } } } });
    return rows.map((r) => toDto(r, r._count.accesses, r.accesses[0]?.accessedAt ?? null));
  }

  async accessLog(petId: string, shareId: string) {
    const link = await this.prisma.healthShareLink.findFirst({ where: { id: shareId, petId } });
    if (!link) throw new NotFoundApiException("HealthShare");
    const rows = await this.prisma.healthShareAccess.findMany({ where: { linkId: shareId }, orderBy: { accessedAt: "desc" }, take: 200 });
    return rows.map((a) => ({ accessedAt: a.accessedAt.toISOString(), userAgent: a.userAgent }));
  }

  async revoke(petId: string, shareId: string, userId: string) {
    const done = await this.prisma.healthShareLink.updateMany({ where: { id: shareId, petId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!done.count) throw new NotFoundApiException("HealthShare");
    await this.events.publish("HealthShareRevoked", { petId, shareId, actorUserId: userId }, { aggregateType: "Pet", aggregateId: petId });
    return { revoked: true };
  }

  /** Public read. Unknown, revoked and expired all look the same (404). Logged on every successful read. */
  async readPublic(rawToken: string, meta: { ip?: string; userAgent?: string }) {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(rawToken)) throw new NotFoundApiException("HealthShare");
    const link = await this.prisma.healthShareLink.findUnique({ where: { tokenHash: hash(rawToken) } });
    if (!link || link.revokedAt || link.expiresAt <= new Date()) throw new NotFoundApiException("HealthShare");
    await this.prisma.healthShareAccess.create({ data: { linkId: link.id, ipHash: meta.ip ? hash(`${link.id}:${meta.ip}`).slice(0, 32) : null, userAgent: meta.userAgent?.slice(0, 80) ?? null } });
    const has = (s: HealthShareSection) => link.sections.includes(s);
    const petId = link.petId;
    const [pet, allergies, medications, conditions, vaccination, labs, visits, imaging] = await Promise.all([
      this.prisma.pet.findUniqueOrThrow({ where: { id: petId }, select: { name: true, species: true, breed: true, sex: true, birthDate: true, approximateAgeMonths: true } }),
      has("ALLERGIES") ? this.prisma.allergy.findMany({ where: { petId, status: AllergyStatus.ACTIVE }, orderBy: { name: "asc" }, select: { name: true, severity: true, reaction: true } }) : null,
      has("MEDICATIONS") ? this.prisma.medication.findMany({ where: { petId, status: MedicationStatus.ACTIVE }, orderBy: { name: "asc" }, select: { name: true, dosage: true, unit: true, frequencyText: true } }) : null,
      has("CONDITIONS") ? this.prisma.condition.findMany({ where: { petId, status: ConditionStatus.ACTIVE }, orderBy: { name: "asc" }, select: { name: true } }) : null,
      has("VACCINATION") ? this.prisma.vaccinationSummary.findUnique({ where: { petId }, select: { status: true, lastKnownDate: true, nextDueDate: true } }) : null,
      link.labResultIds.length ? this.prisma.labResult.findMany({ where: { id: { in: link.labResultIds }, petId }, select: { testName: true, value: true, unit: true, referenceRangeLow: true, referenceRangeHigh: true, flag: true, resultDate: true } }) : [],
      link.clinicalVisitIds.length ? this.prisma.clinicalVisit.findMany({ where: { id: { in: link.clinicalVisitIds }, petId }, select: { startedAt: true, reasonForVisit: true, assessmentText: true, planText: true, providerOrganization: { select: { name: true } } } }) : [],
      link.imagingStudyIds.length ? this.prisma.imagingStudy.findMany({ where: { id: { in: link.imagingStudyIds }, petId }, select: { studyType: true, bodyRegion: true, report: true, performedAt: true } }) : [],
    ]);
    return {
      label: link.label,
      expiresAt: link.expiresAt.toISOString(),
      pet: { name: pet.name, species: pet.species, breed: pet.breed, sex: pet.sex, birthDate: pet.birthDate?.toISOString().slice(0, 10) ?? null, approximateAgeMonths: pet.approximateAgeMonths },
      allergies: allergies ?? undefined,
      activeMedications: medications?.map((m) => ({ name: m.name, dosage: m.dosage?.toString() ?? null, unit: m.unit, frequency: m.frequencyText })),
      activeConditions: conditions?.map((c) => c.name),
      vaccination: vaccination ? { status: vaccination.status, lastKnownDate: vaccination.lastKnownDate?.toISOString().slice(0, 10) ?? null, nextDueDate: vaccination.nextDueDate?.toISOString().slice(0, 10) ?? null } : undefined,
      labs: labs.map((l) => ({ ...l, referenceRangeLow: l.referenceRangeLow?.toString() ?? null, referenceRangeHigh: l.referenceRangeHigh?.toString() ?? null, resultDate: l.resultDate?.toISOString() ?? null })),
      visits: visits.map((v) => ({ startedAt: v.startedAt.toISOString(), reason: v.reasonForVisit, assessment: v.assessmentText, plan: v.planText, organization: v.providerOrganization.name })),
      imaging: imaging.map((i) => ({ ...i, performedAt: i.performedAt?.toISOString() ?? null })),
    };
  }
}

function toDto(r: { id: string; label: string | null; sections: string[]; labResultIds: string[]; clinicalVisitIds: string[]; imagingStudyIds: string[]; expiresAt: Date; revokedAt: Date | null; tokenHint: string; createdAt: Date }, accessCount: number, lastAccessedAt: Date | null) {
  const state = r.revokedAt ? "REVOKED" : r.expiresAt <= new Date() ? "EXPIRED" : "ACTIVE";
  return { id: r.id, state, label: r.label, sections: r.sections, labResultIds: r.labResultIds, clinicalVisitIds: r.clinicalVisitIds, imagingStudyIds: r.imagingStudyIds, tokenHint: r.tokenHint, expiresAt: r.expiresAt.toISOString(), revokedAt: r.revokedAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(), accessCount, lastAccessedAt: lastAccessedAt?.toISOString() ?? null };
}
