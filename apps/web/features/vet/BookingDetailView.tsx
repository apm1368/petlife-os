"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, ContextSurface, Dialog, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { BookingDto } from "@petlife/types";
import { formatAppointmentDateTime } from "@/lib/date/appointment-date";
import { bookingsService } from "@/services/bookings.service";
import { petsService } from "@/services/pets.service";

const CANCELLABLE = new Set(["HOLD", "PENDING_CONFIRMATION", "CONFIRMED"]);

export function BookingDetailView({ bookingId }: { bookingId: string }) {
  const t = useTranslations("vet.bookingDetail");
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

  if (error) return <ErrorRecovery title={tCommon("loading")} message="" retryLabel={tCommon("retry")} onRetry={load} />;
  if (!booking) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  const isCancelled = booking.bookingStatus.startsWith("CANCELLED");

  return (
    <div className="flex flex-col gap-5">
      {justConfirmed ? (
        <ContextSurface className="flex flex-col gap-2 border-brand-mint">
          <p className="text-section-title text-text-primary">{t("confirmedBanner.title")}</p>
          <p className="text-body text-text-secondary">{t("confirmedBanner.calendarAdded")}</p>
          {booking.healthAccess ? (
            <p className="text-metadata text-text-secondary">
              {t("confirmedBanner.healthAccessUntil", {
                when: formatAppointmentDateTime(booking.healthAccess.expiresAt, locale, booking.timezone),
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
        <Row label={t("location")} value={booking.location ? `${booking.location.addressLine}, ${booking.location.city}` : ""} />
        <Row label={t("dateTime")} value={formatAppointmentDateTime(booking.startAt, locale, booking.timezone)} />
        {booking.reasonForVisit ? <Row label={t("reason")} value={booking.reasonForVisit} /> : null}
        {booking.cancelledReason ? <Row label={t("cancelledReason")} value={booking.cancelledReason} /> : null}
      </ContextSurface>

      {booking.healthAccess ? (
        <ContextSurface className="flex flex-col gap-2">
          <h2 className="text-section-title text-text-primary">{t("healthAccess.title")}</h2>
          <Row label={t("healthAccess.scope")} value={t(`healthAccess.preset.${booking.healthAccess.scopePreset}`)} />
          <Row label={t("healthAccess.expiresAt")} value={formatAppointmentDateTime(booking.healthAccess.expiresAt, locale, booking.timezone)} />
        </ContextSurface>
      ) : null}

      {CANCELLABLE.has(booking.bookingStatus) ? (
        <Button variant="secondary" onClick={() => setShowCancelDialog(true)}>
          {t("cancel")}
        </Button>
      ) : null}

      <Dialog open={showCancelDialog} onClose={() => setShowCancelDialog(false)} title={t("cancelDialog.title")}>
        <div className="flex flex-col gap-4">
          <p className="text-body text-text-secondary">{t("cancelDialog.body")}</p>
          {booking.healthAccess ? <p className="text-metadata text-text-secondary">{t("cancelDialog.healthAccessImpact")}</p> : null}
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
