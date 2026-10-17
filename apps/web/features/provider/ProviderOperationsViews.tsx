"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import type { ProviderServiceDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import { formatDateTimeRange } from "@/lib/date/appointment-date";
import { providerOsService, type ProviderAnalytics, type ProviderReviewRow, type ProviderStaffMember, type ProviderWaitlistEntry } from "@/services/provider-os.service";

function useLoad<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setError(false);
    try {
      setData(await fetcher());
    } catch {
      setError(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => void load(), [load]);
  return { data, error, load, setData };
}

/** Team: who delivers which service, public bio and bookability. Mutations are OWNER-only on the API. */
export function ProviderStaffSettingsView() {
  const fa = useLocale() === "fa";
  const staff = useLoad<ProviderStaffMember[]>(providerOsService.listStaff);
  const services = useLoad<ProviderServiceDto[]>(providerOsService.listServices);
  const [message, setMessage] = useState<string | null>(null);

  async function update(run: () => Promise<unknown>) {
    setMessage(null);
    try {
      await run();
      await staff.load();
    } catch (e) {
      setMessage(e instanceof ApiError && e.code === "PROVIDER_ACCESS_DENIED" ? (fa ? "فقط مالک مجموعه می‌تواند تیم را ویرایش کند." : "Only the organization owner can edit the team.") : fa ? "ذخیره نشد." : "Could not save.");
    }
  }

  if (staff.error || services.error) return <ErrorRecovery title={fa ? "تیم بارگیری نشد" : "Team could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={staff.load} />;
  if (!staff.data || !services.data) return <Skeleton className="h-64 w-full" />;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-section-title">{fa ? "خدمات و نمایش عمومی هر عضو" : "Services and public profile per member"}</h2>
      <p className="text-sm text-text-secondary">{fa ? "اگر برای خدمتی هیچ عضوی مشخص نشود، همه اعضای قابل‌رزرو آن را ارائه می‌کنند. اطلاعات منابع انسانی اینجا ذخیره نمی‌شود." : "A service with no assigned members is offered by every bookable member. No HR data is stored here."}</p>
      {message ? <p role="alert" className="text-state-urgent">{message}</p> : null}
      {staff.data.map((m) => (
        <ContextSurface key={m.providerUserId} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold">{m.displayName}</p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={m.isBookable} onChange={(e) => void update(() => providerOsService.updateStaff(m.providerUserId, { isBookable: e.target.checked }))} />{fa ? "قابل رزرو" : "Bookable"}</label>
          </div>
          <BioEditor member={m} onSave={(publicBio, displayTitle) => update(() => providerOsService.updateStaff(m.providerUserId, { publicBio, displayTitle }))} />
          <fieldset className="flex flex-wrap gap-3 text-sm">
            <legend className="mb-1 text-text-secondary">{fa ? "خدماتی که ارائه می‌کند" : "Services delivered"}</legend>
            {services.data!.map((s) => (
              <label key={s.id} className="flex items-center gap-2">
                <input type="checkbox" checked={m.serviceIds.includes(s.id)} onChange={(e) => void update(() => providerOsService.setStaffServices(m.providerUserId, e.target.checked ? [...m.serviceIds, s.id] : m.serviceIds.filter((id) => id !== s.id)))} />
                {s.name}
              </label>
            ))}
          </fieldset>
        </ContextSurface>
      ))}
    </section>
  );
}

function BioEditor({ member, onSave }: { member: ProviderStaffMember; onSave: (bio: string | null, title: string | null) => Promise<void> }) {
  const fa = useLocale() === "fa";
  const [title, setTitle] = useState(member.displayTitle ?? "");
  const [bio, setBio] = useState(member.publicBio ?? "");
  const dirty = title !== (member.displayTitle ?? "") || bio !== (member.publicBio ?? "");
  return (
    <div className="grid gap-2 sm:grid-cols-[14rem_1fr_auto] sm:items-end">
      <Input label={fa ? "عنوان عمومی" : "Public title"} value={title} onChange={(e) => setTitle(e.target.value)} />
      <Input label={fa ? "معرفی کوتاه عمومی" : "Short public bio"} value={bio} onChange={(e) => setBio(e.target.value)} />
      <Button variant="secondary" size="sm" disabled={!dirty} onClick={() => void onSave(bio.trim() || null, title.trim() || null)}>{fa ? "ذخیره" : "Save"}</Button>
    </div>
  );
}

