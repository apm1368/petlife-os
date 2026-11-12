"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Download, X } from "@petlife/ui";
import { getPwaState, getServerPwaState, isIosSafari, isStandalone, promptInstall, subscribePwa } from "./pwa-runtime";
import "./pwa.css";

const DISMISS_KEY = "opl.install.dismissed";
const DISMISS_DAYS = 30;

function dismissedRecently(): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/**
 * "Install the app" card in the member area. Shown only when the browser can install the site (Chrome, Edge and
 * Samsung Internet fire `beforeinstallprompt`) or on iPhone Safari (instructions for Add to Home Screen); never
 * inside the installed app itself. "Not now" hides it for 30 days on this browser.
 */
export function InstallAppCard() {
  const t = useTranslations("pwa.install");
  const pwa = useSyncExternalStore(subscribePwa, getPwaState, getServerPwaState);
  const [mode, setMode] = useState<"hidden" | "prompt" | "ios">("hidden");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (isStandalone() || dismissedRecently()) return setMode("hidden");
    if (pwa.installPrompt) return setMode("prompt");
    setMode(isIosSafari() ? "ios" : "hidden");
  }, [pwa.installPrompt]);

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Private mode: hidden for this visit only.
    }
    setMode("hidden");
  }

  async function install() {
    const outcome = await promptInstall();
    if (outcome === "accepted") setDone(true);
    setMode("hidden");
  }

  if (done) return <p className="opl-install__done" role="status">{t("installed")}</p>;
  if (mode === "hidden") return null;
  const ios = mode === "ios";
  return (
    <section className="opl-install" aria-labelledby="opl-install-title">
      <img className="opl-install__icon" src="/brand/opl/app-icon-192.png" alt="" width={56} height={56} />
      <div className="opl-install__text">
        <h2 id="opl-install-title">{ios ? t("iosTitle") : t("title")}</h2>
        <p>{ios ? t("iosBody") : t("body")}</p>
        <div className="opl-install__actions">
          {ios ? null : (
            <button type="button" className="opl-btn primary sm" onClick={install}>
              <Download size={18} aria-hidden="true" />
              {t("action")}
            </button>
          )}
          <button type="button" className="opl-btn line sm" onClick={dismiss}>{t("later")}</button>
        </div>
      </div>
      <button type="button" className="opl-install__close" aria-label={t("dismiss")} onClick={dismiss}>
        <X size={18} aria-hidden="true" />
      </button>
    </section>
  );
}
