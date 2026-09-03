"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, Dialog, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import type { ProviderBookingDetailDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { providerOsService } from "@/services/provider-os.service";
import { formatAppointmentDateTime } from "@/lib/date/appointment-date";

const ACCESS_TONE: Record<string, "success" | "attention" | "neutral"> = {
  GRANTED: "success",
  NO_GRANT: "neutral",
  EXPIRED: "attention",
  REVOKED: "attention",
};

const STATUS_TONE: Record<string, "success" | "attention" | "urgent" | "neutral"> = {
  CONFIRMED: "success",
  CHECKED_IN: "attention",
  IN_PROGRESS: "attention",
  COMPLETED: "success",
  CANCELLED_BY_USER: "urgent",
  CANCELLED_BY_PROVIDER: "urgent",
};

const ERROR_KEYS = new Set([
  "PROVIDER_ACCESS_DENIED",
  "PROVIDER_NOT_VERIFIED",
  "BOOKING_NOT_FOUND",
  "INVALID_BOOKING_TRANSITION",
  "BOOKING_NOT_CANCELLABLE",
]);

function mapError(err: unknown, t: (key: string) => string): string {
  if (err instanceof ApiError && ERROR_KEYS.has(err.code)) return t(`errors.${err.code}`);
  if (err instanceof ApiError) return err.message;
  return "Something went wrong. Please try again.";
}

/**
 * Booking Detail + permissioned Pet context (spec sections 12-14) — the
 * access section always renders one of four explicit states, never a
 * boolean that hides the reason ("no invisible provider access").
 */
