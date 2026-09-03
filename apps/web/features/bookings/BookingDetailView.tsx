"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, ContextSurface, Dialog, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { BookingDto } from "@petlife/types";
import { formatAppointmentDateTime, formatDateTimeRange } from "@/lib/date/appointment-date";
import { bookingsService } from "@/services/bookings.service";
import { petsService } from "@/services/pets.service";

const CANCELLABLE = new Set(["HOLD", "PENDING_CONFIRMATION", "CONFIRMED"]);
const RECURRING_CATEGORIES = new Set(["WALKING", "TRAINING", "GROOMING"]);

/**
 * Generic across every service category (Handoff 04) — a booking's
 * `category` decides display copy (e.g. "Care access" instead of a
 * vet-specific "Health access"), never a different component per category.
 */
export function BookingDetailView({ bookingId }: { bookingId: string }) {
  const t = useTranslations("bookingDetail");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";
  const searchParams = useSearchParams();
  const justConfirmed = searchParams.get("confirmed") === "1";

  const [booking, setBooking] = useState<BookingDto | null>(null);
  const [petName, setPetName] = useState<string>("");
  const [error, setError] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [isStartingSeries, setIsStartingSeries] = useState(false);
  const [seriesMessage, setSeriesMessage] = useState<string | null>(null);

  async function load() {
    setError(false);
    try {
      const data = await bookingsService.getById(bookingId);
      setBooking(data);
      const pet = await petsService.getById(data.petId);
      setPetName(pet.name);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  async function cancelBooking() {
    setIsCancelling(true);
    try {
      const updated = await bookingsService.cancel(bookingId);
      setBooking(updated);
      setShowCancelDialog(false);
    } finally {
      setIsCancelling(false);
    }
  }

  async function startWeeklySeries() {
    setIsStartingSeries(true);
    try {
      const result = await bookingsService.recur(bookingId, 4);
      setSeriesMessage(t("recurring.started", { count: result.createdBookingIds.length }));
    } finally {
      setIsStartingSeries(false);
    }
  }

  if (error) return <ErrorRecovery title={tCommon("loading")} message="" retryLabel={tCommon("retry")} onRetry={load} />;
  if (!booking) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  const isCancelled = booking.bookingStatus.startsWith("CANCELLED");
  const dateTimeValue = formatDateTimeRange(booking.startAt, booking.endAt, locale, booking.timezone);

  return (
    <div className="flex flex-col gap-5">
      {justConfirmed ? (
        <ContextSurface className="flex flex-col gap-2 border-brand-mint">
          <p className="text-section-title text-text-primary">{t("confirmedBanner.title")}</p>
          <p className="text-body text-text-secondary">{t("confirmedBanner.calendarAdded")}</p>
          {booking.petAccess ? (
            <p className="text-metadata text-text-secondary">
              {t("confirmedBanner.careAccessUntil", {
                when: formatAppointmentDateTime(booking.petAccess.expiresAt, locale, booking.timezone),
              })}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => router.push(`/${locale}/care-calendar`)}>
              {t("confirmedBanner.openCalendar")}
            </Button>
          </div>
        </ContextSurface>
      ) : null}

      <div>
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        <div className="mt-2 flex gap-2">
          <StatusLabel tone={isCancelled ? "attention" : booking.bookingStatus === "CONFIRMED" ? "success" : "neutral"}>
            {t(`status.${booking.bookingStatus}`)}
          </StatusLabel>
          <StatusLabel tone="neutral">{t(`paymentStatus.${booking.paymentStatus}`)}</StatusLabel>
        </div>
      </div>

      <ContextSurface className="flex flex-col gap-3">
        <Row label={t("pet")} value={petName} />
        <Row label={t("provider")} value={booking.provider?.name ?? ""} />
        <Row label={t("service")} value={booking.service?.name ?? ""} />
        <Row
          label={t("location")}
          value={booking.customerAddress ? `${booking.customerAddress.addressLine}, ${booking.customerAddress.city}` : booking.location ? `${booking.location.addressLine}, ${booking.location.city}` : ""}
        />
        {booking.dropoffAddress ? <Row label={t("dropoffLocation")} value={`${booking.dropoffAddress.addressLine}, ${booking.dropoffAddress.city}`} /> : null}
        <Row label={t("dateTime")} value={dateTimeValue} />
        {booking.reasonForVisit ? <Row label={t("reason")} value={booking.reasonForVisit} /> : null}
        {booking.cancelledReason ? <Row label={t("cancelledReason")} value={booking.cancelledReason} /> : null}
        {booking.completionNote ? <Row label={t("completionNote")} value={booking.completionNote} /> : null}
      </ContextSurface>

      {booking.petAccess ? (
        <ContextSurface className="flex flex-col gap-2">
          <h2 className="text-section-title text-text-primary">{t("careAccess.title")}</h2>
          <Row label={t("careAccess.scope")} value={t(`careAccess.preset.${booking.petAccess.scopePreset}`)} />
          <Row label={t("careAccess.expiresAt")} value={formatAppointmentDateTime(booking.petAccess.expiresAt, locale, booking.timezone)} />
        </ContextSurface>
      ) : null}

      {!isCancelled && RECURRING_CATEGORIES.has(booking.category) && !booking.bookingSeriesId ? (
        <ContextSurface className="flex flex-col gap-2">
          <p className="text-body text-text-primary">{t("recurring.prompt")}</p>
          <Button variant="secondary" isLoading={isStartingSeries} onClick={startWeeklySeries}>
            {t("recurring.action")}
          </Button>
          {seriesMessage ? <p className="text-metadata text-text-secondary">{seriesMessage}</p> : null}
        </ContextSurface>
      ) : null}

      {CANCELLABLE.has(booking.bookingStatus) ? (
        <Button variant="secondary" onClick={() => setShowCancelDialog(true)}>
          {t("cancel")}
        </Button>
      ) : null}

      <Button variant="ghost" onClick={() => router.push(`/${locale}/support/new?relatedEntityType=BOOKING&relatedEntityId=${bookingId}&category=BOOKING`)}>
        {t("getSupport")}
      </Button>

      <Dialog open={showCancelDialog} onClose={() => setShowCancelDialog(false)} title={t("cancelDialog.title")}>
        <div className="flex flex-col gap-4">
          <p className="text-body text-text-secondary">{t("cancelDialog.body")}</p>
          {booking.petAccess ? <p className="text-metadata text-text-secondary">{t("cancelDialog.careAccessImpact")}</p> : null}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setShowCancelDialog(false)}>
              {tCommon("cancel")}
            </Button>
            <Button variant="primary" className="flex-1" isLoading={isCancelling} onClick={cancelBooking}>
              {t("cancelDialog.confirm")}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-metadata text-text-secondary">{label}</span>
      <span className="text-body text-text-primary">{value}</span>
    </div>
  );
}
