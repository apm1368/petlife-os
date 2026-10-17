import { Injectable } from "@nestjs/common";
import { AllergyStatus, ConditionStatus, MedicationStatus } from "@prisma/client";
import { HealthTimelineEntryType, type HealthTimelineEntryDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ValidationApiException } from "../../common/errors/api-exception";
import { HealthTimelineService } from "../clinical-health/health-timeline.service";

/** Filterable record groups of the canonical health feed. */
export const HEALTH_FEED_TYPES = ["VISIT", "CONDITION", "ALLERGY", "VACCINATION", "MEDICATION", "LAB", "IMAGING", "WEIGHT", "DOCUMENT", "OTHER"] as const;
export type HealthFeedType = (typeof HEALTH_FEED_TYPES)[number];
/** Normalised provenance: who stands behind a record. */
export const HEALTH_SOURCES = ["OWNER", "CLINIC", "VET", "IMPORT", "SYSTEM"] as const;
export type HealthSource = (typeof HEALTH_SOURCES)[number];

const GROUP: Partial<Record<HealthTimelineEntryType, HealthFeedType>> = {
  [HealthTimelineEntryType.CLINICAL_VISIT]: "VISIT",
  [HealthTimelineEntryType.CONDITION_RECORDED]: "CONDITION",
  [HealthTimelineEntryType.ALLERGY_RECORDED]: "ALLERGY",
  [HealthTimelineEntryType.VACCINATION]: "VACCINATION",
  [HealthTimelineEntryType.MEDICATION_STARTED]: "MEDICATION",
  [HealthTimelineEntryType.MEDICATION_STOPPED]: "MEDICATION",
  [HealthTimelineEntryType.LAB_RESULT]: "LAB",
  [HealthTimelineEntryType.IMAGING_STUDY]: "IMAGING",
  [HealthTimelineEntryType.DOCUMENT_UPLOADED]: "DOCUMENT",
};
const LINK: Partial<Record<string, (petId: string, id: string) => string>> = {
  CLINICAL_VISIT: (p, id) => `/pets/${p}/health/visits/${id}`,
  CONDITION_RECORDED: (p, id) => `/pets/${p}/health/conditions/${id}`,
  ALLERGY_RECORDED: (p, id) => `/pets/${p}/health/allergies/${id}`,
  VACCINATION: (p) => `/pets/${p}/health/vaccination`,
  MEDICATION_STARTED: (p, id) => `/pets/${p}/health/medications/${id}`,
  MEDICATION_STOPPED: (p, id) => `/pets/${p}/health/medications/${id}`,
  LAB_RESULT: (p, id) => `/pets/${p}/health/labs/${id}`,
  IMAGING_STUDY: (p, id) => `/pets/${p}/health/imaging/${id}`,
  DOCUMENT_UPLOADED: (p, id) => `/pets/${p}/health/documents/${id}`,
  REFERRAL: (p, id) => `/pets/${p}/health/referrals/${id}`,
  DENTAL_RECORD: (p, id) => `/pets/${p}/health/dental/${id}`,
  NUTRITION_PLAN: (p, id) => `/pets/${p}/health/nutrition/clinical/${id}`,
  REHAB_SESSION: (p) => `/pets/${p}/health/rehab`,
  OBSERVATION: (p, id) => `/pets/${p}/health/observations/${id}`,
  WEIGHT: (p) => `/pets/${p}/health/advanced/vitals`,
};

export interface HealthFeedItem {
  id: string;
  type: HealthFeedType;
  recordType: string;
  recordId: string;
  occurredAt: string;
  recordedAt: string | null;
  source: HealthSource;
  author: { providerUserId: string | null; displayTitle: string | null; userId: string | null };
  organization: { id: string; name: string | null } | null;
  summary: string;
  deepLink: string | null;
}

/** OWNER/HOUSEHOLD → OWNER; a provider record names a vet when a provider user authored it, else the clinic. */
export function normaliseSource(sourceType: string, providerUserId: string | null): HealthSource {
  if (sourceType === "OWNER" || sourceType === "HOUSEHOLD_MEMBER") return "OWNER";
  if (sourceType === "IMPORTED_DOCUMENT") return "IMPORT";
  if (sourceType === "SYSTEM") return "SYSTEM";
  return providerUserId ? "VET" : "CLINIC";
}

