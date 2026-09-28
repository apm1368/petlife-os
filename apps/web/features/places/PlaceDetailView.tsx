"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { formatDay, localizeDigits, WEEKDAYS_EN, WEEKDAYS_FA } from "@/lib/date/jalali";
import { Button, ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { PetFriendlyPlaceDto } from "@petlife/types";
import { placesService } from "@/services/places.service";
import { ApiError } from "@/lib/api/client";

export function PlaceDetailView({ placeId }: { placeId: string }) {
  const t = useTranslations("places");
  const tCommon = useTranslations("common");

  const [place, setPlace] = useState<PetFriendlyPlaceDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("WRONG_DETAILS");
  const [reportDetails, setReportDetails] = useState("");
  const [reportState, setReportState] = useState<"idle" | "sent" | "duplicate" | "auth" | "error">("idle");

  async function sendReport(): Promise<void> {
    setIsActing(true);
    try {
      await placesService.report(placeId, { reason: reportReason, details: reportDetails.trim() || undefined });
      setReportState("sent");
      setReportOpen(false);
    } catch (err) {
      setReportState(err instanceof ApiError ? (err.status === 401 ? "auth" : err.status === 400 || err.status === 409 ? "duplicate" : "error") : "error");
    } finally {
      setIsActing(false);
    }
  }

  async function load() {
    setError(null);
    try {
      setPlace(await placesService.get(placeId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tCommon("genericError"));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId]);

  async function toggleFavorite(): Promise<void> {
    if (!place) return;
    setIsActing(true);
    setError(null);
    setRequiresAuth(false);
    try {
      if (place.isFavorited) {
        await placesService.removeFavorite(place.id);
      } else {
        await placesService.addFavorite(place.id);
      }
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setRequiresAuth(true);
      } else {
        setError(err instanceof ApiError ? err.message : tCommon("genericError"));
      }
    } finally {
      setIsActing(false);
    }
  }

  if (error && !place) return <ErrorRecovery title={tCommon("loading")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!place) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-page-title text-text-primary">{place.name}</h1>
        <StatusLabel tone={place.status === "VERIFIED" ? "success" : "neutral"}>{t(`category.${place.category}`)}</StatusLabel>
      </div>

      {place.status !== "VERIFIED" ? <p className="text-body text-state-urgent">{t("detail.unverified")}</p> : null}

      <ContextSurface className="flex flex-col gap-2">
        {place.imageUrls[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={place.imageUrls[0]} alt={place.name} className="h-48 w-full rounded-md object-cover" />
        ) : null}
        <p className="text-body text-text-primary">
          {place.address ?? `${place.city}, ${place.country}`}
        </p>
        {place.description ? <p className="text-body text-text-secondary">{place.description}</p> : null}
        <p className="text-metadata text-text-secondary">{place.indoorAllowed ? t("detail.indoorAllowed") : null}</p>
        <p className="text-metadata text-text-secondary">{place.outdoorAllowed ? t("detail.outdoorAllowed") : null}</p>
        {place.sizeRestrictions ? <p className="text-metadata text-text-secondary">{t("detail.sizeRestrictions", { restrictions: place.sizeRestrictions })}</p> : null}
        {place.petPolicy ? (
          <div>
            <h2 className="text-section-title text-text-primary">{t("detail.petPolicy")}</h2>
            <p className="text-body text-text-secondary">{place.petPolicy}</p>
          </div>
        ) : null}
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2" aria-label={fa ? "امکانات حیوان" : "Pet facilities"}>
          {([["leashRequired", fa ? "قلاده الزامی" : "Leash required"], ["waterAvailable", fa ? "آب برای حیوان" : "Water for pets"], ["petArea", fa ? "فضای ویژهٔ حیوان" : "Dedicated pet area"]] as const).map(([k, label]) => {
            const v = place[k];
            return <div key={k} className="flex justify-between gap-3 border-b border-border-subtle py-1.5"><dt className="text-text-secondary">{label}</dt><dd>{v === true ? (fa ? "بله" : "Yes") : v === false ? (fa ? "خیر" : "No") : fa ? "اعلام نشده" : "Not specified"}</dd></div>;
          })}
        </dl>
        {place.openingHours?.length ? (
          <div>
            <h2 className="text-sm font-bold text-text-primary">{fa ? "ساعات کار" : "Opening hours"}</h2>
            <ul className="text-sm text-text-secondary">{place.openingHours.map((h, i) => <li key={i}>{(fa ? WEEKDAYS_FA : WEEKDAYS_EN)[h.day] ?? h.day}: <span dir="ltr">{localizeDigits(`${h.open}–${h.close}`, lang)}</span></li>)}</ul>
          </div>
        ) : <p className="text-metadata text-text-secondary">{fa ? "ساعات کار: اعلام نشده" : "Opening hours: not specified"}</p>}
        {place.verifiedAt ? <p className="text-metadata text-text-secondary">{t("detail.verifiedAt", { date: formatDay(place.verifiedAt.slice(0, 10), lang) })}</p> : null}
      </ContextSurface>

      {error ? <p className="text-body text-state-urgent">{error}</p> : null}
      {requiresAuth ? <p className="text-body text-text-secondary">{t("favorites.signInPrompt")}</p> : null}

      <Button variant={place.isFavorited ? "ghost" : "primary"} isLoading={isActing} onClick={toggleFavorite}>
        {place.isFavorited ? t("detail.removeFavorite") : t("detail.addFavorite")}
      </Button>

      <Link className="text-sm underline" href={`/${lang}/travel/search?city=${encodeURIComponent(place.city)}`}>{fa ? `اقامتگاه‌های دوستدار حیوانات در ${place.city}` : `Pet-friendly stays in ${place.city}`}</Link>

      <section className="flex flex-col gap-2" aria-label={fa ? "گزارش اطلاعات نادرست" : "Report incorrect information"}>
        {reportState === "sent" ? <p role="status" className="text-sm text-state-success">{fa ? "گزارش شما ثبت شد و تیم PET LIFE بررسی می‌کند." : "Thanks — the PET LIFE team will review your report."}</p> : null}
        {reportState === "duplicate" ? <p role="alert" className="text-sm text-text-secondary">{fa ? "گزارش شما برای این مکان قبلاً ثبت شده و در حال بررسی است." : "You have already reported this place; it is being reviewed."}</p> : null}
        {reportState === "auth" ? <p role="alert" className="text-sm text-text-secondary">{fa ? "برای گزارش، وارد حساب شوید." : "Sign in to report."}</p> : null}
        {reportState === "error" ? <p role="alert" className="text-sm text-state-urgent">{fa ? "گزارش ثبت نشد." : "The report could not be sent."}</p> : null}
        {!reportOpen && reportState !== "sent" ? <Button variant="ghost" size="sm" className="w-fit" onClick={() => setReportOpen(true)}>{fa ? "اطلاعات این مکان نادرست یا قدیمی است؟" : "Is this information wrong or outdated?"}</Button> : null}
        {reportOpen ? (
          <div className="flex flex-col gap-2 rounded-md border border-border-subtle p-3">
            <label className="flex flex-col gap-1 text-sm">{fa ? "مشکل" : "Problem"}
              <select value={reportReason} onChange={(e) => setReportReason(e.target.value)} className="min-h-11 rounded-md border border-border-subtle bg-surface-base px-2">
                <option value="WRONG_DETAILS">{fa ? "اطلاعات نادرست" : "Wrong details"}</option>
                <option value="NOT_PET_FRIENDLY">{fa ? "دیگر حیوان نمی‌پذیرد" : "No longer pet-friendly"}</option>
                <option value="CLOSED_PERMANENTLY">{fa ? "برای همیشه بسته شده" : "Permanently closed"}</option>
                <option value="WRONG_LOCATION">{fa ? "مکان نادرست" : "Wrong location"}</option>
                <option value="OTHER">{fa ? "سایر" : "Other"}</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">{fa ? "توضیح (اختیاری)" : "Details (optional)"}<textarea maxLength={1000} value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} className="min-h-16 rounded-md border border-border-subtle bg-surface-base p-2" /></label>
            <div className="flex gap-2"><Button size="sm" isLoading={isActing} onClick={() => void sendReport()}>{fa ? "ارسال گزارش" : "Send report"}</Button><Button size="sm" variant="ghost" onClick={() => setReportOpen(false)}>{fa ? "انصراف" : "Cancel"}</Button></div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
