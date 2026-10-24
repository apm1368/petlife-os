"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Skeleton } from "@petlife/ui";
import type { NotificationCategory, NotificationPreferencesDto } from "@petlife/types";
import { notificationsService } from "@/services/notifications.service";

type Category = NotificationCategory;
type Channel = "IN_APP" | "SMS";

const SECTIONS: { key: string; categories: Category[] }[] = [
  { key: "essential", categories: ["SECURITY" as Category, "SYSTEM" as Category] },
  { key: "health", categories: ["HEALTH" as Category] },
  { key: "bookings", categories: ["BOOKING" as Category, "SERVICE" as Category] },
  { key: "orders", categories: ["PAYMENT" as Category, "COMMERCE" as Category, "DELIVERY" as Category] },
  { key: "household", categories: ["HOUSEHOLD" as Category, "PET_ACCESS" as Category] },
  { key: "membership", categories: ["SUBSCRIPTION" as Category, "SUPPORT" as Category] },
  { key: "travel", categories: ["TRAVEL" as Category, "INSURANCE" as Category] },
  { key: "community", categories: ["LOST_PET" as Category, "ANIMAL_SUPPORT" as Category, "COMMUNITY" as Category] },
  { key: "seller", categories: ["SELLER" as Category, "MARKETPLACE" as Category] },
  { key: "marketing", categories: ["MARKETING" as Category] },
];

const CHANNELS: Channel[] = ["IN_APP", "SMS"];

/**
 * Notification preferences — a category × channel grid whose every control
 * the backend actually honours (in-app suppression, SMS suppression,
 * quiet hours for SMS). EMAIL/PUSH are never rendered: they aren't
 * implemented. Required categories (security) show as always-on text;
 * marketing stays off until the Privacy Center consent allows it; a channel
 * that doesn't really deliver yet (SMS in sandbox) says so.
 */
