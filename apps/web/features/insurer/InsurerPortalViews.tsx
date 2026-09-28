"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import type { InsuranceApplicationStatus, InsurerApplicationDetailDto, InsurerApplicationRowDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { formatDay, localizeDigits } from "@/lib/date/jalali";
import { insurerPortalService, type InsurerContextDto } from "@/services/travel-marketplace.service";
import { applicationStatusTone } from "@/features/insurance/insurance-status";

const FILTERS: (InsuranceApplicationStatus | "")[] = ["", "SUBMITTED" as InsuranceApplicationStatus, "UNDER_REVIEW" as InsuranceApplicationStatus, "NEEDS_INFORMATION" as InsuranceApplicationStatus, "APPROVED" as InsuranceApplicationStatus, "DECLINED" as InsuranceApplicationStatus];

/**
 * Minimum insurer portal. An insurer sees only its own products and only applications whose
 * applicant consented; pet data is the minimum needed to review (species, breed, age). Decisions
 * are the insurer's; PET LIFE only relays them.
 */
export function InsurerHomeView() {
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const t = useTranslations("insurance");
  const [me, setMe] = useState<InsurerContextDto | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "forbidden" | "error">("loading");
  const [status, setStatus] = useState<InsuranceApplicationStatus | "">("");
  const [rows, setRows] = useState<InsurerApplicationRowDto[] | null>(null);
  const [products, setProducts] = useState<Awaited<ReturnType<typeof insurerPortalService.products>> | null>(null);
  const [team, setTeam] = useState<Awaited<ReturnType<typeof insurerPortalService.team>> | null>(null);

  useEffect(() => {
    insurerPortalService.me().then((m) => { setMe(m); setState("ready"); }).catch((e) => setState(e instanceof ApiError && e.status === 403 ? "forbidden" : "error"));
  }, []);
  const load = useCallback(() => {
    if (state !== "ready") return;
    setRows(null);
    insurerPortalService.applications({ status: status || undefined }).then((r) => setRows(r.items)).catch(() => setRows([]));
  }, [status, state]);
  useEffect(load, [load]);
  useEffect(() => {
    if (state !== "ready") return;
    insurerPortalService.products().then(setProducts).catch(() => setProducts([]));
    insurerPortalService.team().then(setTeam).catch(() => setTeam([]));
  }, [state]);

  if (state === "loading") return <Skeleton className="h-64" />;
  if (state === "forbidden") return <EmptyState title={fa ? "شما عضو هیچ بیمه‌گری در PET LIFE نیستید" : "You are not a member of an insurer on PET LIFE"} description={fa ? "دسترسی را مدیر بیمه‌گر یا تیم PET LIFE اعطا می‌کند." : "Access is granted by your insurer's admin or the PET LIFE team."} />;
  if (state === "error" || !me) return <ErrorRecovery title={fa ? "بارگیری نشد" : "Could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Try again"} onRetry={() => location.reload()} />;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6">
      <header>
        <p className="text-metadata text-text-secondary">{fa ? "پرتال بیمه‌گر" : "Insurer portal"} · {me.role}</p>
        <h1 className="text-page-title">{me.providerName}</h1>
      </header>
      <section className="flex flex-col gap-3" aria-labelledby="apps">
        <h2 id="apps" className="text-section-title">{fa ? "درخواست‌ها" : "Applications"}</h2>
        <div role="group" className="flex gap-2 overflow-x-auto" aria-label={fa ? "وضعیت" : "Status"}>
          {FILTERS.map((s) => <button key={s || "all"} aria-pressed={status === s} onClick={() => setStatus(s)} className={`min-h-10 shrink-0 rounded-full border px-3 text-sm ${status === s ? "border-brand-natural bg-brand-natural/10" : "border-border-subtle text-text-secondary"}`}>{s ? t(`applicationStatus.${s}`) : fa ? "همه" : "All"}</button>)}
        </div>
        {rows === null ? <Skeleton className="h-40" /> : rows.length === 0 ? <EmptyState title={fa ? "درخواستی نیست" : "No applications"} /> : (
          <ul className="flex flex-col gap-2">{rows.map((a) => (
            <li key={a.id}>
              <Link href={`/${lang}/insurer/applications/${a.id}`} className="flex flex-col gap-1 rounded-md border border-border-subtle bg-surface-elevated p-3 hover:border-border-strong">
                <span className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold">{a.productName}</span><StatusLabel tone={applicationStatusTone(a.status)}>{t(`applicationStatus.${a.status}`)}</StatusLabel></span>
                <span className="text-sm text-text-secondary">{a.petSpecies}{a.petBreed ? ` · ${a.petBreed}` : ""}{a.petAgeMonths !== null ? (fa ? ` · ${localizeDigits(a.petAgeMonths, "fa")} ماه` : ` · ${a.petAgeMonths} months`) : ""}{a.submittedAt ? ` · ${formatDay(a.submittedAt.slice(0, 10), lang)}` : ""}</span>
              </Link>
            </li>
          ))}</ul>
        )}
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <ContextSurface>
          <h2 className="mb-2 font-bold">{fa ? "محصولات" : "Products"}</h2>
          {products === null ? <Skeleton className="h-20" /> : products.length === 0 ? <p className="text-sm text-text-secondary">—</p> : products.map((p) => <p key={p.id} className="text-sm">{p.name} · {p.status}{p.isPubliclyListed ? "" : fa ? " · غیرعمومی" : " · unlisted"} · {fa ? `${localizeDigits(p._count.applications, "fa")} درخواست` : `${p._count.applications} applications`}</p>)}
          <p className="mt-2 text-metadata text-text-secondary">{fa ? "ویرایش محصولات از طریق تیم PET LIFE انجام می‌شود." : "Product changes go through the PET LIFE team."}</p>
        </ContextSurface>
        <ContextSurface>
          <h2 className="mb-2 font-bold">{fa ? "تیم" : "Team"}</h2>
          {team === null ? <Skeleton className="h-20" /> : team.map((m) => <p key={m.id} className="text-sm">{m.displayName ?? "—"} · {m.role}{m.isActive ? "" : fa ? " · غیرفعال" : " · inactive"}</p>)}
        </ContextSurface>
      </div>
    </div>
  );
}

