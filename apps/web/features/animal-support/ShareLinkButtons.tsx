"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@petlife/ui";

/**
 * Share controls for a public listing. Deliberately link-only: each channel
 * opens its own compose window with the URL prefilled, and nothing is ever
 * posted on the user's behalf (the spec forbids automated publishing).
 *
 * Instagram has no universal web share-by-URL endpoint, so it is not
 * fabricated here — the native share sheet (when the browser offers one)
 * and Copy Link cover that case instead.
 */
export function ShareLinkButtons({ url, title }: { url: string; title: string }) {
  const t = useTranslations("supportNeeds");
  const [copied, setCopied] = useState(false);

  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(`${title} — ${url}`);

  const channels = [
    { key: "whatsapp", href: `https://wa.me/?text=${encodedText}` },
    { key: "telegram", href: `https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(title)}` },
    { key: "bale", href: `https://ble.ir/share/url?url=${encodedUrl}&text=${encodeURIComponent(title)}` },
  ] as const;

  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function handleNativeShare(): Promise<void> {
    try {
      await navigator.share({ title, url });
    } catch {
      // A dismissed share sheet is a normal outcome, not an error worth surfacing.
    }
  }

  async function handleCopy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {channels.map((channel) => (
        <a key={channel.key} href={channel.href} target="_blank" rel="noopener noreferrer">
          <Button variant="ghost">{t(`share.${channel.key}`)}</Button>
        </a>
      ))}
      {canNativeShare ? (
        <Button variant="ghost" onClick={handleNativeShare}>
          {t("share.native")}
        </Button>
      ) : null}
      <Button variant="ghost" onClick={handleCopy}>
        {copied ? t("share.copied") : t("share.copyLink")}
      </Button>
    </div>
  );
}
