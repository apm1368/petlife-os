"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import type { MediaAssetDto, PaginatedDto } from "@petlife/types";
import { adminContentService } from "@/services/admin-content.service";

function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Media library (spec: "upload, metadata, alt text, dimensions, MIME type, file size... safe URL delivery"). Two-step upload mirrors AdminMediaService's own PetsController-precedent exactly: request a signed target, PUT the bytes, then confirm. */
export function AdminContentMediaView() {
  const t = useTranslations("admin.content.media");
  const [page, setPage] = useState<PaginatedDto<MediaAssetDto> | null>(null);
  const [error, setError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setError(false);
    try {
      setPage(await adminContentService.listMedia());
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const target = await adminContentService.requestMediaUpload(file.type);
      await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: file });
      const dimensions = await readImageDimensions(file);
      await adminContentService.confirmMediaUpload({
        key: target.key,
        url: target.publicUrl,
        mimeType: file.type,
        fileSizeBytes: file.size,
        widthPx: dimensions?.width,
        heightPx: dimensions?.height,
      });
      await load();
    } catch {
      setUploadError(t("uploadFailed"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function setAltText(id: string, altText: string) {
    await adminContentService.updateMediaMetadata(id, { altText });
    await load();
  }

  async function disable(id: string) {
    await adminContentService.disableMedia(id);
    await load();
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} disabled={uploading} />
        <Button type="button" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
          {uploading ? t("uploading") : t("upload")}
        </Button>
      </div>
      {uploadError ? <span className="text-metadata text-state-urgent">{uploadError}</span> : null}

      {!page ? (
        <Skeleton className="h-64 w-full" aria-label={t("loading")} />
      ) : page.items.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {page.items.map((asset) => (
            <ContextSurface key={asset.id} className="flex flex-col gap-2">
              <img src={asset.url} alt={asset.altText ?? ""} className="h-32 w-full rounded-md object-cover" />
              <Input label={t("altText")} defaultValue={asset.altText ?? ""} onBlur={(e) => setAltText(asset.id, e.target.value)} />
              <span className="text-metadata text-text-secondary">{asset.mimeType} · {Math.round(asset.fileSizeBytes / 1024)} KB</span>
              {asset.disabledAt ? <span className="text-metadata text-state-urgent">{t("disabled")}</span> : <Button size="sm" variant="secondary" onClick={() => disable(asset.id)}>{t("disable")}</Button>}
              <code className="truncate text-metadata text-text-secondary" title={asset.id}>{asset.id}</code>
            </ContextSurface>
          ))}
        </div>
      )}
    </div>
  );
}
