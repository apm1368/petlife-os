"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Download, Smartphone } from "@petlife/ui";
import { formatLocaleNumber } from "@/lib/i18n/format";
import type { RouteLocale } from "@/lib/i18n/config";
import { getPwaState, getServerPwaState, isStandalone, promptInstall, subscribePwa } from "./pwa-runtime";
import { ANDROID_APK, androidDownloadLinks } from "./app-links";

/** "1.0.14" in the locale's digits ("۱.۰.۱۴" in Persian). */
const localDigits = (text: string, locale: RouteLocale) => text.replace(/\d/g, (d) => formatLocaleNumber(Number(d), locale));

/**
 * The app in the site footer (owner, 2026-11-13): Android (the signed APK from our own domain) and iPhone/iPad (the
 * web app from Safari, steps on /app) side by side, store links once they exist, the browser's own install button
 * when Chrome/Edge offers one, and "All ways to install" (/app). Hidden inside the installed app.
 */
export function FooterAppInstall() {
  const t = useTranslations("pwa.footer");
  const locale = useLocale() as RouteLocale;
  const pwa = useSyncExternalStore(subscribePwa, getPwaState, getServerPwaState);
  const [installed, setInstalled] = useState(false);
  const downloads = androidDownloadLinks();
  const apk = downloads.find((d) => d.store === "apk");
  const stores = downloads.filter((d) => d.store !== "apk");

  useEffect(() => {
    setInstalled(isStandalone());
  }, []);

  if (installed || pwa.installed) return null;

  async function install() {
    const outcome = await promptInstall();
    if (outcome === "accepted") setInstalled(true);
  }

  return (
    <div className="opl-foot__app">
      <h2>{t("title")}</h2>
      <div className="opl-foot__app-entries">
        {apk ? (
          <a className="opl-foot__app-entry" href={apk.url} download>
            <Download size={20} aria-hidden="true" />
            <span>
              <strong>{t("androidEntry")}</strong>
              <small>{t("apkMeta", { version: localDigits(ANDROID_APK.version, locale), size: formatLocaleNumber(Math.round(ANDROID_APK.sizeBytes / 1024), locale) })}</small>
            </span>
          </a>
        ) : null}
        <Link className="opl-foot__app-entry" href={`/${locale}/app#ios`}>
          <Smartphone size={20} aria-hidden="true" />
          <span>
            <strong>{t("iosEntry")}</strong>
            <small>{t("iosEntryNote")}</small>
          </span>
        </Link>
      </div>
      {stores.length || pwa.installPrompt ? (
        <div className="opl-foot__app-actions">
          {pwa.installPrompt ? (
            <button type="button" className="opl-btn soft sm" onClick={() => void install()}>
              <Download size={17} aria-hidden="true" />
              {t("install")}
            </button>
          ) : null}
          {stores.map(({ store, url }) => (
            <a key={store} className="opl-btn line sm" href={url} rel="noopener" target="_blank">
              {t(`android.${store}`)}
            </a>
          ))}
        </div>
      ) : null}
      <Link className="opl-foot__app-all" href={`/${locale}/app`}>{t("allWays")}</Link>
    </div>
  );
}
