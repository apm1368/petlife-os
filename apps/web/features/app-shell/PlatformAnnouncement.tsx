"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@petlife/ui";
import { platformSettingsService, type PublicPlatformSettings } from "@/services/platform-settings.service";

const TONE: Record<string, string> = {
  info: "border-border-subtle bg-surface-elevated",
  success: "border-state-success/40 bg-state-success/10",
  warning: "border-state-attention/40 bg-state-attention/10",
  urgent: "border-state-urgent/40 bg-state-urgent/10",
};

/**
 * Only the public registry reaches this component; admin/internal values are never requested.
 * `surface="public"` is the visitor-facing placement: it renders only when admins chose the "everyone" audience.
 */
export function PlatformAnnouncement({ surface = "member" }: { surface?: "member" | "public" }) {
  const locale = useLocale(),
    t = useTranslations("platformAnnouncement");
  const [state, setState] = useState<"loading" | "ready" | "error">("loading"),
    [notice, setNotice] = useState<PublicPlatformSettings["platform.announcement"]>(null),
    [extra, setExtra] = useState<{ tone: string; link: string | null; audience: string }>({ tone: "info", link: null, audience: "members" }),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    platformSettingsService
      .publicSettings(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setNotice(data["platform.announcement"]);
          setExtra({ tone: data["platform.announcementTone"] ?? "info", link: data["platform.announcementLink"] ?? null, audience: data["platform.announcementAudience"] ?? "members" });
          setState("ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("error");
      });
    return () => controller.abort();
  }, [revision]);
  if (surface === "public" && (state !== "ready" || extra.audience !== "everyone")) return null;
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
  type Lang = "fa" | "en" | "de" | "es" | "ar" | "nl";
  const byLang = notice as Partial<Record<Lang, string>>;
  const language = byLang[locale as Lang]?.trim()
    ? (locale as Lang)
    : (["en", "fa", "de", "es", "ar", "nl"] as const).find((key) => byLang[key]?.trim());
  const text = language ? byLang[language] : null;
  const href = extra.link ? (extra.link.startsWith("/") ? `/${locale}${extra.link}` : extra.link) : null;
  return text ? (
    <aside
      aria-label={t("label")}
      className={`mb-4 flex min-w-0 flex-wrap items-center gap-3 break-words rounded-md border p-4 text-body ${TONE[extra.tone] ?? TONE.info}`}
    >
      <p dir="auto" lang={language} className="min-w-0 flex-1 whitespace-pre-wrap">
        {text}
      </p>
      {href ? (
        <a className="font-semibold underline" href={href} {...(href.startsWith("http") ? { rel: "noopener noreferrer", target: "_blank" } : {})}>
          {t("more")}
        </a>
      ) : null}
    </aside>
  ) : null;
}
