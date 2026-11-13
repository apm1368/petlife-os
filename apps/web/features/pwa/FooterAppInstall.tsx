"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download } from "@petlife/ui";
import { getPwaState, getServerPwaState, isIosSafari, isStandalone, promptInstall, subscribePwa } from "./pwa-runtime";
import { ANDROID_APK, androidDownloadLinks } from "./app-links";
import { useLocale, useTranslations } from "next-intl";
import { formatLocaleNumber } from "@/lib/i18n/format";
import type { RouteLocale } from "@/lib/i18n/config";

/** "1.0.14" in the locale's digits ("۱.۰.۱۴" in Persian). */
const localDigits = (text: string, locale: RouteLocale) => text.replace(/\d/g, (d) => formatLocaleNumber(Number(d), locale));

/**
 * "Install the app" in the site footer (owner, 2026-11-13). Chrome, Edge and Samsung Internet get the browser's own
 * install prompt; iPhone Safari gets the Add to Home Screen steps; other browsers get the menu steps. Hidden inside
 * the installed app. Android store / APK links appear next to it once they exist (app-links.ts).
 */
export function FooterAppInstall() {
  const t = useTranslations("pwa.footer");
  const locale = useLocale() as RouteLocale;
  const pwa = useSyncExternalStore(subscribePwa, getPwaState, getServerPwaState);
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState<"ios" | "other" | null>(null);
  const downloads = androidDownloadLinks();

  useEffect(() => {
    setInstalled(isStandalone());
  }, []);

  if (installed || pwa.installed) return null;

  async function install() {
    if (pwa.installPrompt) {
      const outcome = await promptInstall();
      if (outcome === "accepted") setInstalled(true);
      return;
    }
    setHelp(isIosSafari() ? "ios" : "other");
  }

  return (
    <div className="opl-foot__app">
      <h2>{t("title")}</h2>
      <div className="opl-foot__app-actions">
        <button type="button" className="opl-btn soft sm" onClick={() => void install()} aria-expanded={help !== null}>
          <Download size={17} aria-hidden="true" />
          {t("install")}
        </button>
        {downloads.map(({ store, url }) =>
          store === "apk" ? (
            <a key={store} className="opl-btn line sm" href={url} download>
              {t(`android.${store}`)}
            </a>
          ) : (
            <a key={store} className="opl-btn line sm" href={url} rel="noopener" target="_blank">
              {t(`android.${store}`)}
            </a>
          ),
        )}
      </div>
      {downloads.some((d) => d.store === "apk") ? (
        <div className="opl-foot__apk">
          <p>{t("apkMeta", { version: localDigits(ANDROID_APK.version, locale), size: formatLocaleNumber(Math.round(ANDROID_APK.sizeBytes / 1024), locale) })}</p>
          <p>
            SHA-256: <code dir="ltr">{ANDROID_APK.sha256}</code>
          </p>
          <p>{t("apkHint")}</p>
        </div>
      ) : null}
      {help ? <p className="opl-foot__app-help" role="status">{t(help === "ios" ? "iosSteps" : "otherSteps")}</p> : null}
    </div>
  );
}
