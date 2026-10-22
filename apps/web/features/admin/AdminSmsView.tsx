"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { Button, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import { adminService, type AdminSmsOverviewDto, type AdminSmsPatternCategory, type AdminSmsPatternInput, type AdminSmsPatternVarType } from "@/services/admin.service";
import { apiErrorText } from "@/lib/errors/api-error-text";
import { ApiError } from "@/lib/api/client";
import { Panel, PanelTitle, Tag } from "./console-ui";

const CATEGORIES: { value: AdminSmsPatternCategory; fa: string; en: string }[] = [
  { value: "otp", fa: "کد تأیید (OTP)", en: "Verification code (OTP)" },
  { value: "order", fa: "سفارش", en: "Order" },
  { value: "club", fa: "باشگاه مشتریان", en: "Customer club" },
  { value: "others", fa: "سایر", en: "Other" },
];
const VAR_TYPES: { value: AdminSmsPatternVarType; fa: string; en: string }[] = [
  { value: "int", fa: "عدد", en: "Number" },
  { value: "str", fa: "متن", en: "Text" },
  { value: "date", fa: "تاریخ", en: "Date" },
];

type PatternVar = { var: string; length: number; type: AdminSmsPatternVarType };
type PatternRow = { code: string; text: string; status: string | null; raw: unknown };

/** Variables written as %name% in the pattern text, in order of first appearance. */
export function extractPatternVars(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(/%([A-Za-z][A-Za-z0-9_]*)%/g)) if (!names.includes(match[1]!)) names.push(match[1]!);
  return names;
}

/** FarazSMS does not document the list response shape, so rows are read defensively and the raw item is kept. */
export function readPatternRows(payload: unknown): PatternRow[] {
  const pick = (value: unknown): unknown[] | null => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") {
      for (const key of ["data", "items", "patterns", "list"]) {
        const nested = pick((value as Record<string, unknown>)[key]);
        if (nested) return nested;
      }
    }
    return null;
  };
  return (pick(payload) ?? []).map((item) => {
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const str = (...keys: string[]) => {
      for (const key of keys) if (o[key] != null && o[key] !== "") return String(o[key]);
      return null;
    };
    return { code: str("code", "uid", "pattern_code", "id") ?? "—", text: str("text", "message", "body") ?? "", status: str("status", "state", "is_active"), raw: item };
  });
}

/** Stable per locale, so callbacks that depend on it don't re-run effects on every render. */
function useCopy() {
  const locale = useLocale();
  return useMemo(() => ({ locale, t: (fa: string, en: string) => (locale === "fa" ? fa : en) }), [locale]);
}

