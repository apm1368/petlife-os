"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { NotificationCategory, NotificationPreferencesDto } from "@petlife/types";
import { notificationsService } from "@/services/notifications.service";

type Category = NotificationCategory;

const SECTIONS: { key: string; categories: Category[] }[] = [
  { key: "essential", categories: ["SECURITY" as Category, "SYSTEM" as Category] },
  { key: "health", categories: ["HEALTH" as Category] },
  { key: "bookings", categories: ["BOOKING" as Category, "SERVICE" as Category] },
  { key: "orders", categories: ["PAYMENT" as Category, "COMMERCE" as Category, "DELIVERY" as Category] },
  { key: "household", categories: ["HOUSEHOLD" as Category, "PET_ACCESS" as Category] },
  { key: "seller", categories: ["SELLER" as Category, "MARKETPLACE" as Category] },
  { key: "marketing", categories: ["MARKETING" as Category] },
];

const NON_TOGGLEABLE: ReadonlySet<string> = new Set(["SECURITY"]);

/**
 * Notification preferences (spec: category x channel grid under Profile/
 * Settings). EMAIL/PUSH are never rendered — they are reserved-but-
 * unimplemented channels (spec: "do not show toggles for channels that are
 * not implemented as though they work"). SECURITY shows as always-on text,
 * never a toggle, matching NotificationPreferenceService's own
 * non-suppressible enforcement on the backend.
 */
export function NotificationPreferencesView() {
  const t = useTranslations("notifications.preferencesPage");

  const [data, setData] = useState<NotificationPreferencesDto | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    setError(false);
    try {
      setData(await notificationsService.getPreferences());
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function isEnabled(category: Category, channel: "IN_APP" | "SMS"): boolean {
    return data?.preferences.find((p) => p.category === category && p.channel === channel)?.enabled ?? true;
  }

  function toggle(category: Category, channel: "IN_APP" | "SMS") {
    if (!data) return;
    const next = data.preferences.map((p) => (p.category === category && p.channel === channel ? { ...p, enabled: !p.enabled } : p));
    setData({ ...data, preferences: next });
    setSaved(false);
  }

  async function save() {
    if (!data) return;
    setSaving(true);
    setSaved(false);
    try {
      const updated = await notificationsService.updatePreferences({ preferences: data.preferences, quietHours: data.quietHours });
      setData(updated);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!data) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      {SECTIONS.map((section) => (
        <ContextSurface key={section.key} className="flex flex-col gap-3">
          <p className="text-body font-medium text-text-primary">{t(`sections.${section.key}`)}</p>
          {section.categories.map((category) =>
            NON_TOGGLEABLE.has(category) ? (
              <div key={category} className="flex items-center justify-between gap-3">
                <span className="text-metadata text-text-secondary">{t(`categories.${category}`)}</span>
                <span className="text-metadata text-text-secondary">{t("alwaysOn")}</span>
              </div>
            ) : (
              <div key={category} className="flex items-center justify-between gap-3">
                <span className="text-metadata text-text-secondary">{t(`categories.${category}`)}</span>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-metadata text-text-secondary">
                    <input type="checkbox" checked={isEnabled(category, "IN_APP")} onChange={() => toggle(category, "IN_APP")} />
                    {t("channels.IN_APP")}
                  </label>
                  <label className="flex items-center gap-1.5 text-metadata text-text-secondary">
                    <input type="checkbox" checked={isEnabled(category, "SMS")} onChange={() => toggle(category, "SMS")} />
                    {t("channels.SMS")}
                  </label>
                </div>
              </div>
            ),
          )}
        </ContextSurface>
      ))}

      <ContextSurface className="flex flex-col gap-3">
        <p className="text-body font-medium text-text-primary">{t("quietHours.title")}</p>
        <label className="flex items-center gap-1.5 text-metadata text-text-secondary">
          <input
            type="checkbox"
            checked={data.quietHours.enabled}
            onChange={() => {
              setData({ ...data, quietHours: { ...data.quietHours, enabled: !data.quietHours.enabled } });
              setSaved(false);
            }}
          />
          {t("quietHours.enable")}
        </label>
        {data.quietHours.enabled ? (
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-metadata text-text-secondary">
              {t("quietHours.start")}
              <input
                type="time"
                value={data.quietHours.startTime}
                onChange={(e) => {
                  setData({ ...data, quietHours: { ...data.quietHours, startTime: e.target.value } });
                  setSaved(false);
                }}
                className="h-9 rounded-md border border-border-strong bg-surface-elevated px-2 text-metadata text-text-primary"
              />
            </label>
            <label className="flex items-center gap-1.5 text-metadata text-text-secondary">
              {t("quietHours.end")}
              <input
                type="time"
                value={data.quietHours.endTime}
                onChange={(e) => {
                  setData({ ...data, quietHours: { ...data.quietHours, endTime: e.target.value } });
                  setSaved(false);
                }}
                className="h-9 rounded-md border border-border-strong bg-surface-elevated px-2 text-metadata text-text-primary"
              />
            </label>
            <span className="text-metadata text-text-secondary">{data.quietHours.timezone}</span>
          </div>
        ) : null}
      </ContextSurface>

      <div className="flex items-center gap-3">
        <Button isLoading={saving} onClick={save}>
          {t("save")}
        </Button>
        {saved ? <span className="text-metadata text-state-success">{t("saved")}</span> : null}
      </div>
    </div>
  );
}
