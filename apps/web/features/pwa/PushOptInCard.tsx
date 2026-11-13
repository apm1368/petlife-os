"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bell, ContextSurface, Send, X } from "@petlife/ui";
import { useSessionStore } from "@/stores/session-store";
import { pushService, type PushConfigDto, type PushDeviceDto } from "@/services/push.service";
import { currentSubscription, disablePush, enablePush, pushAvailability, type PushAvailability } from "./push-client";
import "./pwa.css";

/**
 * Web Push opt-in for this browser / installed app, at the top of notification settings: turn on, send a test,
 * turn off, and remove the member's other devices. Category choices for push live in the grid below (PUSH column).
 */
export function PushOptInCard() {
  const t = useTranslations("notifications.preferencesPage.push");
  const locale = useLocale();
  const userId = useSessionStore((s) => s.user?.id ?? null);
  const [config, setConfig] = useState<PushConfigDto | null>(null);
  const [state, setState] = useState<PushAvailability | null>(null);
  const [devices, setDevices] = useState<PushDeviceDto[]>([]);
  const [thisEndpointId, setThisEndpointId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const [cfg, availability] = await Promise.all([pushService.config().catch(() => ({ enabled: false, publicKey: null })), pushAvailability(userId)]);
    setConfig(cfg);
    setState(availability);
    if (cfg.enabled) {
      const list = await pushService.devices().catch(() => ({ devices: [] }));
      setDevices(list.devices);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    // Which listed device is this browser: the API returns the row for the endpoint we just synced.
    if (state !== "on") return setThisEndpointId(null);
    void currentSubscription().then(async (subscription) => {
      if (!subscription) return;
      const row = await pushService.subscribe({ endpoint: subscription.endpoint, keys: { p256dh: subscription.toJSON().keys?.p256dh ?? "", auth: subscription.toJSON().keys?.auth ?? "" } }).catch(() => null);
      setThisEndpointId(row?.id ?? null);
    });
  }, [state]);

  async function run(work: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await work();
    } catch {
      setMessage({ kind: "error", text: t("error") });
    } finally {
      setBusy(false);
    }
  }

  const turnOn = () =>
    run(async () => {
      if (!userId || !config?.publicKey) return;
      setState(await enablePush(userId, config.publicKey));
      const list = await pushService.devices().catch(() => ({ devices: [] }));
      setDevices(list.devices);
    });

  const turnOff = () =>
    run(async () => {
      await disablePush();
      setState("off");
      const list = await pushService.devices().catch(() => ({ devices: [] }));
      setDevices(list.devices);
    });

  const sendTest = () =>
    run(async () => {
      const subscription = await currentSubscription();
      if (!subscription) return setState("off");
      const result = await pushService.test(subscription.endpoint, locale);
      setMessage(result.sent > 0 ? { kind: "ok", text: t("testSent") } : { kind: "error", text: t("testFailed") });
    });

  const removeDevice = (id: string) =>
    run(async () => {
      await pushService.remove(id);
      setDevices((list) => list.filter((d) => d.id !== id));
    });

  if (!userId || !config || !state) return null;

  const others = devices.filter((d) => d.id !== thisEndpointId);
  const date = (iso: string) => new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : locale, { dateStyle: "medium" }).format(new Date(iso));

  return (
    <ContextSurface className="opl-push flex flex-col gap-3">
      <div className="opl-push__head">
        <span className="opl-push__icon" aria-hidden="true"><Bell size={20} /></span>
        <div>
          <h2 id="opl-push-title" className="text-body font-medium text-text-primary">{t("title")}</h2>
          <p className="text-metadata text-text-secondary">{t("intro")}</p>
        </div>
      </div>

      {!config.enabled ? (
        <p className="text-metadata text-text-secondary" role="note">{t("notConfigured")}</p>
      ) : state === "unsupported" || state === "ios-install" || state === "denied" ? (
        <p className="opl-push__note" role="note">{t(state === "ios-install" ? "iosInstall" : state)}</p>
      ) : (
        <>
          <p className="opl-push__state" data-on={state === "on"}>{t(state === "on" ? "on" : "off")}</p>
          <div className="opl-push__actions">
            {state === "on" ? (
              <>
                <button type="button" className="opl-btn primary sm" onClick={sendTest} disabled={busy}>
                  <Send size={17} aria-hidden="true" />
                  {t("test")}
                </button>
                <button type="button" className="opl-btn line sm" onClick={turnOff} disabled={busy}>{t("disable")}</button>
              </>
            ) : (
              <button type="button" className="opl-btn primary sm" onClick={turnOn} disabled={busy}>
                <Bell size={17} aria-hidden="true" />
                {t("enable")}
              </button>
            )}
          </div>
        </>
      )}
      {message ? (
        <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-metadata text-state-urgent" : "text-metadata text-state-success"}>
          {message.text}
        </p>
      ) : null}

      {config.enabled && others.length > 0 ? (
        <div className="opl-push__devices">
          <h3 className="text-metadata font-medium text-text-primary">{t("devices")}</h3>
          <ul>
            {others.map((device) => {
              const label = device.deviceLabel ?? t("unknownDevice");
              return (
                <li key={device.id}>
                  <span>
                    <strong>{label}</strong>
                    <small>{t("added", { date: date(device.createdAt) })}</small>
                  </span>
                  <button type="button" className="opl-push__remove" onClick={() => removeDevice(device.id)} disabled={busy} aria-label={t("removeLabel", { device: label })}>
                    <X size={16} aria-hidden="true" />
                    <span>{t("remove")}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </ContextSurface>
  );
}
