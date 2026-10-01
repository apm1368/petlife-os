"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import { SupportNeedStatus } from "@petlife/types";
import type { HelpOfferDto, HelpOfferStatus, SupportNeedListingDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { addDays, formatDay, localizeDigits, todayIso } from "@/lib/date/jalali";
import { DateRangeField } from "@/features/shared/date-picker/DateRangePicker";
import { ShareBar } from "@/features/shared/ShareBar";
import { supportNeedsService } from "@/services/support-needs.service";
import { SupportOfferInbox } from "./SupportOfferInbox";
import { apiErrorText } from "@/lib/errors/api-error-text";

/**
 * HELP / FULFILLMENT PATTERN — the publisher's workspace for one listing: status, progress,
 * deadline, pause/resume, and the offers inbox. Reached from "My needs" and every
 * animal-support notification.
 */
export function ManageSupportNeedView({ listingId }: { listingId: string }) {
  const t = useTranslations("supportNeeds");
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const [listing, setListing] = useState<SupportNeedListingDto | null>(null);
  const [offers, setOffers] = useState<HelpOfferDto[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "notFound" | "signIn" | "error">("loading");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [l, o] = await Promise.all([supportNeedsService.getMine(listingId), supportNeedsService.listOffers(listingId)]);
      setListing(l);
      setOffers(o);
      setState("ready");
    } catch (e) {
      setState(e instanceof ApiError ? (e.status === 401 ? "signIn" : e.status === 403 || e.status === 404 ? "notFound" : "error") : "error");
    }
  }, [listingId]);
  useEffect(() => void load(), [load]);

  const run = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusyId(id);
    setMsg(null);
    try {
      await fn();
      await load();
      setMsg({ ok: true, text: ok });
    } catch (e) {
      setMsg({ ok: false, text: apiErrorText(e, lang, fa ? "انجام نشد." : "That did not work.")});
    } finally {
      setBusyId(null);
    }
  };

  if (state === "loading") return <Skeleton className="h-64 w-full" />;
  if (state === "signIn") return <EmptyState title={fa ? "برای مدیریت این درخواست وارد شوید" : "Sign in to manage this request"} />;
  if (state === "notFound") return <EmptyState title={fa ? "این درخواست پیدا نشد" : "Request not found"} description={fa ? "فقط منتشرکننده می‌تواند آن را مدیریت کند." : "Only its publisher can manage it."} />;
  if (state === "error" || !listing || !offers) return <ErrorRecovery title={fa ? "بارگیری نشد" : "Could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Try again"} onRetry={() => void load()} />;

  const live = listing.status === SupportNeedStatus.PUBLISHED || listing.status === SupportNeedStatus.PARTIALLY_FULFILLED;
  const pct = listing.neededQuantity ? Math.min(100, Math.round((listing.fulfilledQuantity / listing.neededQuantity) * 100)) : null;
  const pending = offers.filter((o) => o.status === "PENDING").length;

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/${lang}/animal-support/needs/mine`} className="text-metadata text-text-secondary hover:underline">{fa ? "نیازهای من" : "My needs"}</Link>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusLabel tone={live ? "success" : listing.status === "REJECTED" || listing.status === "REMOVED" ? "urgent" : "neutral"}>{t(`status.${listing.status}`)}</StatusLabel>
          <span className="text-metadata text-text-secondary">{t(`category.${listing.category}`)} · {listing.city}{listing.neighborhood ? `، ${listing.neighborhood}` : ""}</span>
        </div>
        <h1 className="text-page-title text-text-primary">{listing.title}</h1>
        {listing.reviewNote ? <p className="rounded-md bg-state-attention/10 p-3 text-sm text-state-attention">{t("mine.reviewNote", { note: listing.reviewNote })}</p> : null}
      </header>
      {msg ? <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-state-success" : "text-state-urgent"}`}>{msg.text}</p> : null}

      <ContextSurface className="flex flex-col gap-3">
        <h2 className="text-section-title">{fa ? "پیشرفت" : "Progress"}</h2>
        {pct !== null ? (
          <>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-subtle" role="progressbar" aria-valuemin={0} aria-valuemax={listing.neededQuantity ?? 0} aria-valuenow={listing.fulfilledQuantity} aria-label={fa ? "پیشرفت تأمین" : "Fulfilment progress"}>
              <div className="h-full rounded-full bg-state-success" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-sm">{fa ? `${localizeDigits(listing.fulfilledQuantity, "fa")} از ${localizeDigits(listing.neededQuantity!, "fa")} ${listing.quantityUnit ?? ""} تأمین شده؛ ${localizeDigits(Math.max(0, listing.neededQuantity! - listing.fulfilledQuantity), "fa")} باقی مانده.` : `${listing.fulfilledQuantity} of ${listing.neededQuantity} ${listing.quantityUnit ?? ""} fulfilled; ${Math.max(0, listing.neededQuantity! - listing.fulfilledQuantity)} remaining.`}</p>
          </>
        ) : <p className="text-sm text-text-secondary">{fa ? "مقدار مشخصی تعیین نشده؛ پیشرفت با پیشنهادهای انجام‌شده سنجیده می‌شود." : "No fixed quantity; progress is the completed offers below."}</p>}
        <p className="text-metadata text-text-secondary">{listing.expiresAt ? (fa ? `مهلت: ${formatDay(listing.expiresAt.slice(0, 10), "fa")}` : `Deadline: ${formatDay(listing.expiresAt.slice(0, 10), "en")}`) : fa ? "بدون مهلت" : "No deadline"}</p>
        {live || listing.status === "PAUSED" ? (
          <DateRangeField mode="single" label={fa ? "تغییر مهلت" : "Change deadline"} value={{ start: listing.expiresAt?.slice(0, 10) ?? null, end: null }} onChange={(v) => void run("deadline", () => supportNeedsService.update(listing.id, { expiresAt: v.start ? new Date(`${v.start}T23:59:00+03:30`).toISOString() : null }), fa ? "مهلت به‌روز شد." : "Deadline updated.")} min={addDays(todayIso(), 1)} max={addDays(todayIso(), 180)} />
        ) : null}
        <div className="flex flex-wrap gap-2">
          {live ? <Button variant="secondary" size="sm" isLoading={busyId === "pause"} onClick={() => void run("pause", () => supportNeedsService.pause(listing.id), fa ? "متوقف شد؛ پیوند کار می‌کند ولی پیشنهاد تازه پذیرفته نمی‌شود." : "Paused; the link works but no new offers are taken.")}>{fa ? "توقف موقت" : "Pause"}</Button> : null}
          {listing.status === "PAUSED" ? <Button size="sm" isLoading={busyId === "resume"} onClick={() => void run("resume", () => supportNeedsService.resume(listing.id), fa ? "دوباره فعال شد." : "Resumed.")}>{fa ? "ادامهٔ انتشار" : "Resume"}</Button> : null}
          {live ? <Button variant="secondary" size="sm" isLoading={busyId === "fulfill"} onClick={() => void run("fulfill", () => supportNeedsService.markFulfilled(listing.id), fa ? "تأمین‌شده ثبت شد." : "Marked fulfilled.")}>{t("mine.markFulfilled")}</Button> : null}
          {listing.status !== "CLOSED" && listing.status !== "REMOVED" ? <Button variant="ghost" size="sm" isLoading={busyId === "close"} onClick={() => void run("close", () => supportNeedsService.close(listing.id), fa ? "بسته شد." : "Closed.")}>{t("mine.close")}</Button> : null}
        </div>
        {live ? <ShareBar url={`/${lang}/animal-support/needs/${listing.id}`} text={listing.title} /> : null}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-3">
        <h2 className="text-section-title">{fa ? `پیشنهادهای کمک${pending ? ` (${localizeDigits(pending, "fa")} در انتظار)` : ""}` : `Help offers${pending ? ` (${pending} waiting)` : ""}`}</h2>
        <p className="text-metadata text-text-secondary">{fa ? "اطلاعات تماس کمک‌کنندگان نمایش داده نمی‌شود؛ هماهنگی از طریق PET LIFE انجام می‌شود." : "Helpers' contact details are never shown; coordination stays in PET LIFE."}</p>
        <SupportOfferInbox offers={offers} busyId={busyId} onRespond={(offerId, status: HelpOfferStatus, quantity) => void run(offerId, () => supportNeedsService.respondToOffer(listing.id, offerId, quantity !== undefined ? { status, fulfilledQuantity: quantity } : { status }), fa ? "به‌روز شد." : "Updated.")} />
      </ContextSurface>
    </div>
  );
}
