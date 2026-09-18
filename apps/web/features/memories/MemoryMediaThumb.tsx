"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { PetMemoryDto } from "@petlife/types";
import { memoriesService } from "@/services/memories.service";

/**
 * Renders a memory's first image. A PRIVATE memory (the default, and the
 * only kind the diary creates) never carries a plain URL in its DTO —
 * Handoff 20 deliberately removed that — so its thumbnail has to be minted
 * per-request through the signed download endpoint. A memory with no media
 * falls back to a neutral placeholder rather than a broken image.
 */
export function MemoryMediaThumb({ petId, memory, className }: { petId: string; memory: PetMemoryDto; className?: string }) {
  const t = useTranslations("memories");
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  const publicUrl = memory.mediaUrls[0] ?? null;
  const hasMedia = memory.mediaObjectKeys.length > 0;
  const needsSignedUrl = hasMedia && !publicUrl;

  useEffect(() => {
    if (!needsSignedUrl) {
      setSignedUrl(null);
      return;
    }
    let cancelled = false;
    void memoriesService
      .getMediaDownload(petId, memory.id, 0)
      .then((target) => {
        if (!cancelled) setSignedUrl(target.downloadUrl);
      })
      // A failed thumbnail must never break the list — the placeholder stands in.
      .catch(() => {
        if (!cancelled) setSignedUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [petId, memory.id, needsSignedUrl]);

  const url = publicUrl ?? signedUrl;
  const alt = memory.title ?? new Date(memory.occurredAt).toLocaleDateString();

  if (!url) {
    return (
      <div className={`flex items-center justify-center bg-surface-muted ${className ?? ""}`} aria-label={t("list.noPhoto")}>
        <span className="text-metadata text-text-secondary">{t("list.noPhoto")}</span>
      </div>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={className} />;
}
