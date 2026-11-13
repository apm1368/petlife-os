"use client";

import { useEffect, useState, useSyncExternalStore, type MouseEvent } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { RouteLocale } from "@/lib/i18n/config";
import { getPwaState, getServerPwaState, isStandalone, promptInstall, subscribePwa } from "./pwa-runtime";
import { androidDownloadLinks } from "./app-links";
import { AndroidIcon, AppleIcon } from "./PlatformIcons";

/**
 * The app in the site footer (owner, 2026-11-13): two clean buttons side by side and nothing else, with no version,
 * size or fingerprint (those live in the "file details" on /app).
 *   1. Android: downloads the signed APK straight from our own domain.
 *   2. iPhone: the web app (PWA). Where the browser has its own install prompt (Chrome/Edge) the tap opens it;
 *      everywhere else, iPhone Safari included, it goes to the Safari steps on /app#ios (which also says
 *      "open in Safari" inside in-app browsers).
 * "All ways to install" (/app) is a small text link below. Hidden inside the installed app.
 */
export function FooterAppInstall() {
  const t = useTranslations("pwa.footer");
  const locale = useLocale() as RouteLocale;
  const pwa = useSyncExternalStore(subscribePwa, getPwaState, getServerPwaState);
  const [installed, setInstalled] = useState(false);
  const apk = androidDownloadLinks().find((d) => d.store === "apk");

  useEffect(() => {
    setInstalled(isStandalone());
  }, []);

  if (installed || pwa.installed) return null;

  function installWebApp(event: MouseEvent<HTMLAnchorElement>) {
    if (!pwa.installPrompt) return; // no native prompt: follow the link to the Safari steps
    event.preventDefault();
    void promptInstall().then((outcome) => {
      if (outcome === "accepted") setInstalled(true);
    });
  }

  return (
    <div className="opl-foot__app">
      <h2>{t("title")}</h2>
      <div className="opl-foot__app-buttons">
        {apk ? (
          <a className="opl-foot__app-btn" href={apk.url} download>
            <AndroidIcon />
            <span>{t("androidEntry")}</span>
          </a>
        ) : null}
        <Link className="opl-foot__app-btn" href={`/${locale}/app#ios`} onClick={installWebApp}>
          <AppleIcon />
          <span>{t("iosEntry")}</span>
        </Link>
      </div>
      <Link className="opl-foot__app-all" href={`/${locale}/app`}>{t("allWays")}</Link>
    </div>
  );
}
