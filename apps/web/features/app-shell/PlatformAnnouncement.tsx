"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@petlife/ui";
import { platformSettingsService, type PublicPlatformSettings } from "@/services/platform-settings.service";

/** Only the public registry reaches this component; admin/internal values are never requested. */
export function PlatformAnnouncement() {
  const locale = useLocale(),
    t = useTranslations("platformAnnouncement");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading"),
    [notice, setNotice] = useState<PublicPlatformSettings["platform.announcement"]>(null),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    platformSettingsService
      .publicSettings(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setNotice(data["platform.announcement"]);
          setState("ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("error");
      });
    return () => controller.abort();
  }, [revision]);
  if (state === "loading")
    return (
      <span className="sr-only" role="status">
        {t("loading")}
      </span>
    );
  if (state === "error")
    return (
      <aside
        aria-label={t("label")}
        className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-border-subtle bg-surface-elevated p-3 text-metadata"
      >
        <p role="alert">{t("failed")}</p>
        <Button variant="ghost" size="sm" onClick={() => setRevision((value) => value + 1)}>
          {t("retry")}
        </Button>
      </aside>
    );
  if (!notice) return null;
  const language = notice[locale as "fa" | "en"]?.trim()
    ? locale
    : Object.keys(notice).find((key) => notice[key as "fa" | "en"]?.trim());
  const text = language ? notice[language as "fa" | "en"] : null;
  return text ? (
    <aside
      aria-label={t("label")}
      className="mb-4 min-w-0 break-words rounded-md border border-border-subtle bg-surface-elevated p-4 text-body"
    >
      <p dir="auto" lang={language} className="whitespace-pre-wrap">
        {text}
      </p>
    </aside>
  ) : null;
}
