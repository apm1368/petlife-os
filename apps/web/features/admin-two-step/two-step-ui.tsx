"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ApiError } from "@/lib/api/client";
import type { RouteLocale } from "@/lib/i18n/config";

const DATE_LOCALE: Record<RouteLocale, string> = { fa: "fa-IR-u-ca-persian-nu-arabext", en: "en-GB", de: "de-DE", es: "es-ES" };

export function useTwoStepFormat() {
  const locale = useLocale() as RouteLocale;
  return useMemo(() => {
    const date = new Intl.DateTimeFormat(DATE_LOCALE[locale] ?? "en-GB", { dateStyle: "medium", timeZone: "Asia/Tehran" });
    const time = new Intl.DateTimeFormat(DATE_LOCALE[locale] ?? "en-GB", { timeStyle: "short", timeZone: "Asia/Tehran" });
    return { date: (v: string) => date.format(new Date(v)), time: (v: string) => time.format(new Date(v)) };
  }, [locale]);
}

/** Turns an API error into one sentence for the person typing the code. */
export function useTwoStepError() {
  const t = useTranslations("adminTwoStep");
  const format = useTwoStepFormat();
  return (error: unknown): string => {
    if (!(error instanceof ApiError)) return t("errors.generic");
    const details = error.details ?? {};
    if (error.code === "TWO_STEP_CODE_INVALID") return typeof details.attemptsLeft === "number" ? t("errors.invalid", { count: details.attemptsLeft }) : t("errors.invalidPlain");
    if (error.code === "TWO_STEP_LOCKED" && typeof details.retryAt === "string") return t("errors.locked", { time: format.time(details.retryAt) });
    if (error.code === "ADMIN_GOVERNANCE_RULE" && typeof details.rule === "string" && t.has(`rules.${details.rule}`)) return t(`rules.${details.rule}`);
    if (error.code === "VALIDATION_ERROR") return t("errors.format");
    return t("errors.generic");
  };
}

/** Six digits for an authenticator code, or a recovery code; the browser may offer a saved one-time code. */
export function TwoStepCodeInput({ id, label, value, onChange, recovery = false, autoFocus = false }: { id: string; label: string; value: string; onChange: (v: string) => void; recovery?: boolean; autoFocus?: boolean }) {
  return (
    <label className="gx-field gx-twostep-code" htmlFor={id}>
      {label}
      <input
        id={id}
        dir="ltr"
        value={value}
        autoFocus={autoFocus}
        autoComplete={recovery ? "off" : "one-time-code"}
        inputMode={recovery ? "text" : "numeric"}
        spellCheck={false}
        autoCapitalize={recovery ? "characters" : "off"}
        maxLength={recovery ? 24 : 7}
        placeholder={recovery ? "XXXX-XXXX-XXXX-XXXX" : "123 456"}
        onChange={(e) => onChange(recovery ? e.target.value.toUpperCase() : e.target.value.replace(/[^\d۰-۹٠-٩ ]/g, ""))}
      />
    </label>
  );
}

/** Persian/Arabic-Indic digits typed on a phone keyboard count as the same digits. */
export function asciiDigits(v: string): string {
  return v.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/\s/g, "");
}

/** Shown once: copy or download, and the person confirms they kept them before moving on. */
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const t = useTranslations("adminTwoStep");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = `${t("codes.fileHeading")}\n\n${codes.join("\n")}\n`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "opetlife-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="gx-twostep-codes" aria-labelledby="twostep-codes-title">
      <h2 id="twostep-codes-title" className="gx-section-title">{t("codes.title")}</h2>
      <p className="gx-muted">{t("codes.body")}</p>
      <ol className="gx-twostep-codelist" dir="ltr">
        {codes.map((c) => (
          <li key={c}><code>{c}</code></li>
        ))}
      </ol>
      <div className="gx-twostep-actions">
        <button type="button" className="gx-btn" onClick={() => void copy()}>{copied ? t("enrol.copied") : t("codes.copy")}</button>
        <button type="button" className="gx-btn" onClick={download}>{t("codes.download")}</button>
      </div>
      <label className="gx-twostep-check">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        {t("codes.saved")}
      </label>
      <button type="button" className="gx-btn gx-btn--primary" disabled={!saved} onClick={onDone}>{t("codes.continue")}</button>
    </section>
  );
}
