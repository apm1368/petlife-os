"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Select, Skeleton, StatusLabel } from "@petlife/ui";
import type { MedicalDocumentDto, TravelRequirementDto, TripDto, TripReadinessSummaryDto } from "@petlife/types";
import { MedicalDocumentType, TravelRequirementStatus, TravelRequirementType, TripStatus } from "@petlife/types";
import { travelService } from "@/services/travel.service";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { ApiError } from "@/lib/api/client";
import { requirementStatusTone, tripStatusTone } from "./travel-status";

const ALLOWED_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  [TripStatus.DRAFT]: [TripStatus.PLANNING, TripStatus.CANCELLED],
  [TripStatus.PLANNING]: [TripStatus.READY, TripStatus.DRAFT, TripStatus.CANCELLED],
  [TripStatus.READY]: [TripStatus.IN_PROGRESS, TripStatus.PLANNING, TripStatus.CANCELLED],
  [TripStatus.IN_PROGRESS]: [TripStatus.COMPLETED, TripStatus.CANCELLED],
  [TripStatus.COMPLETED]: [],
  [TripStatus.CANCELLED]: [],
};

const REQUIREMENT_TYPES: TravelRequirementType[] = [
  TravelRequirementType.VACCINATION,
  TravelRequirementType.RABIES,
  TravelRequirementType.MICROCHIP,
  TravelRequirementType.HEALTH_CERTIFICATE,
  TravelRequirementType.IMPORT_PERMIT,
  TravelRequirementType.EXPORT_PERMIT,
  TravelRequirementType.CARRIER,
  TravelRequirementType.AIRLINE_POLICY,
  TravelRequirementType.MEDICATION,
  TravelRequirementType.QUARANTINE,
  TravelRequirementType.PARASITE_TREATMENT,
  TravelRequirementType.PASSPORT_DOCUMENT,
  TravelRequirementType.OTHER,
];

const REQUIREMENT_STATUSES: TravelRequirementStatus[] = [
  TravelRequirementStatus.UNKNOWN,
  TravelRequirementStatus.REQUIRED,
  TravelRequirementStatus.NOT_REQUIRED,
  TravelRequirementStatus.INCOMPLETE,
  TravelRequirementStatus.READY,
];

export function TripDetailView({ petId, tripId }: { petId: string; tripId: string }) {
  const t = useTranslations("travel");
  const tCommon = useTranslations("common");

  const [trip, setTrip] = useState<TripDto | null>(null);
  const [readiness, setReadiness] = useState<TripReadinessSummaryDto | null>(null);
  const [suggestions, setSuggestions] = useState<TravelRequirementType[]>([]);
  const [documents, setDocuments] = useState<MedicalDocumentDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const [newRequirementType, setNewRequirementType] = useState<TravelRequirementType>(TravelRequirementType.VACCINATION);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  async function load() {
    setError(null);
    try {
      const [tripData, readinessData, suggestionsData, documentsData] = await Promise.all([
        travelService.get(petId, tripId),
        travelService.getReadiness(petId, tripId),
        travelService.getRequirementSuggestions(petId, tripId),
        healthAdvancedService.listDocuments(petId),
      ]);
      setTrip(tripData);
      setReadiness(readinessData);
      setSuggestions(suggestionsData);
      setDocuments(documentsData.filter((doc) => doc.documentType === MedicalDocumentType.TRAVEL_DOCUMENT));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId, tripId]);

  async function runAction(action: () => Promise<unknown>): Promise<void> {
    setIsActing(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setIsActing(false);
    }
  }

  async function uploadTravelDocument(requirementId: string, file: File): Promise<void> {
    setIsActing(true);
    setError(null);
    try {
      const target = await healthAdvancedService.requestDocumentUpload(petId, { contentType: file.type, fileSizeBytes: file.size });
      await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: file });
      const document = await healthAdvancedService.createDocument(petId, {
        key: target.key,
        documentType: MedicalDocumentType.TRAVEL_DOCUMENT,
        title: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
      });
      await travelService.updateRequirement(petId, tripId, requirementId, { linkedMedicalDocumentId: document.id });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setIsActing(false);
    }
  }

  if (error && !trip) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!trip || !readiness) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  const availableTransitions = ALLOWED_TRANSITIONS[trip.status] ?? [];
  const remainingSuggestions = suggestions.filter((type) => !readiness.requirements.some((r) => r.requirementType === type));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-page-title text-text-primary">
          {trip.originCountry} → {trip.destinationCountry}
        </h1>
        <StatusLabel tone={tripStatusTone(trip.status)}>{t(`status.${trip.status}`)}</StatusLabel>
      </div>

      <ContextSurface className="flex flex-col gap-2">
        <p className="text-body text-text-primary">{t("detail.departAt", { date: new Date(trip.departAt).toLocaleDateString() })}</p>
        {trip.returnAt ? <p className="text-body text-text-primary">{t("detail.returnAt", { date: new Date(trip.returnAt).toLocaleDateString() })}</p> : null}
        <p className="text-metadata text-text-secondary">{t(`travelMode.${trip.travelMode}`)}</p>
        {trip.notes ? <p className="text-metadata text-text-secondary">{trip.notes}</p> : null}
      </ContextSurface>

      {error ? <p className="text-body text-state-urgent">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        {availableTransitions.map((next) => (
          <Button key={next} variant={next === "CANCELLED" ? "ghost" : "secondary"} isLoading={isActing} onClick={() => runAction(() => travelService.transition(petId, tripId, next))}>
            {t(`transitions.${next}`)}
          </Button>
        ))}
      </div>

      {/* spec locked rule: never infer readiness from one field — allReady only true when every requirement is READY/NOT_REQUIRED, and an empty checklist is never "ready". */}
      <ContextSurface className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-body text-text-primary">{t("readiness.summary", { ready: readiness.readyCount, total: readiness.totalCount })}</span>
          <StatusLabel tone={readiness.allReady ? "success" : "attention"}>{readiness.allReady ? t("readiness.allReady") : t("readiness.notReady")}</StatusLabel>
        </div>
        {readiness.hasStaleRequirement ? <p className="text-metadata text-state-urgent">{t("readiness.staleWarning")}</p> : null}
      </ContextSurface>

      <h2 className="text-section-title text-text-primary">{t("detail.requirementsTitle")}</h2>

      {readiness.requirements.length === 0 ? (
        <EmptyState title={t("detail.requirementsEmpty")} />
      ) : (
        <div className="flex flex-col gap-3">
          {readiness.requirements.map((requirement) => (
            <RequirementCard
              key={requirement.id}
              requirement={requirement}
              isActing={isActing}
              onChangeStatus={(status) => runAction(() => travelService.updateRequirement(petId, tripId, requirement.id, { status }))}
              onMarkVerified={() => runAction(() => travelService.updateRequirement(petId, tripId, requirement.id, { markVerified: true }))}
              onDelete={() => runAction(() => travelService.deleteRequirement(petId, tripId, requirement.id))}
              onLinkExisting={(documentId) => runAction(() => travelService.updateRequirement(petId, tripId, requirement.id, { linkedMedicalDocumentId: documentId || null }))}
              onUploadFile={(file) => uploadTravelDocument(requirement.id, file)}
              documents={documents}
              fileInputRef={(el) => {
                fileInputRefs.current[requirement.id] = el;
              }}
            />
          ))}
        </div>
      )}

      <ContextSurface className="flex flex-col gap-3">
        <h3 className="text-body text-text-primary">{t("detail.addRequirementTitle")}</h3>
        {remainingSuggestions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {remainingSuggestions.map((type) => (
              <Button key={type} variant="ghost" size="sm" isLoading={isActing} onClick={() => runAction(() => travelService.createRequirement(petId, tripId, { requirementType: type }))}>
                {t(`requirementType.${type}`)}
              </Button>
            ))}
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <Select
            label={t("detail.requirementTypeLabel")}
            value={newRequirementType}
            onChange={(e) => setNewRequirementType(e.target.value as TravelRequirementType)}
            options={REQUIREMENT_TYPES.map((type) => ({ value: type, label: t(`requirementType.${type}`) }))}
          />
          <Button variant="secondary" isLoading={isActing} onClick={() => runAction(() => travelService.createRequirement(petId, tripId, { requirementType: newRequirementType }))}>
            {t("detail.addRequirement")}
          </Button>
        </div>
      </ContextSurface>
    </div>
  );
}

