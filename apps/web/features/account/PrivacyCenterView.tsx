"use client";
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Button, ContextSurface, Dialog, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import { accountService, type PrivacyCenterDto } from "@/services/account.service";
import { AccountPageHeader } from "./AccountNav";

export function PrivacyCenterView() {
  const locale = useLocale(); const [data, setData] = useState<PrivacyCenterDto | null>(null); const [failed, setFailed] = useState(false); const [busy, setBusy] = useState(false); const [deleteOpen, setDeleteOpen] = useState(false); const [confirmation, setConfirmation] = useState("");
  const load = useCallback(async () => { setFailed(false); try { setData(await accountService.privacy()); } catch { setFailed(true); } }, []);
  useEffect(() => { void load(); }, [load]);
  if (failed) return <ErrorRecovery title={locale === "fa" ? "حریم خصوصی" : "Privacy"} message="" retryLabel={locale === "fa" ? "تلاش دوباره" : "Retry"} onRetry={load} />;
  if (!data) return <Skeleton className="h-96 w-full" aria-label="loading" />;
  const consent = (kind: string) => data.consents.find((item) => item.kind === kind && item.version === data.consentVersion);
  const marketing = Boolean(consent("MARKETING")?.grantedAt && !consent("MARKETING")?.revokedAt);
  async function toggleMarketing() { setBusy(true); try { await accountService.setConsent("MARKETING", !marketing); await load(); } finally { setBusy(false); } }
  async function exportData() { setBusy(true); try { await accountService.requestExport(); await load(); } finally { setBusy(false); } }
  async function deleteAccount() { setBusy(true); try { await accountService.requestDeletion(confirmation); setDeleteOpen(false); setConfirmation(""); await load(); } finally { setBusy(false); } }
  return <div className="account-stack">
    <AccountPageHeader eyebrow={locale === "fa" ? "مرکز حریم خصوصی" : "PRIVACY CENTER"} title={locale === "fa" ? "داده‌ها و رضایت‌ها" : "Data & consents"} description={locale === "fa" ? "شفاف ببینید چه چیزی ضروری است، چه چیزی انتخابی است و چگونه داده‌هایتان را دریافت کنید." : "See what is required, what is optional, and how to receive your data."} />
    <section><div className="account-section-title"><h2>{locale === "fa" ? "رضایت‌ها" : "Consents"}</h2></div><div className="security-list">
      {(["TERMS","PRIVACY"] as const).map((kind) => <div className="security-row" key={kind}><div className="security-row__icon">✓</div><div><b>{kind === "TERMS" ? (locale === "fa" ? "شرایط استفاده" : "Terms of service") : (locale === "fa" ? "سیاست حریم خصوصی" : "Privacy policy")}</b><p>{locale === "fa" ? `نسخه ${data.consentVersion}` : `Version ${data.consentVersion}`}</p></div><StatusLabel tone={consent(kind)?.grantedAt ? "success" : "neutral"}>{consent(kind)?.grantedAt ? (locale === "fa" ? "پذیرفته شده" : "Accepted") : (locale === "fa" ? "ثبت نشده" : "Not recorded")}</StatusLabel></div>)}
      <div className="security-row"><div className="security-row__icon">✦</div><div><b>{locale === "fa" ? "پیام‌های بازاریابی" : "Marketing messages"}</b><p>{locale === "fa" ? "خاموش کردن این گزینه روی پیام‌های امنیتی، سفارش و رزرو اثری ندارد." : "Turning this off never disables security, order or booking messages."}</p></div><Button variant="secondary" size="sm" isLoading={busy} onClick={toggleMarketing}>{marketing ? (locale === "fa" ? "غیرفعال کردن" : "Turn off") : (locale === "fa" ? "فعال کردن" : "Turn on")}</Button></div>
    </div></section>
    <ContextSurface className="privacy-export"><div><h2>{locale === "fa" ? "دریافت یک نسخه از اطلاعات" : "Get a copy of your data"}</h2><p>{locale === "fa" ? "حساب، خانواده، هویت حیوانات، سلامت، خاطرات و فعالیت‌ها در بستهٔ امن قرار می‌گیرند." : "Account, household, pet identity, health, memories and activity are included in a secure package."}</p><div className="experience-pills">{data.exportIncludes.map((item) => <span className="experience-pill" key={item}>{item.replaceAll("_"," ")}</span>)}</div></div><Button onClick={exportData} isLoading={busy}>{locale === "fa" ? "درخواست خروجی" : "Request export"}</Button></ContextSurface>
    {data.exports.length > 0 && <div className="request-history">{data.exports.map((request) => <div key={request.id}><span>{new Intl.DateTimeFormat(locale,{dateStyle:"medium"}).format(new Date(request.requestedAt))}</span><StatusLabel tone={request.status === "READY" ? "success" : "neutral"}>{request.status}</StatusLabel></div>)}</div>}
    <section className="danger-zone"><div><h2>{locale === "fa" ? "حذف حساب" : "Delete account"}</h2><p>{locale === "fa" ? "این یک درخواست بررسی‌شونده است؛ سوابق مالی و قانونی مشمول نگهداری فوراً پاک نمی‌شوند و دسترسی‌های خانواده بررسی خواهند شد." : "This starts a reviewed request; legally retained financial records are not immediately erased and household access is reviewed."}</p></div><Button variant="danger" onClick={() => setDeleteOpen(true)}>{locale === "fa" ? "درخواست حذف حساب" : "Request deletion"}</Button></section>
    <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} title={locale === "fa" ? "درخواست حذف حساب" : "Request account deletion"}><div className="flex flex-col gap-4"><p className="text-body text-text-secondary">{locale === "fa" ? "برای تأیید عبارت DELETE را وارد کنید. این درخواست به‌صورت قابل پیگیری ثبت می‌شود." : "Type DELETE to confirm. This creates a traceable request."}</p><Input label="DELETE" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoFocus /><div className="flex gap-2"><Button variant="danger" isLoading={busy} disabled={confirmation !== "DELETE"} onClick={deleteAccount}>{locale === "fa" ? "ثبت درخواست" : "Submit request"}</Button><Button variant="ghost" onClick={() => setDeleteOpen(false)}>{locale === "fa" ? "انصراف" : "Cancel"}</Button></div></div></Dialog>
  </div>;
}
