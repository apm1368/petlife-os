"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Copy, Download, Laptop, Share, Smartphone, SquarePlus } from "@petlife/ui";
import type { RouteLocale } from "@/lib/i18n/config";
import { formatLocaleNumber } from "@/lib/i18n/format";
import { ANDROID_APK, androidDownloadLinks } from "./app-links";
import { detectPlatform, type PlatformInfo } from "./platform";
import { getPwaState, getServerPwaState, isStandalone, promptInstall, subscribePwa } from "./pwa-runtime";
import "./app-install.css";

const localDigits = (text: string, locale: RouteLocale) => text.replace(/\d/g, (d) => formatLocaleNumber(Number(d), locale));

/**
 * /app — every way to get opetlife on a device (owner, 2026-11-13): the signed Android APK, the iPhone/iPad web app
 * (Safari → Add to Home Screen) and the desktop install. All three are always shown; the one for this device is
 * highlighted and listed first. Inside the installed app the install steps give way to "already installed".
 */
export function AppInstallView({ locale }: { locale: RouteLocale }) {
  const t = useTranslations("pwa.appPage");
  const tf = useTranslations("pwa.footer");
  const pwa = useSyncExternalStore(subscribePwa, getPwaState, getServerPwaState);
  const [device, setDevice] = useState<PlatformInfo | null>(null);
  const [installed, setInstalled] = useState(false);
  const [copied, setCopied] = useState(false);
  const downloads = androidDownloadLinks();
  const apk = downloads.find((d) => d.store === "apk");
  const stores = downloads.filter((d) => d.store !== "apk");

  useEffect(() => {
    setDevice(detectPlatform(navigator.userAgent, navigator.maxTouchPoints));
    setInstalled(isStandalone());
  }, []);

  const current = device?.platform;
  const done = installed || pwa.installed;
  const order = (platform: "android" | "ios" | "desktop") => (current === platform ? -1 : 0);
  const badge = (platform: "android" | "ios" | "desktop") =>
    current === platform ? <span className="opl-app__badge">{t("yourDevice")}</span> : null;

  async function copyLink() {
    const url = `${window.location.origin}/${locale}/app#ios`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt(t("ios.copy"), url);
    }
  }

  return (
    <div className="opl-app">
      <header className="opl-app__head">
        <p className="opl-app__eyebrow">{t("eyebrow")}</p>
        <h1>{t("title")}</h1>
        <p>{t("lede")}</p>
        {done ? <p className="opl-app__installed" role="status">{t("installed")}</p> : null}
      </header>

      <div className="opl-app__grid">
        <section id="android" className="opl-app__card" data-current={current === "android"} style={{ order: order("android") }} aria-labelledby="opl-app-android">
          <div className="opl-app__card-head">
            <span className="opl-app__icon" aria-hidden="true"><Smartphone size={22} /></span>
            <h2 id="opl-app-android">{t("android.title")}</h2>
            {badge("android")}
          </div>
          <p>{t("android.lead")}</p>
          {apk ? (
            <>
              <a className="opl-btn primary" href={apk.url} download>
                <Download size={18} aria-hidden="true" />
                {t("android.download")}
              </a>
              <p className="opl-app__meta">{t("android.meta", { version: localDigits(ANDROID_APK.version, locale), size: formatLocaleNumber(Math.round(ANDROID_APK.sizeBytes / 1024), locale) })}</p>
              <p className="opl-app__meta">
                {t("android.sha")}: <code dir="ltr">{ANDROID_APK.sha256}</code>
              </p>
              <p className="opl-app__hint">{tf("apkHint")}</p>
            </>
          ) : null}
          {current === "android" && pwa.installPrompt && !done ? (
            <button type="button" className="opl-btn line sm" onClick={() => void promptInstall().then((outcome) => outcome === "accepted" && setInstalled(true))}>
              {t("android.webInstall")}
            </button>
          ) : null}
          {stores.length ? (
            <div className="opl-app__stores">
              {stores.map(({ store, url }) => (
                <a key={store} className="opl-btn line sm" href={url} rel="noopener" target="_blank">{tf(`android.${store}`)}</a>
              ))}
            </div>
          ) : null}
        </section>

        <section id="ios" className="opl-app__card" data-current={current === "ios"} style={{ order: order("ios") }} aria-labelledby="opl-app-ios">
          <div className="opl-app__card-head">
            <span className="opl-app__icon" aria-hidden="true"><Smartphone size={22} /></span>
            <h2 id="opl-app-ios">{t("ios.title")}</h2>
            {badge("ios")}
          </div>
          <p>{t("ios.lead")}</p>
          {current === "ios" && device && !device.iosSafari && !done ? (
            <div className="opl-app__notice" role="note">
              <strong>{t("ios.openInSafari")}</strong>
              <p>{t("ios.openInSafariBody")}</p>
              <button type="button" className="opl-btn soft sm" onClick={() => void copyLink()}>
                <Copy size={16} aria-hidden="true" />
                {copied ? t("ios.copied") : t("ios.copy")}
              </button>
            </div>
          ) : null}
          {done && current === "ios" ? null : (
            <ol className="opl-app__steps">
              <li>
                <span className="opl-app__step-icon" aria-hidden="true"><Share size={20} /></span>
                <span>{t("ios.step1")}</span>
              </li>
              <li>
                <span className="opl-app__step-icon" aria-hidden="true"><SquarePlus size={20} /></span>
                <span>{t("ios.step2")}</span>
              </li>
              <li>
                <span className="opl-app__step-icon opl-app__step-icon--text" aria-hidden="true">Add</span>
                <span>{t("ios.step3")}</span>
              </li>
            </ol>
          )}
          <p className="opl-app__hint">{t("ios.notifications")}</p>
        </section>

        <section id="desktop" className="opl-app__card" data-current={current === "desktop"} style={{ order: order("desktop") }} aria-labelledby="opl-app-desktop">
          <div className="opl-app__card-head">
            <span className="opl-app__icon" aria-hidden="true"><Laptop size={22} /></span>
            <h2 id="opl-app-desktop">{t("desktop.title")}</h2>
            {badge("desktop")}
          </div>
          <p>{t("desktop.lead")}</p>
          {current !== "android" && pwa.installPrompt && !done ? (
            <button type="button" className="opl-btn primary" onClick={() => void promptInstall().then((outcome) => outcome === "accepted" && setInstalled(true))}>
              <Download size={18} aria-hidden="true" />
              {t("desktop.install")}
            </button>
          ) : null}
          <p className="opl-app__hint">{t("desktop.hint")}</p>
        </section>
      </div>
    </div>
  );
}