function RequirementCard({
  requirement,
  isActing,
  onChangeStatus,
  onMarkVerified,
  onDelete,
  onLinkExisting,
  onUploadFile,
  documents,
  fileInputRef,
}: {
  requirement: TravelRequirementDto;
  isActing: boolean;
  onChangeStatus: (status: TravelRequirementStatus) => void;
  onMarkVerified: () => void;
  onDelete: () => void;
  onLinkExisting: (documentId: string) => void;
  onUploadFile: (file: File) => void;
  documents: MedicalDocumentDto[];
  fileInputRef: (el: HTMLInputElement | null) => void;
}) {
  const t = useTranslations("travel");

  return (
    <ContextSurface className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-body text-text-primary">{t(`requirementType.${requirement.requirementType}`)}</span>
        <div className="flex items-center gap-2">
          {requirement.isStale ? <StatusLabel tone="attention">{t("readiness.stale")}</StatusLabel> : null}
          <StatusLabel tone={requirementStatusTone(requirement.status)}>{t(`requirementStatus.${requirement.status}`)}</StatusLabel>
        </div>
      </div>

      {requirement.source ? <p className="text-metadata text-text-secondary">{t("detail.source", { source: requirement.source })}</p> : null}
      {requirement.jurisdiction ? <p className="text-metadata text-text-secondary">{t("detail.jurisdiction", { jurisdiction: requirement.jurisdiction })}</p> : null}
      <p className="text-metadata text-text-secondary">
        {requirement.verifiedAt ? t("detail.verifiedAt", { date: new Date(requirement.verifiedAt).toLocaleDateString() }) : t("detail.neverVerified")}
      </p>
      {requirement.linkedMedicalDocumentTitle ? <p className="text-metadata text-text-secondary">{t("detail.linkedDocument", { title: requirement.linkedMedicalDocumentTitle })}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Select
          label={t("detail.statusLabel")}
          value={requirement.status}
          onChange={(e) => onChangeStatus(e.target.value as TravelRequirementStatus)}
          options={REQUIREMENT_STATUSES.map((status) => ({ value: status, label: t(`requirementStatus.${status}`) }))}
        />
        <Button variant="secondary" size="sm" isLoading={isActing} onClick={onMarkVerified}>
          {t("detail.markVerified")}
        </Button>
        <Button variant="ghost" size="sm" isLoading={isActing} onClick={onDelete}>
          {t("detail.deleteRequirement")}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {documents.length > 0 ? (
          <Select
            label={t("detail.linkDocumentLabel")}
            value={requirement.linkedMedicalDocumentId ?? ""}
            onChange={(e) => onLinkExisting(e.target.value)}
            options={[{ value: "", label: t("detail.linkDocumentNone") }, ...documents.map((doc) => ({ value: doc.id, label: doc.title }))]}
          />
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="text-metadata text-text-primary"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUploadFile(file);
          }}
        />
      </div>
    </ContextSurface>
  );
}