export function NotificationPreferencesView() {
  const t = useTranslations("notifications.preferencesPage");
  const locale = useLocale();

  const [data, setData] = useState<NotificationPreferencesDto | null>(null);
  const [initial, setInitial] = useState<string>("");
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(false);

  async function load() {
    setError(false);
    try {
      const prefs = await notificationsService.getPreferences();
      setData(prefs);
      setInitial(JSON.stringify({ p: prefs.preferences, q: prefs.quietHours }));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const required = useMemo(() => new Set<string>((data?.requiredCategories as string[] | undefined) ?? ["SECURITY"]), [data]);
  const dirty = data ? JSON.stringify({ p: data.preferences, q: data.quietHours }) !== initial : false;

  function channelState(channel: Channel): "LIVE" | "SANDBOX" | "NOT_CONFIGURED" {
    return (data?.channels?.find((c) => (c.channel as string) === channel)?.delivery as "LIVE" | "SANDBOX" | "NOT_CONFIGURED" | undefined) ?? "LIVE";
  }

  function isEnabled(category: Category, channel: Channel): boolean {
    return data?.preferences.find((p) => p.category === category && p.channel === channel)?.enabled ?? true;
  }

  function toggle(category: Category, channel: Channel) {
    if (!data) return;
    const exists = data.preferences.some((p) => p.category === category && p.channel === channel);
    const next = exists
      ? data.preferences.map((p) => (p.category === category && p.channel === channel ? { ...p, enabled: !p.enabled } : p))
      : [...data.preferences, { category, channel: channel as never, enabled: false }];
    setData({ ...data, preferences: next });
    setSaved(false);
  }

  async function save() {
    if (!data) return;
    setSaving(true);
    setSaved(false);
    setSaveError(false);
    try {
      const updated = await notificationsService.updatePreferences({
        // Required categories and marketing-without-consent are never sent as changes; the server enforces both anyway.
        preferences: data.preferences.filter((p) => !required.has(p.category as string) && !((p.category as string) === "MARKETING" && data.marketingConsentGranted === false)),
        quietHours: data.quietHours,
      });
      setData(updated);
      setInitial(JSON.stringify({ p: updated.preferences, q: updated.quietHours }));
      setSaved(true);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!data) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  const marketingLocked = data.marketingConsentGranted === false;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        <p className="mt-1 text-body text-text-secondary">{t("intro")}</p>
      </div>

      {SECTIONS.map((section) => (
        <ContextSurface key={section.key} className="flex flex-col gap-3">
          <h2 className="text-body font-medium text-text-primary">{t(`sections.${section.key}`)}</h2>
          {section.key === "marketing" && marketingLocked ? (
            <p className="text-metadata text-text-secondary">
              {t("marketingNeedsConsent")}{" "}
              <Link className="text-brand-natural underline" href={`/${locale}/profile/privacy`}>{t("marketingManage")}</Link>
            </p>
          ) : null}
          {section.key === "essential" ? <p className="text-metadata text-text-secondary">{t("requiredNote")}</p> : null}
          {section.categories.map((category) =>
            required.has(category as string) ? (
              <div key={category} className="notification-pref-row">
                <span className="text-metadata text-text-primary">{t(`categories.${category}`)}</span>
                <span className="text-metadata text-text-secondary">{t("alwaysOn")}</span>
              </div>
            ) : (
              <fieldset key={category} className="notification-pref-row">
                <legend className="text-metadata text-text-primary">{t(`categories.${category}`)}</legend>
                <div className="notification-pref-row__channels">
                  {CHANNELS.map((channel) => (
                    <label key={channel} className="flex items-center gap-1.5 text-metadata text-text-secondary">
                      <input type="checkbox" checked={isEnabled(category, channel)} disabled={(category as string) === "MARKETING" && marketingLocked} onChange={() => toggle(category, channel)} />
                      {t(`channels.${channel}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
            ),
          )}
        </ContextSurface>
      ))}

      {channelState("SMS") !== "LIVE" ? (
        <p className="text-metadata text-text-secondary" role="note">
          {t("channels.SMS")}: {t(`channelState.${channelState("SMS")}`)}
        </p>
      ) : null}

      <ContextSurface className="flex flex-col gap-3">
        <h2 className="text-body font-medium text-text-primary">{t("quietHours.title")}</h2>
        <p className="text-metadata text-text-secondary">{t("quietHoursHint")}</p>
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
                dir="ltr"
                value={data.quietHours.startTime}
                onChange={(e) => {
                  setData({ ...data, quietHours: { ...data.quietHours, startTime: e.target.value } });
                  setSaved(false);
                }}
                className="h-11 rounded-md border border-border-strong bg-surface-elevated px-2 text-metadata text-text-primary"
              />
            </label>
            <label className="flex items-center gap-1.5 text-metadata text-text-secondary">
              {t("quietHours.end")}
              <input
                type="time"
                dir="ltr"
                value={data.quietHours.endTime}
                onChange={(e) => {
                  setData({ ...data, quietHours: { ...data.quietHours, endTime: e.target.value } });
                  setSaved(false);
                }}
                className="h-11 rounded-md border border-border-strong bg-surface-elevated px-2 text-metadata text-text-primary"
              />
            </label>
            <span className="text-metadata text-text-secondary" dir="ltr">
              {data.quietHours.timezone}
            </span>
          </div>
        ) : null}
      </ContextSurface>

      <div className="notification-pref-save">
        {saveError ? <p role="alert" className="text-body text-state-urgent">{t("saveError")}</p> : null}
        <div className="flex items-center gap-3">
          <Button isLoading={saving} disabled={!dirty} onClick={save}>
            {t("save")}
          </Button>
          {saved && !dirty ? (
            <span role="status" className="text-metadata text-state-success">{t("saved")}</span>
          ) : dirty ? (
            <span className="text-metadata text-text-secondary">{t("unsaved")}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
