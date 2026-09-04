import { Injectable } from "@nestjs/common";
import type { HealthTimelineEntryDto } from "@petlife/types";
import { HealthTimelineEntryType, SourceType as SourceTypeDto } from "@petlife/types";
import { PrismaService } from "../../common/prisma/prisma.service";
import { toClinicalActorRefDto } from "./clinical-health-mapper";

const EMPTY_ACTOR = { providerOrganizationId: null, providerOrganizationName: null, providerUserId: null, providerUserDisplayTitle: null, userId: null };

/**
 * Unifies every health-related event chronologically — deliberately NOT a
 * stored table (see the schema.prisma section doc comment); every call
 * re-derives the timeline from source-of-truth rows across the H02 and H17
 * models, the same "derived, never duplicated" approach as H16's usage
 * metering. Provenance is preserved on every entry (spec: "Timeline item
 * should include... provenance indicator").
 */
@Injectable()
export class HealthTimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async list(petId: string, limit = 100): Promise<HealthTimelineEntryDto[]> {
    const [vaccination, medications, conditions, allergies, visits, labs, imaging, referrals, dental, nutrition, rehabSessions, observations, documents] = await Promise.all([
      this.prisma.vaccinationSummary.findUnique({ where: { petId } }),
      this.prisma.medication.findMany({ where: { petId } }),
      this.prisma.condition.findMany({ where: { petId } }),
      this.prisma.allergy.findMany({ where: { petId } }),
      this.prisma.clinicalVisit.findMany({ where: { petId }, include: { providerOrganization: { select: { id: true, name: true } }, providerUser: { select: { id: true, displayTitle: true } } } }),
      this.prisma.labResult.findMany({ where: { petId }, include: { providerOrganization: { select: { id: true, name: true } }, recordedByProviderUser: { select: { id: true, displayTitle: true } } } }),
      this.prisma.imagingStudy.findMany({ where: { petId }, include: { providerOrganization: { select: { id: true, name: true } }, performedByProviderUser: { select: { id: true, displayTitle: true } } } }),
      this.prisma.referral.findMany({ where: { petId }, include: { fromProviderOrganization: { select: { id: true, name: true } } } }),
      this.prisma.dentalRecord.findMany({ where: { petId }, include: { providerOrganization: { select: { id: true, name: true } }, providerUser: { select: { id: true, displayTitle: true } } } }),
      this.prisma.clinicalNutritionPlan.findMany({ where: { petId }, include: { providerOrganization: { select: { id: true, name: true } } } }),
      this.prisma.rehabSession.findMany({ where: { rehabPlan: { petId } }, include: { rehabPlan: { include: { providerOrganization: { select: { id: true, name: true } } } } } }),
      this.prisma.petObservation.findMany({ where: { petId } }),
      this.prisma.medicalDocument.findMany({ where: { petId, voidedAt: null }, include: { sourceProviderOrganization: { select: { id: true, name: true } }, sourceProviderUser: { select: { id: true, displayTitle: true } } } }),
    ]);

    const entries: HealthTimelineEntryDto[] = [];

