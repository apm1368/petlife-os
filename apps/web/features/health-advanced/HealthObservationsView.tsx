"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { ObservationCategory, type PetObservationDto } from "@petlife/types";
import { petObservationService } from "@/services/pet-observation.service";
import { ApiError } from "@/lib/api/client";

/** spec: "these are OWNER OBSERVATIONS, not diagnoses" — the UI labels every entry as such and never offers a "diagnosis" field. */
export function HealthObservationsView({ petId }: { petId: string }) {
  const t = useTranslations("healthAdvanced");
  const tCommon = useTranslations("common");

  const [observations, setObservations] = useState<PetObservationDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<ObservationCategory>(ObservationCategory.OTHER);
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setError(null);
    try {
      setObservations(await petObservationService.list(petId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  async function handleSave(): Promise<void> {
    if (!description.trim()) return;
    setIsSaving(true);
    setError(null);
    try {
      const file = fileInputRef.current?.files?.[0];
      let mediaKey: string | undefined;
      let mediaType: string | undefined;
      let mediaMimeType: string | undefined;
      if (file) {
        const target = await petObservationService.requestMediaUpload(petId, { contentType: file.type, fileSizeBytes: file.size });
        await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: file });
        mediaKey = target.key;
        mediaType = file.type.startsWith("video") ? "VIDEO" : "PHOTO";
        mediaMimeType = file.type;
      }
      await petObservationService.create(petId, { category, description: description.trim(), observedAt: new Date().toISOString(), mediaKey, mediaType, mediaMimeType });
      setDescription("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setIsSaving(false);
    }
  }

  if (error && !observations) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!observations) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("observations.title")}</h1>

      <ContextSurface className="flex flex-col gap-3">
        <p className="text-metadata text-state-attention">{t("observations.disclaimer")}</p>
        <Select
          label={t("observations.category")}
          value={category}
          onChange={(e) => setCategory(e.target.value as ObservationCategory)}
          options={Object.values(ObservationCategory).map((c) => ({ value: c, label: c }))}
        />
        <label htmlFor="observation-description" className="text-metadata text-text-secondary">
          {t("observations.description")}
        </label>
        <textarea
          id="observation-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="rounded-md border border-border-strong bg-surface-elevated p-3 text-body text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        />
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" className="text-body text-text-primary" />
        {error ? <p className="text-body text-state-attention">{error}</p> : null}
        <Button variant="primary" isLoading={isSaving} onClick={handleSave} disabled={!description.trim()}>
          {t("observations.save")}
        </Button>
      </ContextSurface>

      {observations.length === 0 ? (
        <EmptyState title={t("observations.empty")} />
      ) : (
        <div className="flex flex-col gap-3">
          {observations.map((obs) => (
            <ContextSurface key={obs.id} className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <StatusLabel tone="neutral">{obs.category}</StatusLabel>
                <span className="text-metadata text-text-secondary">{new Date(obs.observedAt).toLocaleDateString()}</span>
              </div>
              <p className="text-body text-text-primary">{obs.description}</p>
            </ContextSurface>
          ))}
        </div>
      )}
    </div>
  );
}
