"use client";

import { useState } from "react";
import { useLocale } from "next-intl";

/**
 * Share a public page: native Web Share where the browser has it, plus copy link and
 * WhatsApp / Telegram / Bale links. Nothing is ever posted automatically — every channel
 * opens the user's own app with a prefilled message they can edit or discard.
 */
export function ShareBar({ url, text, className = "" }: { url: string; text: string; className?: string }) {
  const fa = useLocale() === "fa";
  const [copied, setCopied] = useState(false);
  const absolute = typeof window !== "undefined" && url.startsWith("/") ? `${window.location.origin}${url}` : url;
  const message = `${text}\n${absolute}`;
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const channels = [
    { key: "whatsapp", label: fa ? "واتس‌اپ" : "WhatsApp", href: `https://wa.me/?text=${encodeURIComponent(message)}` },
    { key: "telegram", label: fa ? "تلگرام" : "Telegram", href: `https://t.me/share/url?url=${encodeURIComponent(absolute)}&text=${encodeURIComponent(text)}` },
    { key: "bale", label: fa ? "بله" : "Bale", href: `https://ble.ir/share/url?url=${encodeURIComponent(absolute)}&text=${encodeURIComponent(text)}` },
  ];

  const pill = "inline-flex min-h-11 items-center rounded-full border border-border-subtle px-4 text-sm text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";
  return (
    <div role="group" aria-label={fa ? "اشتراک‌گذاری" : "Share"} className={`flex flex-wrap gap-2 ${className}`}>
      {canNativeShare ? (
        <button type="button" className={pill} onClick={() => void navigator.share({ title: text, text, url: absolute }).catch(() => undefined)}>
          {fa ? "اشتراک‌گذاری" : "Share"}
        </button>
      ) : null}
      <button type="button" className={pill} onClick={() => void copy()} aria-live="polite">
        {copied ? (fa ? "پیوند کپی شد" : "Link copied") : fa ? "کپی پیوند" : "Copy link"}
      </button>
      {channels.map((c) => (
        <a key={c.key} className={pill} href={c.href} target="_blank" rel="noopener noreferrer">
          {c.label}
        </a>
      ))}
    </div>
  );
}
