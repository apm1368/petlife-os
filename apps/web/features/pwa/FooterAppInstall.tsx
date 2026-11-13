"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Download } from "@petlife/ui";
import { getPwaState, getServerPwaState, isIosSafari, isStandalone, promptInstall, subscribePwa } from "./pwa-runtime";
import { androidDownloadLinks } from "./app-links";

/**
 * "Install the app" in the site footer (owner, 2026-11-13). Chrome, Edge and Samsung Internet get the browser's own
 * install prompt; iPhone Safari gets the Add to Home Screen steps; other browsers get the menu steps. Hidden inside
 * the installed app. Android store / APK links appear next to it once they exist (app-links.ts).
 */
export function FooterAppInstall() {
  const t = useTranslations("pwa.footer");
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
        {downloads.map(({ store, url }) => (
          <a key={store} className="opl-btn line sm" href={url} rel="noopener" target="_blank">
            {t(`android.${store}`)}
          </a>
        ))}
      </div>
      {help ? <p className="opl-foot__app-help" role="status">{t(help === "ios" ? "iosSteps" : "otherSteps")}</p> : null}
    </div>
  );
}