export function InsurerApplicationView({ applicationId }: { applicationId: string }) {
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const t = useTranslations("insurance");
  const [a, setA] = useState<InsurerApplicationDetailDto | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "notFound" | "forbidden" | "error">("loading");
  const [message, setMessage] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    try {
      setA(await insurerPortalService.application(applicationId));
      setState("ready");
    } catch (e) {
      setState(e instanceof ApiError ? (e.status === 404 ? "notFound" : e.status === 403 ? "forbidden" : "error") : "error");
    }
  }, [applicationId]);
  useEffect(() => void load(), [load]);
  const decide = async (status: InsuranceApplicationStatus) => {
    setBusy(true);
    setMsg(null);
    try {
      setA(await insurerPortalService.decide(applicationId, { status, message: message.trim() || undefined, externalReference: reference.trim() || undefined }));
      setMessage("");
      setMsg({ ok: true, text: fa ? "ثبت شد و به متقاضی اطلاع داده شد." : "Recorded; the applicant has been notified." });
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError && e.status === 403 ? (fa ? "نقش «بیننده» نمی‌تواند تصمیم ثبت کند." : "Viewers cannot record decisions.") : e instanceof ApiError && e.status === 409 ? (fa ? "این تغییر وضعیت از وضعیت فعلی مجاز نیست." : "That change is not allowed from the current status.") : fa ? "ثبت نشد؛ برای «نیاز به اطلاعات» و «رد» پیام الزامی است." : "Not saved; a message is required for “needs information” and “declined”." });
    } finally {
      setBusy(false);
    }
  };
  if (state === "loading") return <Skeleton className="h-64" />;
  if (state === "notFound" || state === "forbidden") return <EmptyState title={fa ? "این درخواست در دسترس نیست" : "This application is not available"} />;
  if (state === "error" || !a) return <ErrorRecovery title={fa ? "بارگیری نشد" : "Could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Try again"} onRetry={() => void load()} />;
  // Mirrors the server's insurer transitions (approval only after a review was started).
  const can = (s: string) => ({ SUBMITTED: ["UNDER_REVIEW", "NEEDS_INFORMATION", "DECLINED"], UNDER_REVIEW: ["NEEDS_INFORMATION", "APPROVED", "DECLINED"], NEEDS_INFORMATION: ["DECLINED"] } as Record<string, string[]>)[a.status]?.includes(s) ?? false;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <Link href={`/${lang}/insurer`} className="text-metadata text-text-secondary hover:underline">{fa ? "درخواست‌ها" : "Applications"}</Link>
      <header className="flex flex-col gap-1">
        <StatusLabel tone={applicationStatusTone(a.status)}>{t(`applicationStatus.${a.status}`)}</StatusLabel>
        <h1 className="text-page-title">{a.productName}</h1>
        <p className="text-sm text-text-secondary">{a.petSpecies}{a.petBreed ? ` · ${a.petBreed}` : ""}{a.petAgeMonths !== null ? (fa ? ` · ${localizeDigits(a.petAgeMonths, "fa")} ماه` : ` · ${a.petAgeMonths} months`) : ""} · {t(`eligibilityStatus.${a.eligibilityStatus}`)}</p>
        {a.consentAt ? <p className="text-metadata text-text-secondary">{fa ? "رضایت متقاضی: " : "Applicant consent: "}{formatDay(a.consentAt.slice(0, 10), lang)}</p> : null}
      </header>
      {a.notes ? <ContextSurface><p className="whitespace-pre-line text-sm">{a.notes}</p></ContextSurface> : null}
      {msg ? <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-state-success" : "text-state-urgent"}`}>{msg.text}</p> : null}
      {can("UNDER_REVIEW") || can("APPROVED") || can("DECLINED") ? (
        <ContextSurface className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">{fa ? "پیام به متقاضی" : "Message to the applicant"}<textarea value={message} maxLength={2000} onChange={(e) => setMessage(e.target.value)} className="min-h-20 rounded-md border border-border-subtle bg-surface-base p-2" /></label>
          <Input label={fa ? "شمارهٔ مرجع/بیمه‌نامه در سیستم شما (اختیاری)" : "Your reference/policy number (optional)"} dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {can("UNDER_REVIEW") ? <Button size="sm" variant="secondary" isLoading={busy} onClick={() => void decide("UNDER_REVIEW" as InsuranceApplicationStatus)}>{fa ? "شروع بررسی" : "Start review"}</Button> : null}
            {can("NEEDS_INFORMATION") ? <Button size="sm" variant="secondary" disabled={message.trim().length < 3} isLoading={busy} onClick={() => void decide("NEEDS_INFORMATION" as InsuranceApplicationStatus)}>{fa ? "درخواست اطلاعات" : "Ask for information"}</Button> : null}
            {can("APPROVED") ? <Button size="sm" isLoading={busy} onClick={() => void decide("APPROVED" as InsuranceApplicationStatus)}>{fa ? "پذیرش" : "Approve"}</Button> : null}
            {can("DECLINED") ? <Button size="sm" variant="danger" disabled={message.trim().length < 3} isLoading={busy} onClick={() => void decide("DECLINED" as InsuranceApplicationStatus)}>{fa ? "رد" : "Decline"}</Button> : null}
          </div>
        </ContextSurface>
      ) : a.insurerMessage || a.externalReference ? <p className="text-sm text-text-secondary">{a.insurerMessage}{a.externalReference ? ` · ${a.externalReference}` : ""}</p> : null}
      <section>
        <h2 className="mb-2 text-section-title">{fa ? "تاریخچه" : "History"}</h2>
        <ol className="flex flex-col gap-1 border-s border-border-subtle ps-4 text-sm">{a.timeline.map((e, i) => <li key={i}>{t(`applicationStatus.${e.toStatus}`)} · {e.actorType}{e.note ? ` — ${e.note}` : ""} <span className="text-text-secondary">· {new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(e.createdAt))}</span></li>)}</ol>
      </section>
    </div>
  );
}