export function AdminSmsView() {
  const { t, locale } = useCopy();
  const [overview, setOverview] = useState<AdminSmsOverviewDto | null>(null);
  const [patterns, setPatterns] = useState<PatternRow[] | null>(null);
  const [patternsError, setPatternsError] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const errorText = useCallback((err: unknown) => {
    if (err instanceof ApiError && err.code === "SMS_PROVIDER_ERROR" && locale !== "fa") return err.message;
    if (err instanceof ApiError && err.code === "SMS_PROVIDER_ERROR") return `${apiErrorText(err, locale)} ${err.message}`;
    return apiErrorText(err, locale, t("درخواست انجام نشد.", "The request failed."));
  }, [locale, t]);

  const loadPatterns = useCallback(async () => {
    setPatternsError(null);
    try {
      setPatterns(readPatternRows(await adminService.smsPatterns()));
    } catch (err) {
      setPatterns([]);
      setPatternsError(errorText(err));
    }
  }, [errorText]);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const data = await adminService.smsOverview();
      setOverview(data);
      if (data.configured) await loadPatterns();
      else setPatterns([]);
    } catch {
      setFailed(true);
    }
  }, [loadPatterns]);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed) return <ErrorRecovery title={t("پیامک و پترن‌ها", "SMS & patterns")} message={t("اطلاعات پیامک بارگذاری نشد.", "SMS details didn't load.")} retryLabel={t("تلاش دوباره", "Retry")} onRetry={load} />;
  if (!overview) return <Skeleton className="h-64 w-full" aria-label={t("در حال بارگذاری", "Loading")} />;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-page-title text-text-primary">{t("پیامک و پترن‌ها", "SMS & patterns")}</h1>
        <p className="text-metadata text-text-secondary">{t("اتصال به فراز اس‌ام‌اس: وضعیت، اعتبار، ساخت و مدیریت پترن‌ها (قالب‌های پیامک).", "FarazSMS connection: status, balance, and pattern (SMS template) management.")}</p>
      </div>
      {notice ? <div role="status" className="account-notice">{notice}</div> : null}

      <OverviewPanel overview={overview} />

      {overview.configured ? (
        <>
          <PatternListPanel patterns={patterns} error={patternsError} otpPatternCode={overview.otpPatternCode} onReload={loadPatterns} onDeleted={(code) => { setNotice(t(`پترن ${code} حذف شد.`, `Pattern ${code} was deleted.`)); void loadPatterns(); }} errorText={errorText} />
          <CreatePatternPanel errorText={errorText} onCreated={(result) => { setNotice(t(`پترن ثبت شد${result ? ` (کد: ${result})` : ""}. پس از تأیید فراز اس‌ام‌اس قابل ارسال است.`, `Pattern submitted${result ? ` (code: ${result})` : ""}. It can be sent once FarazSMS approves it.`)); void loadPatterns(); }} />
          <TestSendPanel errorText={errorText} defaultCode={overview.otpPatternCode ?? ""} defaultVar={overview.otpPatternVar} />
        </>
      ) : null}
    </div>
  );
}

function OverviewPanel({ overview }: { overview: AdminSmsOverviewDto }) {
  const { t, locale } = useCopy();
  const formatNumber = (value: number) => new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(value);
  const otpLive = overview.otpProvider === "faraz";
  return (
    <Panel>
      <PanelTitle title={t("وضعیت اتصال", "Connection")} />
      <dl className="grid gap-3 sm:grid-cols-2">
        <Item label={t("کلید API و خط ارسال", "API key & sender line")}>
          {overview.configured ? <Tag tone="success">{t("تنظیم شده", "Configured")}</Tag> : <Tag tone="attention">{t("تنظیم نشده", "Not configured")}</Tag>}
          {overview.sender ? <bdi dir="ltr" className="ms-2">{overview.sender}</bdi> : null}
        </Item>
        <Item label={t("اعتبار حساب", "Account balance")}>
          {overview.balance ? (
            <span>{t(`${formatNumber(overview.balance.balanceAmount)} تومان · ${formatNumber(overview.balance.balanceCount)} پیامک`, `${formatNumber(overview.balance.balanceAmount)} toman · ${formatNumber(overview.balance.balanceCount)} SMS`)}</span>
          ) : overview.balanceError ? (
            <span className="text-state-urgent">{overview.balanceError}</span>
          ) : (
            "—"
          )}
        </Item>
        <Item label={t("ارسال کد ورود (OTP)", "Sign-in codes (OTP)")}>
          {otpLive ? <Tag tone="success">{t("پیامک واقعی", "Real SMS")}</Tag> : <Tag tone="attention">{t("حالت توسعه — ارسال نمی‌شود", "Dev mode — not sent")}</Tag>}
          {overview.otpPatternCode ? <bdi dir="ltr" className="ms-2">{overview.otpPatternCode}</bdi> : null}
        </Item>
        <Item label={t("پیامک‌های اطلاع‌رسانی", "Notification SMS")}>
          {overview.messagingProvider === "faraz" && overview.messagingMode === "production" ? <Tag tone="success">{t("پیامک واقعی", "Real SMS")}</Tag> : <Tag tone="neutral">{t("شبیه‌سازی", "Simulated")}</Tag>}
        </Item>
      </dl>
      {!overview.configured || !otpLive ? (
        <div className="mt-3 rounded-md border border-border-subtle p-3 text-metadata text-text-secondary">
          <p className="font-medium text-text-primary">{t("راه‌اندازی روی سرور", "Server setup")}</p>
          <p>{t("این مقادیر را در فایل .env سرویس API قرار دهید و API را راه‌اندازی مجدد کنید:", "Set these in the API service's .env file and restart the API:")}</p>
          <pre dir="ltr" className="mt-2 overflow-x-auto whitespace-pre text-start">{`FARAZ_SMS_API_KEY=<key from the FarazSMS panel>
FARAZ_SMS_SENDER=<sender line number>
FARAZ_SMS_OTP_PATTERN_CODE=<approved OTP pattern code>
FARAZ_SMS_OTP_PATTERN_VAR=code
OTP_PROVIDER=faraz`}</pre>
        </div>
      ) : null}
    </Panel>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-metadata text-text-secondary">{label}</dt>
      <dd className="mt-1 text-body text-text-primary">{children}</dd>
    </div>
  );
}