export function ProviderBookingDetailView({ bookingId }: { bookingId: string }) {
  const t = useTranslations("provider.bookingDetail");
  const tStatus = useTranslations("bookingDetail.status");
  const tPayment = useTranslations("bookingDetail.paymentStatus");
  const tScopePreset = useTranslations("bookingDetail.careAccess.preset");
  const tKnowledge = useTranslations("health.knowledgeState");
  const tVaccination = useTranslations("health.vaccinationStatus");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";

  const [detail, setDetail] = useState<ProviderBookingDetailDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [completionNote, setCompletionNote] = useState("");

  async function load() {
    setError(null);
    setDetail(null);
    try {
      setDetail(await providerOsService.getBooking(bookingId));
    } catch (err) {
      setError(mapError(err, t));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  async function runAction(action: () => Promise<ProviderBookingDetailDto>, successKey?: string) {
    setIsActing(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const updated = await action();
      setDetail(updated);
      if (successKey) setActionMessage(t(successKey));
    } catch (err) {
      setActionError(mapError(err, t));
    } finally {
      setIsActing(false);
    }
  }

  if (error) return <ErrorRecovery title={t("title")} message={error} retryLabel={tCommon("retry")} onRetry={load} />;
  if (!detail) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  const { booking, pet, access, careProfile, healthSummary, providerNotes } = detail;
  const isCancellable = booking.bookingStatus === "CONFIRMED" || booking.bookingStatus === "CHECKED_IN";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <StatusLabel tone={STATUS_TONE[booking.bookingStatus] ?? "neutral"}>{tStatus(booking.bookingStatus)}</StatusLabel>
          <StatusLabel tone="neutral">{tPayment(booking.paymentStatus)}</StatusLabel>
        </div>
      </div>

      <ContextSurface className="flex flex-col gap-3">
        <Row label={t("pet")} value={pet.name} />
        <Row label={t("owner")} value={booking.ownerDisplayName} />
        <Row label={t("service")} value={booking.serviceName} />
        <Row label={t("location")} value={booking.locationLabel} />
        <Row label={t("dateTime")} value={formatAppointmentDateTime(booking.startAt, locale, booking.timezone)} />
        {booking.reasonForVisit ? <Row label={t("reason")} value={booking.reasonForVisit} /> : null}
        {booking.cancelledReason ? <Row label={t("cancelledReason")} value={booking.cancelledReason} /> : null}
        {booking.completionNote ? <Row label={t("completionNote")} value={booking.completionNote} /> : null}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <h2 className="text-section-title text-text-primary">{t("access.title")}</h2>
        <StatusLabel tone={ACCESS_TONE[access.state] ?? "neutral"}>{t(`access.state.${access.state}`)}</StatusLabel>
        {access.state === "GRANTED" ? (
          <>
            <Row label={t("access.scope")} value={access.scopePreset ? tScopePreset(access.scopePreset) : ""} />
            <Row label={t("access.startsAt")} value={access.startsAt ? formatAppointmentDateTime(access.startsAt, locale, booking.timezone) : ""} />
            <Row label={t("access.expiresAt")} value={access.expiresAt ? formatAppointmentDateTime(access.expiresAt, locale, booking.timezone) : ""} />
          </>
        ) : null}
        {access.state === "GRANTED" && booking.category === "VET" ? (
          <Button variant="secondary" onClick={() => router.push(`/${locale}/provider/patients/${pet.id}`)}>
            {t("access.openClinicalRecord")}
          </Button>
        ) : null}
      </ContextSurface>

      {careProfile ? (
        <ContextSurface className="flex flex-col gap-2">
          <h2 className="text-section-title text-text-primary">{t("careProfile.title")}</h2>
          {careProfile.temperamentText ? <Row label={t("careProfile.temperament")} value={careProfile.temperamentText} /> : null}
          {careProfile.feedingRoutineText ? <Row label={t("careProfile.feeding")} value={careProfile.feedingRoutineText} /> : null}
          {careProfile.specialInstructionsText ? <Row label={t("careProfile.specialInstructions")} value={careProfile.specialInstructionsText} /> : null}
        </ContextSurface>
      ) : null}

      {healthSummary ? (
        <ContextSurface className="flex flex-col gap-2">
          <h2 className="text-section-title text-text-primary">{t("health.title")}</h2>
          <Row label={t("health.allergyState")} value={tKnowledge(healthSummary.allergyState)} />
          <Row label={t("health.vaccinationStatus")} value={tVaccination(healthSummary.vaccinationStatus)} />
        </ContextSurface>
      ) : null}

      {actionError ? <StatusLabel tone="attention">{actionError}</StatusLabel> : null}
      {actionMessage ? <StatusLabel tone="success">{actionMessage}</StatusLabel> : null}

      <div className="flex flex-wrap gap-2">
        {booking.bookingStatus === "CONFIRMED" ? (
          <Button variant="secondary" isLoading={isActing} onClick={() => runAction(() => providerOsService.confirmBooking(booking.id), "actions.confirmed")}>
            {t("actions.confirm")}
          </Button>
        ) : null}
        {booking.bookingStatus === "CONFIRMED" ? (
          <Button variant="primary" isLoading={isActing} onClick={() => runAction(() => providerOsService.checkIn(booking.id))}>
            {t("actions.checkIn")}
          </Button>
        ) : null}
        {booking.bookingStatus === "CHECKED_IN" ? (
          <Button variant="primary" isLoading={isActing} onClick={() => runAction(() => providerOsService.start(booking.id))}>
            {t("actions.start")}
          </Button>
        ) : null}
        {booking.bookingStatus === "IN_PROGRESS" ? (
          <Button variant="primary" isLoading={isActing} onClick={() => runAction(() => providerOsService.complete(booking.id, completionNote || undefined))}>
            {t("actions.complete")}
          </Button>
        ) : null}
        {isCancellable ? (
          <Button variant="ghost" onClick={() => setShowCancelDialog(true)}>
            {t("actions.cancel")}
          </Button>
        ) : null}
      </div>

      {booking.bookingStatus === "IN_PROGRESS" ? (
        <ContextSurface className="flex flex-col gap-2">
          <Input
            label={t("completionNoteLabel")}
            value={completionNote}
            onChange={(e) => setCompletionNote(e.target.value)}
            placeholder={t("completionNotePlaceholder")}
          />
        </ContextSurface>
      ) : null}

      <ContextSurface className="flex flex-col gap-3">
        <h2 className="text-section-title text-text-primary">{t("notes.title")}</h2>
        <p className="text-metadata text-text-secondary">{t("notes.internalOnly")}</p>
        <div className="flex items-end gap-2">
          <Input
            label={t("notes.label")}
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder={t("notes.placeholder")}
            className="flex-1"
          />
          <Button
            variant="secondary"
            disabled={!noteContent.trim()}
            onClick={async () => {
              await providerOsService.addNote(booking.id, noteContent.trim());
              setNoteContent("");
              await load();
            }}
          >
            {t("notes.add")}
          </Button>
        </div>
        {providerNotes.length === 0 ? (
          <p className="text-metadata text-text-secondary">{t("notes.empty")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {providerNotes.map((note) => (
              <div key={note.id} className="border-t border-border-subtle pt-2">
                <p className="text-body text-text-primary">{note.content}</p>
                <p className="text-metadata text-text-secondary">{formatAppointmentDateTime(note.createdAt, locale, booking.timezone)}</p>
              </div>
            ))}
          </div>
        )}
      </ContextSurface>

      <Dialog open={showCancelDialog} onClose={() => setShowCancelDialog(false)} title={t("cancelDialog.title")}>
        <div className="flex flex-col gap-4">
          <p className="text-body text-text-secondary">{t("cancelDialog.body")}</p>
          <Input
            label={t("cancelDialog.reasonLabel")}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder={t("cancelDialog.reasonPlaceholder")}
          />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setShowCancelDialog(false)}>
              {tCommon("cancel")}
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              isLoading={isActing}
              onClick={() =>
                runAction(() => providerOsService.cancelBooking(booking.id, cancelReason || undefined)).then(() => setShowCancelDialog(false))
              }
            >
              {t("cancelDialog.confirm")}
            </Button>
          </div>
        </div>
      </Dialog>

      <Button variant="ghost" onClick={() => router.push(`/${locale}/provider/bookings`)}>
        {t("backToQueue")}
      </Button>
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
