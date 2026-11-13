"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Skeleton } from "@petlife/ui";
import type { MedicalDocumentDto } from "@petlife/types";
import { healthAdvancedService } from "@/services/health-advanced.service";
import { documentTypeLabel } from "@/features/health-advanced/document-labels";
import { useInstantFormat } from "@/lib/date/use-instant-format";
import type { RouteLocale } from "@/lib/i18n/config";

/** The API accepts at most this many documents per booking. */
export const MAX_SHARED_DOCUMENTS = 20;

/**
 * The owner's own health documents, offered for this vet booking only. Nothing is ticked by default, and
 * ticking never changes a document's own visibility: the vet assigned to the booking can open exactly the
 * ticked ones while the booking's access lasts. Documents a clinic wrote are already in its record and
 * are not offered here.
 */
export function BookingDocumentPicker({ petId, selected, onChange }: { petId: string; selected: string[]; onChange: (ids: string[]) => void }) {
  const t = useTranslations("bookingFlow.shareDocuments");
  const locale = useLocale() as RouteLocale;
  const fmt = useInstantFormat();
  const [documents, setDocuments] = useState<MedicalDocumentDto[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    setDocuments(null);
    setFailed(false);
    healthAdvancedService
      .listDocuments(petId)
      .then((list) => {
        if (current) setDocuments(list.filter((d) => !d.voidedAt && d.sourceType !== "PROVIDER" && d.sourceType !== "CLINIC" && d.visibility !== "PROVIDER_SHARED"));
      })
      .catch(() => {
        if (!current) return;
        setDocuments([]);
        setFailed(true);
      });
    return () => {
      current = false;
    };
  }, [petId]);

  const toggle = (id: string, checked: boolean) => onChange(checked ? [...selected, id] : selected.filter((x) => x !== id));
  const full = selected.length >= MAX_SHARED_DOCUMENTS;

  return (
    <fieldset className="flex flex-col gap-2 rounded-md border border-border-subtle p-3">
      <legend className="px-1 font-bold">{t("title")}</legend>
      <p className="text-sm text-text-secondary">{t("description")}</p>
      {documents === null ? (
        <Skeleton className="h-12 w-full" aria-label={t("loading")} />
      ) : failed ? (
        <p role="status" className="text-sm text-state-attention">{t("loadFailed")}</p>
      ) : documents.length === 0 ? (
        <p className="text-sm text-text-secondary">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {documents.map((d) => {
            const checked = selected.includes(d.id);
            return (
              <li key={d.id}>
                <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1" checked={checked} disabled={!checked && full} onChange={(e) => toggle(d.id, e.target.checked)} />
                  <span className="flex min-w-0 flex-col">
                    <span className="break-words" dir="auto">{d.title}</span>
                    <span className="text-xs text-text-secondary">{[documentTypeLabel(d.documentType, locale), fmt.date(d.recordedAt ?? d.uploadedAt)].join(" · ")}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {full ? <p role="status" className="text-xs text-text-secondary">{t("limit", { max: MAX_SHARED_DOCUMENTS })}</p> : null}
    </fieldset>
  );
}