export function ProviderWaitlistView() {
  const locale = useLocale() as "fa" | "en";
  const fa = locale === "fa";
  const { data, error, load } = useLoad<ProviderWaitlistEntry[]>(providerOsService.listWaitlist);
  if (error) return <ErrorRecovery title={fa ? "لیست انتظار بارگیری نشد" : "Waitlist could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={load} />;
  if (!data) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title">{fa ? "لیست انتظار" : "Waitlist"}</h1>
      <p className="text-sm text-text-secondary">{fa ? "به ترتیب زمان ثبت. وقتی نوبتی لغو یا آزاد شود، فقط اولین نفر واجد شرایط خبردار می‌شود و رزرو خودکار انجام نمی‌شود." : "In order of joining. When a slot opens, only the first eligible person is notified; nothing is booked automatically."}</p>
      {data.length === 0 ? <EmptyState title={fa ? "کسی در لیست انتظار نیست" : "No one is waiting"} /> : (
        <ol className="divide-y divide-border-subtle">
          {data.map((w, i) => (
            <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
              <span><strong>{(i + 1).toLocaleString(locale)}.</strong> {w.petName} · {w.serviceName} · {formatDateTimeRange(w.windowStart, w.windowEnd, locale, "Asia/Tehran")}</span>
              <StatusLabel tone={w.status === "NOTIFIED" ? "attention" : "neutral"}>{w.status === "NOTIFIED" ? (fa ? "خبردار شد" : "Notified") : fa ? "در انتظار" : "Waiting"}</StatusLabel>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function ProviderReviewsView() {
  const locale = useLocale() as "fa" | "en";
  const fa = locale === "fa";
  const { data, error, load } = useLoad<ProviderReviewRow[]>(providerOsService.listReviews);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  async function respond(id: string) {
    setMessage(null);
    try {
      await providerOsService.respondToReview(id, drafts[id]!.trim());
      await load();
    } catch (e) {
      setMessage(e instanceof ApiError && e.code === "PROVIDER_ACCESS_DENIED" ? (fa ? "فقط مالک یا دامپزشک می‌تواند پاسخ دهد." : "Only owners or vets can respond.") : fa ? "ارسال نشد." : "Could not send.");
    }
  }

  if (error) return <ErrorRecovery title={fa ? "نظرات بارگیری نشد" : "Reviews could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={load} />;
  if (!data) return <Skeleton className="h-64 w-full" />;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title">{fa ? "نظرات مشتریان" : "Customer reviews"}</h1>
      <p className="text-sm text-text-secondary">{fa ? "فقط مشتریانی که نوبتشان انجام شده نظر می‌دهند. پاسخ شما عمومی است؛ اطلاعات پزشکی یا شخصی ننویسید." : "Only customers with a completed booking can review. Your response is public; do not include medical or personal details."}</p>
      {message ? <p role="alert" className="text-state-urgent">{message}</p> : null}
      {data.length === 0 ? <EmptyState title={fa ? "هنوز نظری ثبت نشده" : "No reviews yet"} /> : (
        <ul className="divide-y divide-border-subtle">
          {data.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 py-4">
              <p className="text-sm"><span aria-label={fa ? `${r.rating} از ۵` : `${r.rating} of 5`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span> · {r.authorName}{r.serviceName ? ` · ${r.serviceName}` : ""}{r.status === "HIDDEN" ? (fa ? " · پنهان‌شده توسط پشتیبانی" : " · hidden by support") : ""}</p>
              {r.body ? <p>{r.body}</p> : null}
              {r.providerResponse ? (
                <p className="border-s-2 border-brand-natural ps-3 text-sm text-text-secondary">{r.providerResponse}</p>
              ) : (
                <div className="flex items-end gap-2">
                  <Input label={fa ? "پاسخ عمومی" : "Public response"} value={drafts[r.id] ?? ""} onChange={(e) => setDrafts({ ...drafts, [r.id]: e.target.value })} className="flex-1" />
                  <Button variant="secondary" size="sm" disabled={!drafts[r.id]?.trim()} onClick={() => void respond(r.id)}>{fa ? "ارسال" : "Send"}</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProviderAnalyticsView() {
  const locale = useLocale() as "fa" | "en";
  const fa = locale === "fa";
  const [days, setDays] = useState(30);
  const [data, setData] = useState<ProviderAnalytics | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setError(false);
    setData(null);
    try {
      setData(await providerOsService.analytics(days));
    } catch {
      setError(true);
    }
  }, [days]);
  useEffect(() => void load(), [load]);

  const n = (v: number) => v.toLocaleString(locale);
  const stats = data
    ? [
        { label: fa ? "نوبت‌ها" : "Bookings", value: n(data.totalBookings) },
        { label: fa ? "انجام‌شده" : "Completed", value: n(data.completed) },
        { label: fa ? "نرخ انجام" : "Completion rate", value: data.completionRate === null ? "—" : `${n(data.completionRate)}٪` },
        { label: fa ? "لغو" : "Cancelled", value: n(data.cancelled) },
        { label: fa ? "عدم حضور" : "No-shows", value: n(data.noShow) },
        { label: fa ? "درآمد نوبت‌های انجام‌شده" : "Revenue from completed", value: data.revenue ? formatCurrency(data.revenue, locale) : "—" },
        { label: fa ? "میانگین امتیاز" : "Average rating", value: data.reviewAverage === null ? "—" : `${n(data.reviewAverage)} (${n(data.reviewCount)})` },
        { label: fa ? "مشتری تکراری" : "Repeat clients", value: n(data.repeatClients) },
      ]
    : [];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-page-title">{fa ? "گزارش عملکرد" : "Performance"}</h1>
        <select aria-label={fa ? "بازه" : "Period"} className="rounded border border-border-subtle bg-surface-base p-2 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[7, 30, 90, 365].map((d) => <option key={d} value={d}>{fa ? `${n(d)} روز گذشته` : `Last ${d} days`}</option>)}
        </select>
      </header>
      {error ? <ErrorRecovery title={fa ? "گزارش بارگیری نشد" : "Report could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={load} /> : null}
      {!data && !error ? <Skeleton className="h-48 w-full" /> : null}
      {data ? (
        <>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border-subtle bg-border-subtle sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="bg-surface-base p-4">
                <dt className="text-xs text-text-secondary">{s.label}</dt>
                <dd className="mt-1 text-lg font-bold">{s.value}</dd>
              </div>
            ))}
          </dl>
          <section>
            <h2 className="mb-2 font-bold">{fa ? "پرتکرارترین خدمات" : "Top services"}</h2>
            {data.topServices.length ? (
              <ol className="divide-y divide-border-subtle text-sm">
                {data.topServices.map((s) => <li key={s.serviceId} className="flex justify-between py-2"><span>{s.name}</span><span>{n(s.completed)}</span></li>)}
              </ol>
            ) : <p className="text-sm text-text-secondary">{fa ? "در این بازه نوبت انجام‌شده‌ای نیست." : "No completed bookings in this period."}</p>}
          </section>
          <p className="text-xs text-text-secondary">{fa ? "همه ارقام از نوبت‌های واقعی محاسبه می‌شوند؛ درآمد بر اساس قیمت ثبت‌شده هنگام رزرو است و تسویه مالی را نشان نمی‌دهد." : "All figures come from real bookings; revenue uses the price frozen at booking and is not a payout statement."}</p>
          <Link href="./bookings" className="text-sm text-brand-natural">{fa ? "مشاهده نوبت‌ها" : "View bookings"}</Link>
        </>
      ) : null}
    </div>
  );
}
