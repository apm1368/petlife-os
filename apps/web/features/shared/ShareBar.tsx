"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

/** Sharing opens the user's own app; this component never posts on their behalf. */
export function ShareBar({ url, text, className = "" }: { url: string; text: string; className?: string }) {
  const t = useTranslations("rollout.share");
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState<"copyFailed" | "shareFailed" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const absolute = typeof window !== "undefined" && url.startsWith("/") ? `${window.location.origin}${url}` : url;
  const message = `${text}\n${absolute}`;
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  async function copy() {
    setFailed(null);
    try { await navigator.clipboard.writeText(absolute); setCopied(true); clearTimeout(timer.current); timer.current = setTimeout(() => setCopied(false), 2500); }
    catch { setCopied(false); setFailed("copyFailed"); }
  }
  async function share() {
    setFailed(null);
    try { await navigator.share({ title: text, text, url: absolute }); }
    catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) setFailed("shareFailed"); }
  }
  const channels = [
    { key: "whatsapp", href: `https://wa.me/?text=${encodeURIComponent(message)}` },
    { key: "telegram", href: `https://t.me/share/url?url=${encodeURIComponent(absolute)}&text=${encodeURIComponent(text)}` },
    { key: "bale", href: `https://ble.ir/share/url?url=${encodeURIComponent(absolute)}&text=${encodeURIComponent(text)}` },
  ];
  const pill = "inline-flex min-h-11 items-center rounded-full border border-border-subtle px-4 text-sm text-text-primary hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";
  return <div role="group" aria-label={t("group")} className={`flex flex-wrap gap-2 ${className}`}>
    {canNativeShare ? <button type="button" className={pill} onClick={() => void share()}>{t("group")}</button> : null}
    <button type="button" className={pill} onClick={() => void copy()} aria-live="polite">{copied ? t("copied") : t("copy")}</button>
    {channels.map((c) => <a key={c.key} className={pill} href={c.href} target="_blank" rel="noopener noreferrer">{t(c.key)}</a>)}
    {failed ? <p role="alert" className="w-full text-metadata text-state-urgent">{t(failed)}</p> : null}
  </div>;
}
