"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { clinicCustomerExtrasService, type SharedClinicNote } from "@/services/clinic-customer-extras.service";

type LoadFailure = "loadFailed" | "offline" | "noAccess";

export function MemberClinicNotesView() {
  const t = useTranslations("clinicCustomerExtras");
  const locale = useLocale();
  const [rows, setRows] = useState<SharedClinicNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailure(null);
    clinicCustomerExtrasService.sharedNotes(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setRows(value);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          setFailure("noAccess");
        } else if (typeof navigator !== "undefined" && !navigator.onLine) {
          setFailure("offline");
        } else {
          setFailure("loadFailed");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);

  const dateLocale = locale === "fa" ? "fa-IR" : locale;
  const retry = () => setRevision((current) => current + 1);

  return (
    <div className="space-y-5">
      <h1 className="text-page-title">{t("sharedNotesTitle")}</h1>
      <p>{t("sharedNotesIntro")}</p>
      <p>{t("notesLimit")}</p>
      <Button variant="secondary" onClick={retry} disabled={loading}>{t("refresh")}</Button>
      {failure ? (
        <div>
          <p role="alert">{t(failure)}</p>
          <Button onClick={retry}>{t("retry")}</Button>
        </div>
      ) : loading ? (
        <p role="status">{t("loading")}</p>
      ) : rows.length === 0 ? (
        <p>{t("emptyShared")}</p>
      ) : (
        rows.map((note) => (
          <ContextSurface key={note.id} className="space-y-2">
            <h2 className="text-section-title">{note.clinic.name}</h2>
            <p className="whitespace-pre-wrap break-words">{note.body}</p>
            <time dateTime={note.createdAt}>
              {new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(note.createdAt))}
            </time>
          </ContextSurface>
        ))
      )}
    </div>
  );
}
