import { Injectable } from "@nestjs/common";
import { LegalDocumentKind, Locale, Prisma, SystemIncidentImpact, SystemIncidentStatus } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";
import { AdminAuditLogService } from "../admin/audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../admin/auth/admin-context.types";

/** One legal document as a reader sees it. `body` is null only in the empty-state shape below. */
export interface PublicLegalDocumentDto {
  kind: LegalDocumentKind;
  locale: Locale;
  /** False when no text has been supplied yet: the page must render an explicit empty state, never filler. */
  available: boolean;
  title: string | null;
  body: string | null;
  version: number | null;
  /** The date the published text takes effect — the page shows this as "last updated" (in Jalali and Gregorian). */
  effectiveAt: string | null;
}

/**
 * Legal documents and the public status page.
 *
 * The platform never authors legal text. A document with no published version is reported as
 * `available: false` and nothing else — there is no placeholder body, no default, no "lorem". The text only
 * ever comes from an admin entering what the owner supplied, and every publish is audited and versioned.
 */
@Injectable()
export class LegalStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditLogService,
  ) {}

  // ------------------------------------------------------------------ legal: public

  async getPublicDocument(kind: LegalDocumentKind, locale: Locale): Promise<PublicLegalDocumentDto> {
    const empty: PublicLegalDocumentDto = { kind, locale, available: false, title: null, body: null, version: null, effectiveAt: null };
    const doc = await this.prisma.legalDocument.findUnique({ where: { kind_locale: { kind, locale } } });
    if (!doc || doc.publishedVersion === null) return empty;
    const version = await this.prisma.legalDocumentVersion.findUnique({ where: { documentId_versionNumber: { documentId: doc.id, versionNumber: doc.publishedVersion } } });
    if (!version) return empty;
    return { kind, locale, available: true, title: version.title, body: version.body, version: version.versionNumber, effectiveAt: version.effectiveAt.toISOString() };
  }

  /** The index of every legal page with whether text exists for it, so the footer/index never links to a dead end silently. */
  async listPublicIndex(locale: Locale): Promise<Array<{ kind: LegalDocumentKind; available: boolean; title: string | null; effectiveAt: string | null }>> {
    const docs = await this.prisma.legalDocument.findMany({ where: { locale, publishedVersion: { not: null } }, include: { versions: { select: { versionNumber: true, title: true, effectiveAt: true } } } });
    const byKind = new Map(docs.map((d) => [d.kind, d]));
    return Object.values(LegalDocumentKind).map((kind) => {
      const doc = byKind.get(kind);
      const v = doc?.versions.find((x) => x.versionNumber === doc.publishedVersion);
      return { kind, available: !!v, title: v?.title ?? null, effectiveAt: v?.effectiveAt.toISOString() ?? null };
    });
  }

  // ------------------------------------------------------------------ legal: admin

  async adminListDocuments() {
    const docs = await this.prisma.legalDocument.findMany({ include: { versions: { select: { versionNumber: true }, orderBy: { versionNumber: "desc" }, take: 1 } } });
    return docs.map((d) => ({ id: d.id, kind: d.kind, locale: d.locale, publishedVersion: d.publishedVersion, latestVersion: d.versions[0]?.versionNumber ?? null, updatedAt: d.updatedAt.toISOString() }));
  }

  async adminListVersions(kind: LegalDocumentKind, locale: Locale) {
    const doc = await this.prisma.legalDocument.findUnique({ where: { kind_locale: { kind, locale } } });
    if (!doc) return [];
    return this.prisma.legalDocumentVersion.findMany({ where: { documentId: doc.id }, orderBy: { versionNumber: "desc" } });
  }

  /** Saves a new version of a document (creating the document row on first save). Does not publish. */
  async adminSaveVersion(admin: ResolvedAdminContext, input: { kind: LegalDocumentKind; locale: Locale; title: string; body: string; effectiveAt: string; changeNote?: string | null }) {
    const effectiveAt = new Date(input.effectiveAt);
    if (Number.isNaN(effectiveAt.getTime())) throw new ValidationApiException({ field: "effectiveAt", reason: "INVALID_DATE" });
    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.legalDocument.upsert({ where: { kind_locale: { kind: input.kind, locale: input.locale } }, create: { kind: input.kind, locale: input.locale }, update: {} });
      const max = await tx.legalDocumentVersion.aggregate({ where: { documentId: doc.id }, _max: { versionNumber: true } });
      const versionNumber = (max._max.versionNumber ?? 0) + 1;
      const version = await tx.legalDocumentVersion.create({ data: { documentId: doc.id, versionNumber, title: input.title, body: input.body, effectiveAt, editorAdminId: admin.adminUserId, changeNote: input.changeNote ?? null } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "legal_document.saved", entityType: "LegalDocument", entityId: doc.id, afterSummary: { kind: input.kind, locale: input.locale, version: versionNumber }, tx });
      return version;
    });
  }

  async adminPublish(admin: ResolvedAdminContext, kind: LegalDocumentKind, locale: Locale, versionNumber: number) {
    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.legalDocument.findUnique({ where: { kind_locale: { kind, locale } } });
      if (!doc) throw new NotFoundApiException("LegalDocument");
      const version = await tx.legalDocumentVersion.findUnique({ where: { documentId_versionNumber: { documentId: doc.id, versionNumber } } });
      if (!version) throw new NotFoundApiException("LegalDocumentVersion");
      const updated = await tx.legalDocument.update({ where: { id: doc.id }, data: { publishedVersion: versionNumber } });
      await tx.legalDocumentVersion.update({ where: { id: version.id }, data: { publishedAt: version.publishedAt ?? new Date() } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "legal_document.published", entityType: "LegalDocument", entityId: doc.id, beforeSummary: { version: doc.publishedVersion }, afterSummary: { version: versionNumber }, tx });
      return updated;
    });
  }

  /** Withdraws a document: the public page returns to its empty state. History is kept. */
  async adminUnpublish(admin: ResolvedAdminContext, kind: LegalDocumentKind, locale: Locale) {
    return this.prisma.$transaction(async (tx) => {
      const doc = await tx.legalDocument.findUnique({ where: { kind_locale: { kind, locale } } });
      if (!doc) throw new NotFoundApiException("LegalDocument");
      const updated = await tx.legalDocument.update({ where: { id: doc.id }, data: { publishedVersion: null } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "legal_document.unpublished", entityType: "LegalDocument", entityId: doc.id, beforeSummary: { version: doc.publishedVersion }, tx });
      return updated;
    });
  }

  // ------------------------------------------------------------------ status: public

  /**
   * The public status page. "Operational" is claimed only when there is genuinely no open incident and no
   * active maintenance window — it is derived from rows, never asserted, so a quiet database cannot claim
   * more than the operations team has actually recorded.
   */
  async getPublicStatus() {
    const now = new Date();
    const [open, recent, windows] = await Promise.all([
      this.prisma.systemIncident.findMany({ where: { status: { not: SystemIncidentStatus.RESOLVED } }, orderBy: { startedAt: "desc" }, include: { updates: { orderBy: { createdAt: "desc" } } } }),
      this.prisma.systemIncident.findMany({ where: { status: SystemIncidentStatus.RESOLVED, resolvedAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } }, orderBy: { resolvedAt: "desc" }, take: 20, include: { updates: { orderBy: { createdAt: "desc" } } } }),
      this.prisma.maintenanceWindow.findMany({ where: { cancelledAt: null, endsAt: { gte: now } }, orderBy: { startsAt: "asc" }, take: 20 }),
    ]);
    const activeMaintenance = windows.find((w) => w.startsAt <= now && w.endsAt >= now) ?? null;
    const worst = open.reduce<SystemIncidentImpact>((acc, i) => (IMPACT_RANK[i.impact] > IMPACT_RANK[acc] ? i.impact : acc), SystemIncidentImpact.NONE);
    const indicator = activeMaintenance ? "MAINTENANCE" : open.length === 0 ? "OPERATIONAL" : worst === SystemIncidentImpact.CRITICAL || worst === SystemIncidentImpact.MAJOR ? "OUTAGE" : "DEGRADED";
    return {
      indicator,
      generatedAt: now.toISOString(),
      openIncidents: open.map(toIncidentDto),
      recentIncidents: recent.map(toIncidentDto),
      maintenance: windows.map((w) => ({ id: w.id, title: w.title, message: w.message, startsAt: w.startsAt.toISOString(), endsAt: w.endsAt.toISOString(), active: w.startsAt <= now && w.endsAt >= now })),
      activeMaintenance: activeMaintenance ? { title: activeMaintenance.title, message: activeMaintenance.message, endsAt: activeMaintenance.endsAt.toISOString() } : null,
    };
  }

  async getPublicIncident(id: string) {
    const incident = await this.prisma.systemIncident.findUnique({ where: { id }, include: { updates: { orderBy: { createdAt: "desc" } } } });
    if (!incident) throw new NotFoundApiException("SystemIncident");
    return toIncidentDto(incident);
  }

  // ------------------------------------------------------------------ status: admin

  async adminOpenIncident(admin: ResolvedAdminContext, input: { title: string; impact: SystemIncidentImpact; components?: string[]; body: string }) {
    return this.prisma.$transaction(async (tx) => {
      const incident = await tx.systemIncident.create({ data: { title: input.title, impact: input.impact, components: input.components ?? [], createdByAdminId: admin.adminUserId } });
      await tx.systemIncidentUpdate.create({ data: { incidentId: incident.id, status: SystemIncidentStatus.INVESTIGATING, body: input.body, authorAdminId: admin.adminUserId } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "system_incident.opened", entityType: "SystemIncident", entityId: incident.id, afterSummary: { impact: input.impact }, tx });
      return incident;
    });
  }

  async adminUpdateIncident(admin: ResolvedAdminContext, id: string, input: { status: SystemIncidentStatus; body: string; impact?: SystemIncidentImpact }) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.systemIncident.findUnique({ where: { id } });
      if (!existing) throw new NotFoundApiException("SystemIncident");
      const resolved = input.status === SystemIncidentStatus.RESOLVED;
      const incident = await tx.systemIncident.update({ where: { id }, data: { status: input.status, ...(input.impact ? { impact: input.impact } : {}), resolvedAt: resolved ? (existing.resolvedAt ?? new Date()) : null } });
      await tx.systemIncidentUpdate.create({ data: { incidentId: id, status: input.status, body: input.body, authorAdminId: admin.adminUserId } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "system_incident.updated", entityType: "SystemIncident", entityId: id, beforeSummary: { status: existing.status }, afterSummary: { status: incident.status }, tx });
      return incident;
    });
  }

  async adminListIncidents() {
    return this.prisma.systemIncident.findMany({ orderBy: { startedAt: "desc" }, take: 100, include: { updates: { orderBy: { createdAt: "desc" } } } });
  }

  async adminScheduleMaintenance(admin: ResolvedAdminContext, input: { title: string; message?: string | null; startsAt: string; endsAt: string }) {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) throw new ValidationApiException({ field: "startsAt", reason: "INVALID_DATE" });
    if (endsAt <= startsAt) throw new ValidationApiException({ field: "endsAt", reason: "END_BEFORE_START" });
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.maintenanceWindow.create({ data: { title: input.title, message: input.message ?? null, startsAt, endsAt, createdByAdminId: admin.adminUserId } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "maintenance_window.scheduled", entityType: "MaintenanceWindow", entityId: row.id, afterSummary: { startsAt: input.startsAt, endsAt: input.endsAt }, tx });
      return row;
    });
  }

  async adminCancelMaintenance(admin: ResolvedAdminContext, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.maintenanceWindow.findUnique({ where: { id } });
      if (!existing) throw new NotFoundApiException("MaintenanceWindow");
      const row = await tx.maintenanceWindow.update({ where: { id }, data: { cancelledAt: existing.cancelledAt ?? new Date() } });
      await this.audit.record({ adminUserId: admin.adminUserId, action: "maintenance_window.cancelled", entityType: "MaintenanceWindow", entityId: id, tx });
      return row;
    });
  }

  async adminListMaintenance() {
    return this.prisma.maintenanceWindow.findMany({ orderBy: { startsAt: "desc" }, take: 100 });
  }
}

const IMPACT_RANK: Record<SystemIncidentImpact, number> = { NONE: 0, MINOR: 1, MAJOR: 2, CRITICAL: 3 };

function toIncidentDto(i: Prisma.SystemIncidentGetPayload<{ include: { updates: true } }>) {
  return {
    id: i.id,
    title: i.title,
    status: i.status,
    impact: i.impact,
    components: i.components,
    startedAt: i.startedAt.toISOString(),
    resolvedAt: i.resolvedAt?.toISOString() ?? null,
    updates: i.updates.map((u) => ({ id: u.id, status: u.status, body: u.body, createdAt: u.createdAt.toISOString() })),
  };
}