/**
 * G12 health core: a deterministic snapshot of what is true now, and one canonical, filterable, cursor-paginated
 * feed over every health record (the existing derived timeline plus clinic-recorded weights). No interpretation: a
 * lab is "abnormal" only when its stored flag says so.
 */
@Injectable()
export class HealthDepthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: HealthTimelineService,
  ) {}

  async snapshot(petId: string, now = new Date()) {
    const [pet, conditions, medications, allergies, vaccination, vaccineCare, visits, labs, imaging, documentsCount, vitals] = await Promise.all([
      this.prisma.pet.findUniqueOrThrow({ where: { id: petId }, select: { latestWeightValue: true, latestWeightUnit: true, updatedAt: true } }),
      this.prisma.condition.findMany({ where: { petId, status: ConditionStatus.ACTIVE }, orderBy: { name: "asc" }, select: { id: true, name: true, firstRecordedAt: true, sourceType: true } }),
      this.prisma.medication.findMany({ where: { petId, status: MedicationStatus.ACTIVE }, orderBy: { name: "asc" }, select: { id: true, name: true, dosage: true, unit: true, frequencyText: true, startDate: true, sourceType: true } }),
      this.prisma.allergy.findMany({ where: { petId, status: AllergyStatus.ACTIVE }, orderBy: { name: "asc" }, select: { id: true, name: true, severity: true, reaction: true } }),
      this.prisma.vaccinationSummary.findUnique({ where: { petId } }),
      this.prisma.careReminder.findMany({ where: { petId, type: "VACCINATION", state: { in: ["UPCOMING", "SNOOZED"] }, dueAt: { gte: now } }, orderBy: { dueAt: "asc" }, take: 5, select: { id: true, title: true, dueAt: true } }),
      this.prisma.clinicalVisit.findMany({ where: { petId }, orderBy: { startedAt: "desc" }, take: 3, select: { id: true, startedAt: true, status: true, reasonForVisit: true, providerOrganization: { select: { id: true, name: true } } } }),
      this.prisma.labResult.findMany({ where: { petId }, orderBy: [{ resultDate: "desc" }, { createdAt: "desc" }], take: 5, select: { id: true, testName: true, value: true, unit: true, flag: true, resultDate: true, status: true } }),
      this.prisma.imagingStudy.findMany({ where: { petId }, orderBy: [{ performedAt: "desc" }, { createdAt: "desc" }], take: 3, select: { id: true, studyType: true, bodyRegion: true, performedAt: true, createdAt: true } }),
      this.prisma.medicalDocument.count({ where: { petId, voidedAt: null } }),
      this.prisma.patientVitalsRecord.findFirst({ where: { petId, weightValue: { not: null } }, orderBy: { recordedAt: "desc" }, select: { weightValue: true, weightUnit: true, recordedAt: true, providerOrganizationId: true } }),
    ]);
    const latestWeight = vitals && (!pet.latestWeightValue || vitals.recordedAt >= pet.updatedAt)
      ? { value: Number(vitals.weightValue), unit: vitals.weightUnit, recordedAt: vitals.recordedAt.toISOString(), source: "CLINIC" as const }
      : pet.latestWeightValue ? { value: Number(pet.latestWeightValue), unit: pet.latestWeightUnit, recordedAt: null, source: "OWNER" as const } : null;
    const upcomingVaccinations = [
      ...(vaccination?.nextDueDate && vaccination.nextDueDate >= new Date(now.toISOString().slice(0, 10)) ? [{ kind: "VACCINATION_SUMMARY" as const, id: vaccination.id, title: null, dueAt: vaccination.nextDueDate.toISOString() }] : []),
      ...vaccineCare.map((c) => ({ kind: "CARE_REMINDER" as const, id: c.id, title: c.title, dueAt: c.dueAt.toISOString() })),
    ].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    return {
      petId,
      activeConditions: conditions.map((c) => ({ id: c.id, name: c.name, since: c.firstRecordedAt?.toISOString() ?? null })),
      activeMedications: medications.map((m) => ({ id: m.id, name: m.name, dosage: m.dosage?.toString() ?? null, unit: m.unit, frequency: m.frequencyText, startedAt: m.startDate?.toISOString() ?? null })),
      allergies: allergies.map((a) => ({ id: a.id, name: a.name, severity: a.severity, reaction: a.reaction })),
      latestWeight,
      vaccinationStatus: vaccination?.status ?? null,
      upcomingVaccinations,
      recentVisits: visits.map((v) => ({ id: v.id, startedAt: v.startedAt.toISOString(), status: v.status, reason: v.reasonForVisit, organization: v.providerOrganization })),
      recentLabs: labs.map((l) => ({ id: l.id, testName: l.testName, value: l.value, unit: l.unit, flag: l.flag ?? null, resultDate: l.resultDate?.toISOString() ?? null, status: l.status })),
      recentImaging: imaging.map((i) => ({ id: i.id, studyType: i.studyType, bodyRegion: i.bodyRegion, performedAt: (i.performedAt ?? i.createdAt).toISOString() })),
      documentsCount,
    };
  }

  async feed(petId: string, q: { types?: HealthFeedType[]; sources?: HealthSource[]; from?: string; to?: string; cursor?: string; limit?: number }) {
    const take = Math.min(Math.max(q.limit ?? 20, 1), 100);
    const from = q.from ? new Date(q.from) : null;
    const to = q.to ? new Date(q.to) : null;
    const after = q.cursor ? decodeCursor(q.cursor) : null;
    const base = (await this.timeline.list(petId, 10_000)).map((e) => this.fromTimeline(petId, e));
    const weights = await this.weights(petId);
    const all = [...base, ...weights]
      .filter((i) => !q.types?.length || q.types.includes(i.type))
      .filter((i) => !q.sources?.length || q.sources.includes(i.source))
      .filter((i) => (!from || i.occurredAt >= from.toISOString()) && (!to || i.occurredAt <= to.toISOString()))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id));
    const start = after ? all.findIndex((i) => i.occurredAt < after.at || (i.occurredAt === after.at && i.id < after.id)) : 0;
    const page = start < 0 ? [] : all.slice(start, start + take);
    const last = page[page.length - 1];
    return { items: page, nextCursor: last && start + take < all.length ? encodeCursor(last.occurredAt, last.id) : null };
  }

  private fromTimeline(petId: string, e: HealthTimelineEntryDto): HealthFeedItem {
    return {
      id: `${e.type}:${e.recordId}`,
      type: GROUP[e.type] ?? "OTHER",
      recordType: e.type,
      recordId: e.recordId,
      occurredAt: e.occurredAt,
      recordedAt: e.recordedAt ?? null,
      source: normaliseSource(e.sourceType as string, e.source.providerUserId),
      author: { providerUserId: e.source.providerUserId, displayTitle: e.source.providerUserDisplayTitle, userId: e.source.userId },
      organization: e.source.providerOrganizationId ? { id: e.source.providerOrganizationId, name: e.source.providerOrganizationName } : null,
      summary: e.summary,
      deepLink: LINK[e.type]?.(petId, e.recordId) ?? null,
    };
  }

  private async weights(petId: string): Promise<HealthFeedItem[]> {
    const rows = await this.prisma.patientVitalsRecord.findMany({ where: { petId, weightValue: { not: null } }, orderBy: { recordedAt: "desc" }, take: 500 });
    const orgIds = [...new Set(rows.map((r) => r.providerOrganizationId).filter((x): x is string => Boolean(x)))];
    const orgs = orgIds.length ? await this.prisma.providerOrganization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } }) : [];
    return rows.map((r) => ({
      id: `WEIGHT:${r.id}`,
      type: "WEIGHT" as const,
      recordType: "WEIGHT",
      recordId: r.id,
      occurredAt: r.recordedAt.toISOString(),
      recordedAt: r.createdAt.toISOString(),
      source: r.providerUserId ? ("VET" as const) : ("CLINIC" as const),
      author: { providerUserId: r.providerUserId ?? null, displayTitle: null, userId: null },
      organization: r.providerOrganizationId ? { id: r.providerOrganizationId, name: orgs.find((o) => o.id === r.providerOrganizationId)?.name ?? null } : null,
      summary: `${Number(r.weightValue)} ${r.weightUnit ?? ""}`.trim(),
      deepLink: LINK.WEIGHT!(petId, r.id),
    }));
  }
}

function encodeCursor(at: string, id: string) {
  return Buffer.from(`${at}|${id}`).toString("base64url");
}
function decodeCursor(cursor: string) {
  const [at, ...rest] = Buffer.from(cursor, "base64url").toString().split("|");
  const id = rest.join("|");
  if (!at || !id || Number.isNaN(Date.parse(at))) throw new ValidationApiException({ field: "cursor" });
  return { at, id };
}
