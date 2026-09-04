"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { MedicalDocumentType, SourceType, type MedicalDocumentDto } from "@petlife/types";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { ApiError } from "@/lib/api/client";

/** spec: "private medical documents must never be publicly exposed" — download always goes through a freshly-minted signed URL, never a stored/cached link. */
export function HealthDocumentsView({ petId }: { petId: string }) {
  const t = useTranslations("healthAdvanced");
  const tCommon = useTranslations("common");

  const [documents, setDocuments] = useState<MedicalDocumentDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState<MedicalDocumentType>(MedicalDocumentType.OTHER);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setError(null);
    try {
      setDocuments(await healthAdvancedService.listDocuments(petId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  async function handleUpload(): Promise<void> {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !title.trim()) return;
    setIsUploading(true);
    setError(null);
    try {
      const target = await healthAdvancedService.requestDocumentUpload(petId, { contentType: file.type, fileSizeBytes: file.size });
      await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: file });
      await healthAdvancedService.createDocument(petId, { key: target.key, documentType, title: title.trim(), mimeType: file.type, fileSizeBytes: file.size });
      setTitle("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDownload(documentId: string): Promise<void> {
    try {
      const { downloadUrl } = await healthAdvancedService.downloadDocument(petId, documentId);
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  if (error && !documents) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!documents) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("documents.title")}</h1>

      <ContextSurface className="flex flex-col gap-3">
        <Input label={t("documents.titleLabel")} value={title} onChange={(e) => setTitle(e.target.value)} />
        <Select
          label={t("documents.documentType")}
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value as MedicalDocumentType)}
          options={Object.values(MedicalDocumentType).map((type) => ({ value: type, label: type }))}
        />
        <input ref={fileInputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="text-body text-text-primary" />
        {error ? <p className="text-body text-state-attention">{error}</p> : null}
        <Button variant="primary" isLoading={isUploading} onClick={handleUpload} disabled={!title.trim()}>
          {isUploading ? t("documents.uploading") : t("documents.upload")}
        </Button>
      </ContextSurface>

      {documents.length === 0 ? (
        <EmptyState title={t("documents.empty")} />
      ) : (
        <div className="flex flex-col gap-3">
          {documents.map((doc) => (
            <ContextSurface key={doc.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-body text-text-primary">{doc.title}</span>
                <StatusLabel tone={doc.sourceType === SourceType.PROVIDER || doc.sourceType === SourceType.CLINIC ? "success" : "neutral"}>
                  {doc.sourceType === SourceType.PROVIDER || doc.sourceType === SourceType.CLINIC ? t("documents.provenanceProvider") : t("documents.provenanceOwner")}
                </StatusLabel>
              </div>
              <span className="text-metadata text-text-secondary">{doc.documentType}</span>
              <Button variant="secondary" size="sm" onClick={() => handleDownload(doc.id)}>
                {t("documents.download")}
              </Button>
            </ContextSurface>
          ))}
        </div>
      )}
    </div>
  );
}
