"use client";

import { useTranslations } from "next-intl";
import { ContextSurface, StatusLabel } from "@petlife/ui";
import type { ProviderBookingSummaryDto } from "@petlife/types";
import { formatAppointmentDateTime } from "@/lib/date/appointment-date";

const STATUS_TONE: Record<string, "success" | "attention" | "urgent" | "neutral"> = {
  CONFIRMED: "success",
  CHECKED_IN: "attention",
  IN_PROGRESS: "attention",
  COMPLETED: "success",
  CANCELLED_BY_USER: "urgent",
  CANCELLED_BY_PROVIDER: "urgent",
  NO_SHOW: "urgent",
  HOLD: "neutral",
  PENDING_CONFIRMATION: "neutral",
};

/** Compact booking-queue row (spec section 11) — Pet/Owner/Service/Time/Location/Booking Status/Payment Status, kept separate on purpose. */
export function ProviderBookingRow({ booking, locale, onClick }: { booking: ProviderBookingSummaryDto; locale: "fa" | "en"; onClick: () => void }) {
  const t = useTranslations("bookingDetail.status");
  const tPayment = useTranslations("bookingDetail.paymentStatus");

  return (
    <button type="button" onClick={onClick} className="w-full text-start">
      <ContextSurface className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-body font-medium text-text-primary">
            {booking.petName} — {booking.ownerDisplayName}
          </p>
          <StatusLabel tone={STATUS_TONE[booking.bookingStatus] ?? "neutral"}>{t(booking.bookingStatus)}</StatusLabel>
        </div>
        <p className="text-metadata text-text-secondary">{booking.serviceName}</p>
        <p className="text-metadata text-text-secondary">{formatAppointmentDateTime(booking.startAt, locale, booking.timezone)}</p>
        <div className="flex items-center justify-between gap-2">
          <p className="text-metadata text-text-secondary">{booking.locationLabel}</p>
          <StatusLabel tone="neutral">{tPayment(booking.paymentStatus)}</StatusLabel>
        </div>
      </ContextSurface>
    </button>
  );
}