    if (vaccination?.lastKnownDate) {
      entries.push({ type: HealthTimelineEntryType.VACCINATION, occurredAt: vaccination.lastKnownDate.toISOString(), sourceType: vaccination.sourceType as unknown as SourceTypeDto, source: EMPTY_ACTOR, summary: `Vaccination status: ${vaccination.status}`, recordId: vaccination.id, recordType: HealthTimelineEntryType.VACCINATION });
    }
    for (const m of medications) {
      if (m.startDate) entries.push({ type: HealthTimelineEntryType.MEDICATION_STARTED, occurredAt: m.startDate.toISOString(), sourceType: m.sourceType as unknown as SourceTypeDto, source: EMPTY_ACTOR, summary: `${m.name} started`, recordId: m.id, recordType: HealthTimelineEntryType.MEDICATION_STARTED });
      if (m.endDate) entries.push({ type: HealthTimelineEntryType.MEDICATION_STOPPED, occurredAt: m.endDate.toISOString(), sourceType: m.sourceType as unknown as SourceTypeDto, source: EMPTY_ACTOR, summary: `${m.name} stopped`, recordId: m.id, recordType: HealthTimelineEntryType.MEDICATION_STOPPED });
    }
    for (const c of conditions) {
      const occurredAt = (c.firstRecordedAt ?? c.createdAt).toISOString();
      entries.push({ type: HealthTimelineEntryType.CONDITION_RECORDED, occurredAt, sourceType: c.sourceType as unknown as SourceTypeDto, source: EMPTY_ACTOR, summary: `Condition recorded: ${c.name}`, recordId: c.id, recordType: HealthTimelineEntryType.CONDITION_RECORDED });
    }
    for (const a of allergies) {
      entries.push({ type: HealthTimelineEntryType.ALLERGY_RECORDED, occurredAt: a.recordedAt.toISOString(), sourceType: a.sourceType as unknown as SourceTypeDto, source: EMPTY_ACTOR, summary: `Allergy recorded: ${a.name}`, recordId: a.id, recordType: HealthTimelineEntryType.ALLERGY_RECORDED });
    }
    for (const v of visits) {
      entries.push({
        type: HealthTimelineEntryType.CLINICAL_VISIT,
        occurredAt: v.startedAt.toISOString(),
        sourceType: SourceTypeDto.PROVIDER,
        source: toClinicalActorRefDto({ sourceProviderOrganizationId: v.providerOrganizationId, sourceProviderOrganization: v.providerOrganization, sourceProviderUserId: v.providerUserId, sourceProviderUser: v.providerUser }),
        summary: v.reasonForVisit ?? `Visit at ${v.providerOrganization.name}`,
        recordId: v.id,
        recordType: HealthTimelineEntryType.CLINICAL_VISIT,
      });
    }
    for (const l of labs) {
      entries.push({
        type: HealthTimelineEntryType.LAB_RESULT,
        occurredAt: (l.resultDate ?? l.createdAt).toISOString(),
        sourceType: l.sourceType as unknown as SourceTypeDto,
        source: toClinicalActorRefDto({ sourceProviderOrganizationId: l.providerOrganizationId, sourceProviderOrganization: l.providerOrganization, sourceProviderUserId: l.recordedByProviderUserId, sourceProviderUser: l.recordedByProviderUser }),
        summary: `Lab result: ${l.testName}`,
        recordId: l.id,
        recordType: HealthTimelineEntryType.LAB_RESULT,
      });
    }
    for (const i of imaging) {
      entries.push({
        type: HealthTimelineEntryType.IMAGING_STUDY,
        occurredAt: (i.performedAt ?? i.createdAt).toISOString(),
        sourceType: i.sourceType as unknown as SourceTypeDto,
        source: toClinicalActorRefDto({ sourceProviderOrganizationId: i.providerOrganizationId, sourceProviderOrganization: i.providerOrganization, sourceProviderUserId: i.performedByProviderUserId, sourceProviderUser: i.performedByProviderUser }),
        summary: `Imaging: ${i.studyType}`,
        recordId: i.id,
        recordType: HealthTimelineEntryType.IMAGING_STUDY,
      });
    }
    for (const r of referrals) {
      entries.push({
        type: HealthTimelineEntryType.REFERRAL,
        occurredAt: r.createdAt.toISOString(),
        sourceType: SourceTypeDto.PROVIDER,
        source: toClinicalActorRefDto({ sourceProviderOrganizationId: r.fromProviderOrganizationId, sourceProviderOrganization: r.fromProviderOrganization }),
        summary: `Referral: ${r.reason}`,
        recordId: r.id,
        recordType: HealthTimelineEntryType.REFERRAL,
      });
    }
    for (const d of dental) {
      entries.push({
        type: HealthTimelineEntryType.DENTAL_RECORD,
        occurredAt: (d.performedAt ?? d.createdAt).toISOString(),
        sourceType: d.sourceType as unknown as SourceTypeDto,
        source: toClinicalActorRefDto({ sourceProviderOrganizationId: d.providerOrganizationId, sourceProviderOrganization: d.providerOrganization, sourceProviderUserId: d.providerUserId, sourceProviderUser: d.providerUser }),
        summary: `Dental: ${d.recordType}`,
        recordId: d.id,
        recordType: HealthTimelineEntryType.DENTAL_RECORD,
      });
    }
    for (const n of nutrition) {
      entries.push({
        type: HealthTimelineEntryType.NUTRITION_PLAN,
        occurredAt: n.createdAt.toISOString(),
        sourceType: SourceTypeDto.PROVIDER,
        source: toClinicalActorRefDto({ sourceProviderOrganizationId: n.providerOrganizationId, sourceProviderOrganization: n.providerOrganization }),
        summary: n.goal ?? "Nutrition plan created",
        recordId: n.id,
        recordType: HealthTimelineEntryType.NUTRITION_PLAN,
      });
    }
    for (const s of rehabSessions) {
      entries.push({
        type: HealthTimelineEntryType.REHAB_SESSION,
        occurredAt: s.sessionDate.toISOString(),
        sourceType: SourceTypeDto.PROVIDER,
        source: toClinicalActorRefDto({ sourceProviderOrganizationId: s.rehabPlan.providerOrganizationId, sourceProviderOrganization: s.rehabPlan.providerOrganization }),
        summary: "Rehab session",
        recordId: s.id,
        recordType: HealthTimelineEntryType.REHAB_SESSION,
      });
    }
    for (const o of observations) {
      entries.push({ type: HealthTimelineEntryType.OBSERVATION, occurredAt: o.observedAt.toISOString(), sourceType: SourceTypeDto.OWNER, source: EMPTY_ACTOR, summary: `Owner observation: ${o.category}`, recordId: o.id, recordType: HealthTimelineEntryType.OBSERVATION });
    }
    for (const doc of documents) {
      entries.push({
        type: HealthTimelineEntryType.DOCUMENT_UPLOADED,
        occurredAt: doc.uploadedAt.toISOString(),
        sourceType: doc.sourceType as unknown as SourceTypeDto,
        source: toClinicalActorRefDto(doc),
        summary: `Document uploaded: ${doc.title}`,
        recordId: doc.id,
        recordType: HealthTimelineEntryType.DOCUMENT_UPLOADED,
      });
    }

    return entries.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).slice(0, limit);
  }
}