function PatternListPanel({ patterns, error, otpPatternCode, onReload, onDeleted, errorText }: { patterns: PatternRow[] | null; error: string | null; otpPatternCode: string | null; onReload: () => void; onDeleted: (code: string) => void; errorText: (err: unknown) => string }) {
  const { t } = useCopy();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  async function remove(code: string) {
    if (!window.confirm(t(`پترن ${code} برای همیشه حذف شود؟`, `Permanently delete pattern ${code}?`))) return;
    setDeleting(code);
    setRowError(null);
    try {
      await adminService.deleteSmsPattern(code);
      onDeleted(code);
    } catch (err) {
      setRowError(errorText(err));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <Panel>
      <PanelTitle title={t("پترن‌های حساب", "Account patterns")} hint={t("پترن‌ها در فراز اس‌ام‌اس نگهداری می‌شوند.", "Patterns are stored in FarazSMS.")} action={<Button variant="ghost" size="sm" onClick={onReload}>{t("به‌روزرسانی", "Refresh")}</Button>} />
      {error ? <p role="alert" className="text-metadata text-state-urgent">{error}</p> : null}
      {rowError ? <p role="alert" className="text-metadata text-state-urgent">{rowError}</p> : null}
      {patterns === null ? <Skeleton className="h-24 w-full" /> : null}
      {patterns && patterns.length === 0 && !error ? <p className="text-metadata text-text-secondary">{t("هنوز پترنی ثبت نشده است.", "No patterns yet.")}</p> : null}
      <ul className="flex flex-col gap-2">
        {patterns?.map((p) => (
          <li key={p.code + p.text} className="rounded-md border border-border-subtle p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <bdi dir="ltr" className="font-medium">{p.code}</bdi>
                {p.status ? <Tag tone="neutral">{p.status}</Tag> : null}
                {otpPatternCode && p.code === otpPatternCode ? <Tag tone="brand">{t("پترن کد ورود", "Sign-in code pattern")}</Tag> : null}
              </div>
              {p.code !== "—" ? <Button variant="ghost" size="sm" isLoading={deleting === p.code} disabled={p.code === otpPatternCode} onClick={() => void remove(p.code)}>{t("حذف", "Delete")}</Button> : null}
            </div>
            {p.text ? <p className="mt-1 whitespace-pre-wrap text-body text-text-primary">{p.text}</p> : null}
            <details className="mt-1 text-metadata text-text-secondary">
              <summary>{t("جزئیات خام", "Raw details")}</summary>
              <pre dir="ltr" className="overflow-x-auto text-start">{JSON.stringify(p.raw, null, 2)}</pre>
            </details>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function CreatePatternPanel({ onCreated, errorText }: { onCreated: (result: string | null) => void; errorText: (err: unknown) => string }) {
  const { t, locale } = useCopy();
  const [text, setText] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("opetlife.ir");
  const [category, setCategory] = useState<AdminSmsPatternCategory>("otp");
  const [shared, setShared] = useState(false);
  const [vars, setVars] = useState<PatternVar[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const inText = useMemo(() => extractPatternVars(text), [text]);
  const missing = inText.filter((name) => !vars.some((v) => v.var === name));
  const unused = vars.filter((v) => !inText.includes(v.var)).map((v) => v.var);

  // Keep one variable row per %name% in the text, preserving what was already chosen for each.
  function syncVars() {
    setVars(inText.map((name) => vars.find((v) => v.var === name) ?? { var: name, length: name === "code" ? 6 : 20, type: name === "code" ? "int" : "str" }));
  }

  function useOtpTemplate() {
    setText(locale === "fa" ? "کد تأیید شما در اُپت‌لایف: %code%\nاین کد را در اختیار دیگران قرار ندهید." : "Your OPetLife verification code: %code%\nDo not share this code.");
    setCategory("otp");
    setVars([{ var: "code", length: 6, type: "int" }]);
    if (!description) setDescription(t("کد ورود و ثبت‌نام", "Sign-in and sign-up code"));
  }

  async function submit() {
    setError(null);
    setSaving(true);
    const input: AdminSmsPatternInput = { text, description: description || undefined, website, shared, category, vars };
    try {
      const { result } = await adminService.createSmsPattern(input);
      onCreated(typeof result === "string" || typeof result === "number" ? String(result) : null);
      setText("");
      setVars([]);
      setDescription("");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = text.trim().length >= 3 && website.trim().length >= 3 && missing.length === 0 && unused.length === 0 && vars.every((v) => v.length > 0);

  return (
    <Panel>
      <PanelTitle title={t("ساخت پترن جدید", "New pattern")} hint={t("متغیرها را در متن به شکل %name% بنویسید. پترن پس از بررسی فراز اس‌ام‌اس فعال می‌شود.", "Write variables in the text as %name%. FarazSMS reviews each pattern before it can be sent.")} action={<Button variant="secondary" size="sm" onClick={useOtpTemplate}>{t("الگوی کد ورود", "Sign-in code template")}</Button>} />
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-label text-text-primary">{t("متن پترن", "Pattern text")}</span>
          <textarea className="min-h-24 rounded-md border border-border-subtle bg-surface-raised p-2 text-body" value={text} onChange={(e) => setText(e.target.value)} />
        </label>
        <Input label={t("توضیح (اختیاری)", "Description (optional)")} value={description} onChange={(e) => setDescription(e.target.value)} />
        <Input label={t("وب‌سایت", "Website")} dir="ltr" value={website} onChange={(e) => setWebsite(e.target.value)} />
        <label className="flex flex-col gap-1">
          <span className="text-label text-text-primary">{t("دسته‌بندی", "Category")}</span>
          <select className="rounded-md border border-border-subtle bg-surface-raised p-2 text-body" value={category} onChange={(e) => setCategory(e.target.value as AdminSmsPatternCategory)}>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{t(c.fa, c.en)}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-metadata text-text-secondary">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          <span>{t("اشتراک‌گذاری پترن (قابل استفاده برای دیگران)", "Shared pattern (usable by others)")}</span>
        </label>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-label text-text-primary">{t("متغیرها", "Variables")}</span>
            <Button variant="ghost" size="sm" onClick={syncVars} disabled={missing.length === 0 && unused.length === 0}>{t("هماهنگ با متن", "Match the text")}</Button>
          </div>
          {vars.length === 0 && inText.length === 0 ? <p className="text-metadata text-text-secondary">{t("این پترن متغیری ندارد.", "This pattern has no variables.")}</p> : null}
          {vars.map((v, index) => (
            <div key={v.var} className="flex flex-wrap items-end gap-2">
              <bdi dir="ltr" className="min-w-24 font-medium">%{v.var}%</bdi>
              <label className="flex flex-col gap-1 text-metadata">
                {t("نوع", "Type")}
                <select className="rounded-md border border-border-subtle bg-surface-raised p-1" value={v.type} onChange={(e) => setVars(vars.map((x, i) => (i === index ? { ...x, type: e.target.value as AdminSmsPatternVarType } : x)))}>
                  {VAR_TYPES.map((vt) => <option key={vt.value} value={vt.value}>{t(vt.fa, vt.en)}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-metadata">
                {t("حداکثر طول", "Max length")}
                <input type="number" min={1} max={200} className="w-24 rounded-md border border-border-subtle bg-surface-raised p-1" value={v.length} onChange={(e) => setVars(vars.map((x, i) => (i === index ? { ...x, length: Number(e.target.value) } : x)))} />
              </label>
            </div>
          ))}
          {missing.length > 0 ? <p className="text-metadata text-state-attention">{t(`متغیرهای بدون تنظیم: ${missing.join("، ")} — «هماهنگ با متن» را بزنید.`, `Variables without settings: ${missing.join(", ")} — press "Match the text".`)}</p> : null}
          {unused.length > 0 ? <p className="text-metadata text-state-attention">{t(`در متن نیامده‌اند: ${unused.join("، ")}`, `Not in the text: ${unused.join(", ")}`)}</p> : null}
          <p className="text-metadata text-text-secondary">{t("طول را برابر بلندترین مقدار واقعی بگذارید؛ مقدار بلندتر باعث توقف ارسال تا تأیید دستی می‌شود.", "Set the length to the longest real value — a longer value holds the message for manual approval.")}</p>
        </div>

        {error ? <p role="alert" className="text-metadata text-state-urgent">{error}</p> : null}
        <Button variant="primary" isLoading={saving} disabled={!canSubmit} onClick={() => void submit()}>{t("ثبت پترن در فراز اس‌ام‌اس", "Submit pattern to FarazSMS")}</Button>
      </div>
    </Panel>
  );
}

function TestSendPanel({ errorText, defaultCode, defaultVar }: { errorText: (err: unknown) => string; defaultCode: string; defaultVar: string }) {
  const { t } = useCopy();
  const [code, setCode] = useState(defaultCode);
  const [recipient, setRecipient] = useState("");
  const [attributes, setAttributes] = useState(`${defaultVar}=123456`);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function send() {
    setError(null);
    setResult(null);
    setSending(true);
    const parsed = Object.fromEntries(
      attributes
        .split(/\n|,/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const at = line.indexOf("=");
          return at < 0 ? [line, ""] : [line.slice(0, at).trim(), line.slice(at + 1).trim()];
        }),
    );
    try {
      const { requestId } = await adminService.testSmsPattern({ code: code.trim(), recipient: recipient.trim(), attributes: parsed });
      setResult(requestId);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Panel>
      <PanelTitle title={t("ارسال آزمایشی", "Test send")} hint={t("یک پیامک واقعی با پترن انتخابی ارسال می‌شود و هزینه دارد.", "Sends one real SMS with the chosen pattern; it is charged.")} />
      <div className="flex flex-col gap-3">
        <Input label={t("کد پترن", "Pattern code")} dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} />
        <Input label={t("موبایل گیرنده", "Recipient mobile")} type="tel" dir="ltr" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
        <label className="flex flex-col gap-1">
          <span className="text-label text-text-primary">{t("مقدار متغیرها (هر خط name=value)", "Variable values (one name=value per line)")}</span>
          <textarea dir="ltr" className="min-h-16 rounded-md border border-border-subtle bg-surface-raised p-2 text-body" value={attributes} onChange={(e) => setAttributes(e.target.value)} />
        </label>
        {error ? <p role="alert" className="text-metadata text-state-urgent">{error}</p> : null}
        {result !== null ? <p role="status" className="text-metadata text-state-success">{t(`ارسال شد. شناسهٔ درخواست: ${result || "—"}`, `Sent. Request id: ${result || "—"}`)}</p> : null}
        <Button variant="secondary" isLoading={sending} disabled={!code.trim() || !recipient.trim()} onClick={() => void send()}>{t("ارسال پیامک آزمایشی", "Send test SMS")}</Button>
      </div>
    </Panel>
  );
}
